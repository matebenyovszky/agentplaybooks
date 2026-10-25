import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "@/app/api/playbooks/[guid]/audit/app";
import { getAuthenticatedUser, validateApiKey, validateUserApiKey } from "@/app/api/_shared/auth";
import { getPlaybookAccessRole } from "@/app/api/_shared/guards";
import { getServiceSupabase } from "@/app/api/_shared/supabase";
import { GENESIS_HASH, buildAuditChain, formatAuditCsv } from "@/lib/audit-chain";

vi.mock("@/app/api/_shared/auth", () => ({
  getAuthenticatedUser: vi.fn(),
  validateApiKey: vi.fn(),
  validateUserApiKey: vi.fn(),
}));

vi.mock("@/app/api/_shared/guards", () => ({
  getPlaybookAccessRole: vi.fn(),
}));

vi.mock("@/app/api/_shared/supabase", () => ({
  getServiceSupabase: vi.fn(),
}));

const PLAYBOOK = { id: "playbook-1", guid: "guid-1", user_id: "owner-1" };

const chained = buildAuditChain([
  {
    id: "a0000000-0000-4000-8000-000000000001",
    playbook_id: PLAYBOOK.id,
    operation: "secret.use",
    status: "success",
    created_at: "2026-08-19T09:12:44.000Z",
    actor_type: "owner",
    actor_id: "owner-1",
    target: "api.openai.com",
    secret_name: "OPENAI_API_KEY",
    latency_ms: 12,
  },
  {
    id: "a0000000-0000-4000-8000-000000000002",
    playbook_id: PLAYBOOK.id,
    operation: "secret.reveal",
    status: "denied",
    created_at: "2026-08-19T09:12:45.000Z",
    actor_type: "api_key",
    actor_id: "apb_live_abcd",
    error_code: "not_authorized",
    latency_ms: 0,
  },
]);

function serviceClient(options: {
  logs?: typeof chained;
  checkpoint?: Record<string, unknown> | null;
  rpc?: Record<string, unknown>;
} = {}) {
  const logs = options.logs ?? chained;
  let table = "";
  const chain: Record<string, unknown> = {};
  const pass = () => chain;
  for (const method of ["select", "eq", "like", "in", "gte", "lte", "order", "limit", "not"]) {
    chain[method] = vi.fn(pass);
  }
  chain.range = vi.fn(async () => ({ data: table === "audit_logs" ? logs : [], error: null }));
  chain.maybeSingle = vi.fn(async () => {
    if (table === "playbooks") return { data: PLAYBOOK, error: null };
    if (table === "audit_chain_checkpoints") return { data: options.checkpoint ?? null, error: null };
    return { data: null, error: null };
  });
  return {
    from: vi.fn((name: string) => {
      table = name;
      return chain;
    }),
    rpc: vi.fn(async () => ({ data: options.rpc ?? { purged: 1, playbooks: 1 }, error: null })),
  };
}

describe("audit trail API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(validateApiKey).mockResolvedValue(null);
    vi.mocked(validateUserApiKey).mockResolvedValue(null);
  });

  it("lists logs for the owner as JSON", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: "owner-1" });
    vi.mocked(getPlaybookAccessRole).mockResolvedValue("owner");
    vi.mocked(getServiceSupabase).mockReturnValue(serviceClient() as never);

    const res = await app.request("/api/playbooks/guid-1/audit?action=secret.use&since=2026-08-19T00:00:00.000Z", {
      headers: { Authorization: "Bearer session" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.logs).toHaveLength(2);
    expect(body.logs[0].hash).toBe(chained[0].hash);
  });

  it("exports JSONL and CSV with the hash columns", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: "owner-1" });
    vi.mocked(getPlaybookAccessRole).mockResolvedValue("owner");
    vi.mocked(getServiceSupabase).mockReturnValue(serviceClient() as never);

    const jsonl = await app.request("/api/playbooks/guid-1/audit/export", {
      headers: { Authorization: "Bearer session" },
    });
    expect(jsonl.status).toBe(200);
    expect(jsonl.headers.get("Content-Type")).toContain("ndjson");
    const lines = (await jsonl.text()).trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).operation).toBe("secret.use");

    const csv = await app.request("/api/playbooks/guid-1/audit?format=csv", {
      headers: { Authorization: "Bearer session" },
    });
    const csvText = await csv.text();
    expect(csvText).toBe(formatAuditCsv(chained));
  });

  it("verifies a healthy chain and reports the first broken link", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: "owner-1" });
    vi.mocked(getPlaybookAccessRole).mockResolvedValue("owner");
    vi.mocked(getServiceSupabase).mockReturnValue(serviceClient() as never);

    const ok = await app.request("/api/playbooks/guid-1/audit/verify", {
      headers: { Authorization: "Bearer session" },
    });
    expect(ok.status).toBe(200);
    await expect(ok.json()).resolves.toMatchObject({ ok: true, checked: 2, start_hash: GENESIS_HASH });

    const tampered = chained.map((row) => ({ ...row }));
    tampered[1] = { ...tampered[1], prev_hash: GENESIS_HASH };
    vi.mocked(getServiceSupabase).mockReturnValue(serviceClient({ logs: tampered }) as never);
    const broken = await app.request("/api/playbooks/guid-1/audit/verify", {
      headers: { Authorization: "Bearer session" },
    });
    expect(broken.status).toBe(409);
    const report = await broken.json();
    expect(report.ok).toBe(false);
    expect(report.first_broken_link).toMatchObject({ index: 1, reason: "prev_hash" });
  });

  it("lets an auditor read the trail and refuses an editor", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: "auditor-1" });
    vi.mocked(getPlaybookAccessRole).mockResolvedValue("auditor");
    vi.mocked(getServiceSupabase).mockReturnValue(serviceClient() as never);
    const allowed = await app.request("/api/playbooks/guid-1/audit", {
      headers: { Authorization: "Bearer session" },
    });
    expect(allowed.status).toBe(200);

    vi.mocked(getPlaybookAccessRole).mockResolvedValue("editor");
    const denied = await app.request("/api/playbooks/guid-1/audit", {
      headers: { Authorization: "Bearer session" },
    });
    expect(denied.status).toBe(404);
  });

  it("does not claim to verify a truncated large audit trail", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: "owner-1" });
    vi.mocked(getPlaybookAccessRole).mockResolvedValue("owner");
    vi.mocked(getServiceSupabase).mockReturnValue(serviceClient({ logs: Array(500).fill(chained[0]) }) as never);
    const response = await app.request("/api/playbooks/guid-1/audit/verify");
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("operator") });
  });

  it("purges for the owner via the SQL function", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: "owner-1" });
    vi.mocked(getPlaybookAccessRole).mockResolvedValue("owner");
    const client = serviceClient({ rpc: { purged: 4, playbooks: 1 } });
    vi.mocked(getServiceSupabase).mockReturnValue(client as never);

    const res = await app.request("/api/playbooks/guid-1/audit/purge", {
      method: "POST",
      headers: { Authorization: "Bearer session", "Content-Type": "application/json" },
      body: JSON.stringify({ days: 90 }),
    });
    expect(res.status).toBe(200);
    expect(client.rpc).toHaveBeenCalledWith("purge_audit_logs", expect.objectContaining({
      p_playbook_id: "playbook-1",
      p_actor_type: "owner",
    }));
  });

  it("does not let an auditor purge", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: "auditor-1" });
    vi.mocked(getPlaybookAccessRole).mockResolvedValue("auditor");
    vi.mocked(getServiceSupabase).mockReturnValue(serviceClient() as never);
    const res = await app.request("/api/playbooks/guid-1/audit/purge", {
      method: "POST",
      headers: { Authorization: "Bearer session", "Content-Type": "application/json" },
      body: JSON.stringify({ days: 90 }),
    });
    expect(res.status).toBe(403);
  });
});
