import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "@/app/api/playbooks/[guid]/audit/app";
import { getAuthenticatedUser, validateApiKey, validateUserApiKey } from "@/app/api/_shared/auth";
import { getPlaybookAccessRole } from "@/app/api/_shared/guards";
import { getServiceSupabase } from "@/app/api/_shared/supabase";
import { GENESIS_HASH, buildAuditChain, formatAuditCsv } from "@/lib/audit-chain";
import JSZip from "jszip";
import { createHash } from "node:crypto";

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
  checkpointError?: boolean;
} = {}) {
  const logs = options.logs ?? chained;
  let table = "";
  let limit = Infinity;
  const chain: Record<string, unknown> = {};
  const pass = () => chain;
  for (const method of ["select", "eq", "like", "in", "gte", "lte", "order", "limit", "not"]) {
    chain[method] = vi.fn(pass);
  }
  chain.limit = vi.fn((value: number) => { limit = value; return chain; });
  chain.then = (resolve: (value: unknown) => unknown) => resolve({ data: table === "audit_logs" ? logs.slice(0, limit) : [], error: null });
  chain.range = vi.fn(async () => ({ data: table === "audit_logs" ? logs : [], error: null }));
  chain.maybeSingle = vi.fn(async () => {
    if (table === "playbooks") return { data: PLAYBOOK, error: null };
    if (table === "audit_chain_checkpoints") return { data: options.checkpoint ?? null, error: options.checkpointError ? { message: "unavailable" } : null };
    return { data: null, error: null };
  });
  return {
    from: vi.fn((name: string) => {
      table = name;
      limit = Infinity;
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
    const client = serviceClient({ logs: Array(501).fill(chained[0]) });
    vi.mocked(getServiceSupabase).mockReturnValue(client as never);
    const response = await app.request("/api/playbooks/guid-1/audit/verify");
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("operator") });
    expect(client.from.mock.calls.filter(([table]) => table === "audit_logs")).toHaveLength(1);
  });

  it("downloads an auditor ZIP whose checksums and chain match the exported rows", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: "auditor-1" });
    vi.mocked(getPlaybookAccessRole).mockResolvedValue("auditor");
    // Retained rows start from the checkpoint, not genesis; input order is not chain order.
    const checkpoint = { anchor_hash: chained[0].hash, purged_count: 1 };
    vi.mocked(getServiceSupabase).mockReturnValue(serviceClient({ logs: [chained[1]], checkpoint }) as never);
    const res = await app.request("/api/playbooks/guid-1/audit/bundle");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    expect(res.headers.get("Content-Disposition")).toContain("attachment");
    const zip = await JSZip.loadAsync(await res.arrayBuffer());
    const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
    expect(manifest).toMatchObject({ playbook_id: PLAYBOOK.id, row_count: 1, doctor: { included: false } });
    for (const file of manifest.files) {
      const content = await zip.file(file.name)!.async("nodebuffer");
      expect(createHash("sha256").update(content).digest("hex")).toBe(file.sha256);
      expect(content.byteLength).toBe(file.bytes);
    }
    const rows = (await zip.file("audit.jsonl")!.async("string")).trim().split("\n").map((line) => JSON.parse(line));
    expect(rows).toHaveLength(1);
    expect(rows[0].hash).toBe(chained[1].hash);
    const report = JSON.parse(await zip.file("verification.json")!.async("string"));
    expect(report).toMatchObject({ ok: true, checked: 1, start_hash: chained[0].hash, checkpoint });
    expect(Object.keys(zip.files)).toHaveLength(6);
  });

  it("refuses filtered, damaged and oversized bundles rather than presenting partial evidence", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: "owner-1" });
    vi.mocked(getPlaybookAccessRole).mockResolvedValue("owner");
    vi.mocked(getServiceSupabase).mockReturnValue(serviceClient() as never);
    expect((await app.request("/api/playbooks/guid-1/audit/bundle?limit=1")).status).toBe(400);
    const damaged = chained.map((row) => ({ ...row, status: "tampered" }));
    vi.mocked(getServiceSupabase).mockReturnValue(serviceClient({ logs: damaged }) as never);
    expect((await app.request("/api/playbooks/guid-1/audit/bundle")).status).toBe(409);
    vi.mocked(getServiceSupabase).mockReturnValue(serviceClient({ logs: Array(501).fill(chained[0]) }) as never);
    const oversized = await app.request("/api/playbooks/guid-1/audit/bundle");
    expect(oversized.status).toBe(413);
    expect(await oversized.text()).toContain("no partial bundle");
  });

  it("bundles exactly 500 rows and rejects 501 before loading their contents", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: "owner-1" });
    vi.mocked(getPlaybookAccessRole).mockResolvedValue("owner");
    const logs = buildAuditChain(Array.from({ length: 500 }, (_, index) => ({
      ...chained[0], id: `event-${index}`,
    })));
    vi.mocked(getServiceSupabase).mockReturnValue(serviceClient({ logs }) as never);
    const response = await app.request("/api/playbooks/guid-1/audit/bundle");
    expect(response.status).toBe(200);
    const zip = await JSZip.loadAsync(await response.arrayBuffer());
    const report = JSON.parse(await zip.file("verification.json")!.async("string"));
    expect(report).toMatchObject({ ok: true, checked: 500 });

    const client = serviceClient({ logs: [...logs, chained[0]] });
    vi.mocked(getServiceSupabase).mockReturnValue(client as never);
    const oversized = await app.request("/api/playbooks/guid-1/audit/bundle");
    expect(oversized.status).toBe(413);
    expect(client.from.mock.calls.filter(([table]) => table === "audit_logs")).toHaveLength(1);
  });

  it("fails closed when the checkpoint cannot be read or the caller is an editor", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: "owner-1" });
    vi.mocked(getPlaybookAccessRole).mockResolvedValue("owner");
    vi.mocked(getServiceSupabase).mockReturnValue(serviceClient({ checkpointError: true }) as never);
    expect((await app.request("/api/playbooks/guid-1/audit/bundle")).status).toBe(500);
    vi.mocked(getPlaybookAccessRole).mockResolvedValue("editor");
    expect((await app.request("/api/playbooks/guid-1/audit/bundle")).status).toBe(404);
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);
    expect((await app.request("/api/playbooks/guid-1/audit/bundle")).status).toBe(401);
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
