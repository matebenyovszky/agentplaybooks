import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ credential: vi.fn(), decrypt: vi.fn(), audit: vi.fn(), select: vi.fn() }));
vi.mock("@/app/api/_shared/auth", async original => ({
  ...await original<typeof import("@/app/api/_shared/auth")>(),
  validatePlaybookCredential: mocks.credential,
  storedDisplayPrefix: vi.fn(async () => null),
}));
vi.mock("@/app/api/_shared/public-mcp-tools", async original => ({
  ...await original<typeof import("@/app/api/_shared/public-mcp-tools")>(),
  isAnonymousPublicRequest: vi.fn(async () => false),
}));
vi.mock("@/lib/crypto", () => ({ decryptSecret: mocks.decrypt, encryptSecret: vi.fn() }));
vi.mock("@/app/api/_shared/audit", async original => ({
  ...await original<typeof import("@/app/api/_shared/audit")>(),
  recordSecretAudit: mocks.audit,
  flushSecretAudit: vi.fn(),
}));
vi.mock("@/app/api/_shared/supabase", () => ({ getSupabase: () => database, getServiceSupabase: () => database }));
import { POST } from "@/app/api/mcp/[guid]/route";
import { secretCapabilities } from "@/lib/secret-capabilities";

const playbook = { id: "pb", user_id: "owner", name: "Test" };
let secret: Record<string, unknown> | null;
let queryError: object | null;
const database = { from(table: string) {
  const builder = {
    select: mocks.select.mockImplementation(() => builder),
    eq: () => builder,
    update: () => builder,
    maybeSingle: async () => ({ data: table === "playbooks" ? playbook : secret, error: table === "secrets" ? queryError : null }),
    single: async () => ({ data: secret, error: queryError }),
    order: async () => ({ data: secret ? [Object.fromEntries(Object.entries(secret).filter(([key]) => !["encrypted_value", "iv", "auth_tag"].includes(key)))] : [], error: queryError }),
  };
  return builder;
} };
async function call(name: string, args: object = {}) {
  const response = await POST(new Request("https://example.test/api/mcp/test", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  }));
  return { response, body: await response.json() };
}
beforeEach(() => {
  vi.clearAllMocks();
  queryError = null;
  secret = { id: "s", name: "LOGIN", category: "password", allow_api_key_reveal: false, expires_at: null,
    allowed_hosts: ["api.example.com"], encrypted_value: "CIPHER", iv: "IV", auth_tag: "TAG" };
  mocks.credential.mockResolvedValue({ kind: "session", userId: "owner", playbooks: playbook });
  mocks.decrypt.mockResolvedValue("RAW_TEST_VALUE");
  mocks.audit.mockResolvedValue(true);
});

describe("MCP secret policy diagnostics and optional reveal", () => {
  it("reports metadata and policy without decrypting anything", async () => {
    const { body } = await call("list_secrets");
    expect(body.result.structuredContent.secrets[0]).toMatchObject({ allow_api_key_reveal: false, allowed_hosts: ["api.example.com"], capabilities: { proxy: { allowed: true }, reveal: { supported: true, allowed: false, reason: "proxy_only" } } });
    expect(mocks.select).toHaveBeenCalledWith(expect.stringContaining("allow_api_key_reveal, allowed_hosts"));
    expect(mocks.select.mock.calls.flat().join()).not.toContain("encrypted_value");
    expect(mocks.decrypt).not.toHaveBeenCalled();
    expect(JSON.stringify(body)).not.toMatch(/CIPHER|RAW_TEST_VALUE|auth_tag/);
  });

  it("distinguishes absence, disabled reveal and unknown existence without decrypting", async () => {
    const disabled = await call("get_secret_status", { secret_name: "LOGIN" });
    expect(disabled.body.result.content[0].text).toContain('"exists": true');
    expect(disabled.body.result.content[0].text).toContain('"reason": "proxy_only"');
    expect(mocks.select).toHaveBeenCalledWith("name, category, expires_at, allow_api_key_reveal, allowed_hosts");
    expect(mocks.select.mock.calls.flat().join()).not.toContain("encrypted_value");
    secret = null;
    const missing = await call("get_secret_status", { secret_name: "LOGIN" });
    expect(JSON.parse(missing.body.result.content[0].text)).toMatchObject({ exists: false, reason: "secret_not_found" });
    mocks.credential.mockResolvedValueOnce(null);
    const denied = await call("get_secret_status", { secret_name: "LOGIN" });
    expect(denied.body.error.data).toMatchObject({ reason: "secrets_read_required", existence: "unknown" });
    queryError = { message: "PRIVATE_LOOKUP_FAILURE" };
    const unavailable = await call("get_secret_status", { secret_name: "LOGIN" });
    expect(unavailable.body.error.data).toMatchObject({ reason: "secret_metadata_query_failed", existence: "unknown" });
    expect(mocks.decrypt).not.toHaveBeenCalled();
  });

  it("keeps the direct playbook MCP's legacy schema discovery response", async () => {
    const legacy = await call("find_tools", { query: "list_secrets" });
    expect(legacy.body.result.structuredContent.matches[0]).toMatchObject({ name: "list_secrets", inputSchema: { type: "object" } });
    const compact = await call("find_tools", { query: "list_secrets", include_schemas: false });
    expect(compact.body.result.structuredContent.matches[0].inputSchema).toBeUndefined();
  });

  it("applies the opt-in even to owner OAuth and distinguishes expiry", async () => {
    const denied = await call("reveal_secret", { secret_name: "LOGIN" });
    expect(denied.body.error.data).toMatchObject({ reason: "proxy_only", phase: "server_tool_execution" });
    expect(denied.body.error.data.next_steps.length).toBeGreaterThan(0);
    expect(mocks.decrypt).not.toHaveBeenCalled();
    secret!.allow_api_key_reveal = true;
    secret!.expires_at = "2020-01-01T00:00:00Z";
    expect((await call("reveal_secret", { secret_name: "LOGIN" })).body.error.data.reason).toBe("expired");
    expect(mocks.decrypt).not.toHaveBeenCalled();
    expect(secretCapabilities({ allow_api_key_reveal: true, expires_at: "invalid" }).proxy.allowed).toBe(false);
  });

  it("classifies proxy expiry independently of reveal policy", async () => {
    secret!.expires_at = "2020-01-01T00:00:00Z";
    const failed = await call("use_secret", { secret_name: "LOGIN", url: "https://api.example.com" });
    expect(failed.body.error.data.reason).toBe("expired");
    expect(mocks.decrypt).not.toHaveBeenCalled();
    const capability = secretCapabilities(secret!);
    expect(capability.proxy.allowed).toBe(false);
    expect(capability.reveal.reason).toBe("proxy_only");
  });

  it("reveals only after authorization and a successful audit write", async () => {
    secret!.allow_api_key_reveal = true;
    const { response, body } = await call("reveal_secret", { secret_name: "LOGIN" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body.result.content[0].text).toContain("RAW_TEST_VALUE");
    expect(body.result.content[0].text).not.toContain("CIPHER");
    expect(mocks.credential).toHaveBeenCalledWith(expect.any(Request), "test", "secrets:read");
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ playbookId: "pb", actor: { type: "owner", id: "owner" } }), { operation: "secret.reveal", status: "success", secretName: "LOGIN" });
    mocks.audit.mockResolvedValue(false);
    const failed = await call("reveal_secret", { secret_name: "LOGIN" });
    expect(failed.body.error.data.reason).toBe("audit_unavailable");
    expect(JSON.stringify(failed.body)).not.toContain("RAW_TEST_VALUE");
  });

  it("distinguishes permission, missing record, database and decryption failures", async () => {
    mocks.credential.mockResolvedValueOnce(null);
    expect((await call("list_secrets")).body.error.data.reason).toBe("secrets_read_required");
    expect(mocks.select).not.toHaveBeenCalledWith(expect.stringContaining("allow_api_key_reveal"));
    mocks.credential.mockResolvedValueOnce(null);
    expect((await call("reveal_secret", { secret_name: "LOGIN" })).body.error.data.reason).toBe("secrets_read_required");
    secret = null;
    expect((await call("reveal_secret", { secret_name: "LOGIN" })).body.error.data.reason).toBe("secret_not_found");
    queryError = { message: "PRIVATE_DB_DETAIL" };
    const failure = await call("reveal_secret", { secret_name: "LOGIN" });
    expect(failure.body.error.data.reason).toBe("secret_query_failed");
    expect(JSON.stringify(failure.body)).not.toContain("PRIVATE_DB_DETAIL");
    queryError = null;
    secret = { id: "s", name: "LOGIN", allow_api_key_reveal: true };
    mocks.decrypt.mockRejectedValue(new Error("PRIVATE_CRYPTO_DETAIL"));
    const cryptoFailure = await call("reveal_secret", { secret_name: "LOGIN" });
    expect(cryptoFailure.body.error.data.reason).toBe("secret_decryption_failed");
    expect(JSON.stringify(cryptoFailure.body)).not.toContain("PRIVATE_CRYPTO_DETAIL");
  });
});
