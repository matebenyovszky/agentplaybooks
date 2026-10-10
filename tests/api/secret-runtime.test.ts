import { beforeEach, describe, expect, it, vi } from "vitest";

const { db, apiKey, playbook, user, tls, decrypt } = vi.hoisted(() => ({
  db: vi.fn(), apiKey: vi.fn(), playbook: vi.fn(), user: vi.fn(), tls: vi.fn(), decrypt: vi.fn(),
}));
vi.mock("@/app/api/_shared/supabase", () => ({ getServiceSupabase: db }));
vi.mock("@/app/api/_shared/auth", () => ({
  validateApiKey: apiKey, getAuthenticatedUser: user,
  presentedApiKey: (request: Request) => request.headers.get("Authorization") || request.headers.get("X-API-Key"),
}));
vi.mock("@/app/api/_shared/guards", () => ({ getPlaybookByGuid: playbook }));
vi.mock("@/lib/mtls", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/mtls")>(), verifiedClientFingerprint: tls,
}));
vi.mock("@/lib/crypto", () => ({ decryptSecret: decrypt }));
import { app } from "@/app/api/playbooks/[guid]/secrets/resolve/app";
import { app as management } from "@/app/api/playbooks/[guid]/secret-clients/app";

const clientId = "00000000-0000-4000-8000-000000000001";
const ownerId = "owner";
const fingerprint = "ab".repeat(32);
const record = (name: string, overrides = {}) => ({
  id: name, name, playbook_id: "pb", encrypted_value: "ciphertext", iv: "iv", auth_tag: "tag",
  allow_api_key_reveal: true, expires_at: null, use_count: 0, ...overrides,
});
type Row = Record<string, unknown>;
let rows: Row[];
let certificateClient: Row | null;
let queries: Record<string, ReturnType<typeof query>>;
let dbPlaybook: Row | null;
let createError: { code: string } | null;

function query(table: string) {
  const result = () => ({ data: table === "secrets" ? rows : table === "playbooks" ? dbPlaybook : certificateClient, error: null });
  const chain = {
    select: vi.fn(), eq: vi.fn(), in: vi.fn(), update: vi.fn(), insert: vi.fn(), order: vi.fn(),
    maybeSingle: vi.fn(async () => result()),
    single: vi.fn(async () => ({ data: certificateClient, error: createError })),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
  };
  for (const fn of [chain.select, chain.eq, chain.in, chain.update, chain.insert, chain.order]) fn.mockReturnValue(chain);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  rows = [record("DATABASE_URL"), record("TOKEN")];
  certificateClient = { id: clientId, certificate_sha256: fingerprint, secret_names: ["DATABASE_URL", "TOKEN"], expires_at: null, is_active: true };
  dbPlaybook = { id: "pb", user_id: ownerId };
  createError = null;
  queries = {};
  db.mockReturnValue({ from: (table: string) => queries[table] ??= query(table) });
  apiKey.mockResolvedValue({ id: "key", playbooks: { id: "pb" }, key_prefix: "apb_prefix" });
  playbook.mockResolvedValue({ id: "pb", user_id: ownerId });
  user.mockResolvedValue({ id: ownerId });
  tls.mockReturnValue(fingerprint);
  decrypt.mockImplementation(async (row: Row) => `value-for-${row.name}`);
});

function resolve(body: unknown = { names: ["DATABASE_URL", "TOKEN"] }, headers: Record<string, string> = { Authorization: "Bearer apb_test" }) {
  return app.request("/api/playbooks/guid/secrets/resolve", {
    method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
  });
}

describe("runtime secret loading", () => {
  it("loads a batch using the existing scoped API key and records names only", async () => {
    const response = await resolve();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ values: { DATABASE_URL: "value-for-DATABASE_URL", TOKEN: "value-for-TOKEN" }, missing_optional: [] });
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(apiKey).toHaveBeenCalledWith(expect.any(Request), "secrets:read");
    expect(queries.secrets.eq).toHaveBeenCalledWith("playbook_id", "pb");
    expect(JSON.stringify(queries.audit_logs.insert.mock.calls)).not.toContain("value-for-");
    expect(queries.audit_logs.insert.mock.calls).toHaveLength(2);
  });
  it("rejects wrong-playbook and missing API credentials before reading secrets", async () => {
    playbook.mockResolvedValue({ id: "other", user_id: ownerId });
    expect((await resolve()).status).toBe(401);
    expect(queries.secrets).toBeUndefined();
    apiKey.mockResolvedValue(null);
    expect((await resolve()).status).toBe(401);
    expect(tls).not.toHaveBeenCalled();
  });
  it("loads an explicit certificate scope and records the client identity", async () => {
    const response = await resolve({ names: ["DATABASE_URL", "TOKEN"], auth_mode: "mtls" }, {});
    expect(response.status).toBe(200);
    expect(apiKey).not.toHaveBeenCalled();
    expect(queries.secret_clients.eq).toHaveBeenCalledWith("playbook_id", "pb");
    expect(queries.secret_clients.eq).toHaveBeenCalledWith("certificate_sha256", fingerprint);
    expect(queries.secret_clients.eq).toHaveBeenCalledWith("is_active", true);
    expect(queries.audit_logs.insert).toHaveBeenCalledWith(expect.objectContaining({ actor_type: "mtls", actor_id: clientId }));
    expect(queries.secret_clients.update).toHaveBeenCalledWith({ last_used_at: expect.any(String) });
  });
  it("does not fall back to a bearer key in mTLS mode", async () => {
    expect((await resolve({ names: ["TOKEN"], auth_mode: "mtls" })).status).toBe(401);
    expect(apiKey).not.toHaveBeenCalled();
  });
  it("rejects absent TLS verification, unregistered/revoked and expired clients", async () => {
    tls.mockReturnValue(null);
    expect((await resolve({ names: ["TOKEN"], auth_mode: "mtls" }, { "Client-Cert": "spoof", "Cf-Cert-Verified": "SUCCESS" })).status).toBe(401);
    tls.mockReturnValue(fingerprint);
    certificateClient = null;
    expect((await resolve({ names: ["TOKEN"], auth_mode: "mtls" }, {})).status).toBe(401);
    certificateClient = { id: clientId, expires_at: "2000-01-01T00:00:00Z" };
    expect((await resolve({ names: ["TOKEN"], auth_mode: "mtls" }, {})).status).toBe(401);
    expect(decrypt).not.toHaveBeenCalled();
  });
  it("refuses names outside the certificate scope, including optional ones", async () => {
    certificateClient!.secret_names = ["DATABASE_URL"];
    const response = await resolve({ names: ["DATABASE_URL"], optional_names: ["TOKEN"], auth_mode: "mtls" }, {});
    expect(response.status).toBe(403);
    expect(queries.secrets).toBeUndefined();
    expect(decrypt).not.toHaveBeenCalled();
  });
  it.each([
    [record("DATABASE_URL")],
    [record("DATABASE_URL"), record("TOKEN", { allow_api_key_reveal: false })],
    [record("DATABASE_URL"), record("TOKEN", { expires_at: "2000-01-01T00:00:00Z" })],
  ])("returns no values when a required secret is missing or blocked", async (...fixture) => {
    rows = fixture;
    const response = await resolve();
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain("value-for-");
    expect(decrypt).not.toHaveBeenCalled();
  });
  it("tolerates missing optional names but not prohibited reveal", async () => {
    rows = [record("DATABASE_URL")];
    const response = await resolve({ names: ["DATABASE_URL"], optional_names: ["OPTIONAL"] });
    expect(response.status).toBe(200);
    expect((await response.json()).missing_optional).toEqual(["OPTIONAL"]);
    rows.push(record("OPTIONAL", { allow_api_key_reveal: false }));
    expect((await resolve({ names: ["DATABASE_URL"], optional_names: ["OPTIONAL"] })).status).toBe(403);
  });
  it("does not return partial plaintext on a decryption failure", async () => {
    decrypt.mockResolvedValueOnce("private-plaintext").mockRejectedValueOnce(new Error("private-error"));
    const response = await resolve();
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private-");
    expect(queries.secrets.update).not.toHaveBeenCalled();
  });
  it.each([{ names: [] }, { names: ["A", "A"] }, { names: ["A"], optional_names: ["A"] },
    { names: ["A"], auth_mode: "unknown" }, { names: ["bad/path"] },
    { names: Array.from({ length: 101 }, (_, i) => `KEY_${i}`) }])("rejects malformed requests", async body => {
    expect((await resolve(body)).status).toBe(400);
    expect(apiKey).not.toHaveBeenCalled();
  });
});

describe("owner certificate registration", () => {
  const endpoint = "/api/playbooks/guid/secret-clients";
  function register(overrides = {}) {
    return management.request(endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Import service", certificate_sha256: fingerprint, secret_names: ["TOKEN"], ...overrides }) });
  }
  it("registers metadata only and binds it to the verified owner", async () => {
    expect((await register()).status).toBe(201);
    expect(queries.playbooks.eq).toHaveBeenCalledWith("user_id", ownerId);
    expect(queries.secret_clients.insert).toHaveBeenCalledWith(expect.objectContaining({ playbook_id: "pb", secret_names: ["TOKEN"] }));
  });
  it("requires ownership for reads, creation, and revocation", async () => {
    dbPlaybook = null;
    expect((await register()).status).toBe(403);
    expect((await management.request(endpoint)).status).toBe(403);
    expect((await management.request(`${endpoint}/${clientId}`, { method: "DELETE" })).status).toBe(403);
    expect(queries.secret_clients).toBeUndefined();
  });
  it("refuses API-key-only management and validates scope and expiry", async () => {
    user.mockResolvedValue(null);
    expect((await register()).status).toBe(403);
    user.mockResolvedValue({ id: ownerId });
    expect((await register({ secret_names: [] })).status).toBe(400);
    expect((await register({ certificate_sha256: "invalid" })).status).toBe(400);
    expect((await register({ expires_at: "2000-01-01T00:00:00Z" })).status).toBe(400);
    expect((await register({ expires_at: "invalid" })).status).toBe(400);
  });
  it("reports duplicates and scopes revocation to the owned playbook", async () => {
    createError = { code: "23505" };
    expect((await register()).status).toBe(409);
    expect((await management.request(`${endpoint}/${clientId}`, { method: "DELETE" })).status).toBe(200);
    expect(queries.secret_clients.update).toHaveBeenCalledWith({ is_active: false });
    expect(queries.secret_clients.eq).toHaveBeenCalledWith("id", clientId);
    expect(queries.secret_clients.eq).toHaveBeenCalledWith("playbook_id", "pb");
  });
});
