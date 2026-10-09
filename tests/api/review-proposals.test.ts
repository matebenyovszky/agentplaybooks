import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as mcpPost } from "@/app/api/mcp/[guid]/route";
import { PUT as memoryPut } from "@/app/api/playbooks/[guid]/memory/[key]/route";
import { GET as proposalsGet } from "@/app/api/playbooks/[guid]/proposals/route";
import { POST as proposalPost } from "@/app/api/playbooks/[guid]/proposals/[id]/route";
import { getServiceSupabase, getSupabase } from "@/app/api/_shared/supabase";
import {
  getAuthenticatedUser,
  validateApiKey,
  validatePlaybookCredential,
  validateUserApiKey,
} from "@/app/api/_shared/auth";
import { checkPlaybookWriteAccess } from "@/app/api/_shared/guards";

/**
 * A key with memory:propose or skills:propose suggests a change instead of
 * making it. These pin that such a key never touches memories or skills, that
 * its suggestion lands as a pending proposal, and that only a reviewer — the
 * owner, an editor, or a key that may write that area — applies or discards it.
 */

vi.mock("@/app/api/_shared/supabase", () => ({ getSupabase: vi.fn(), getServiceSupabase: vi.fn() }));
vi.mock("@/app/api/_shared/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/api/_shared/auth")>()),
  canAccessPrivatePlaybook: vi.fn(async () => false),
  validatePlaybookCredential: vi.fn(),
  validateApiKey: vi.fn(),
  validateUserApiKey: vi.fn(async () => null),
  getAuthenticatedUser: vi.fn(async () => null),
  requireAuth: vi.fn(async () => null),
}));
vi.mock("@/app/api/_shared/guards", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/api/_shared/guards")>()),
  checkPlaybookWriteAccess: vi.fn(async () => false),
}));
vi.mock("@/lib/mcp/federation", () => ({
  federatedTools: vi.fn().mockResolvedValue([]),
  federatedResources: vi.fn().mockResolvedValue([]),
  callFederatedTool: vi.fn(),
  readFederatedResource: vi.fn(),
}));

const PB = "00000000-0000-4000-8000-000000000003";
const playbook = {
  id: PB, guid: "team-guid", user_id: "owner-1", name: "Team", description: null, visibility: "public",
  config: {}, persona_name: null, persona_system_prompt: null, persona_metadata: null, instructions: null,
};

type Call = { table: string; op: string; payload?: Record<string, unknown>; filters: unknown[][] };
let calls: Call[] = [];
let rows: (call: Call) => unknown = () => null;

function client() {
  return {
    from(table: string) {
      const call: Call = { table, op: "select", filters: [] };
      calls.push(call);
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.insert = (payload: Record<string, unknown>) => { call.op = "insert"; call.payload = payload; return builder; };
      builder.upsert = (payload: Record<string, unknown>) => { call.op = "upsert"; call.payload = payload; return builder; };
      builder.update = (payload: Record<string, unknown>) => { call.op = "update"; call.payload = payload; return builder; };
      builder.delete = () => { call.op = "delete"; return builder; };
      for (const method of ["eq", "is", "ilike", "in", "neq", "not", "overlaps", "gte", "lte"]) {
        builder[method] = (...args: unknown[]) => { call.filters.push([method, ...args]); return builder; };
      }
      for (const method of ["order", "limit", "range"]) builder[method] = () => builder;
      const result = async () => ({ data: rows(call), error: null });
      builder.single = result;
      builder.maybeSingle = result;
      builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => result().then(resolve, reject);
      return builder;
    },
  };
}

const writes = (table: string) => calls.filter((c) => c.table === table && c.op !== "select");

function rpc(name: string, args: Record<string, unknown>) {
  return mcpPost(new Request("http://localhost/api/mcp/team-guid", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": "apb_live_test" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  }));
}

const credential = { kind: "playbook_key", playbookId: PB, userId: null, keyPrefix: "apb_live_abcd", key_prefix: "apb_live_abcd", playbooks: { id: PB, guid: "team-guid" } };
const onlyPermission = (granted: string) =>
  vi.mocked(validatePlaybookCredential).mockImplementation(async (_r, _id, permission) => (permission === granted ? credential as never : null));

beforeEach(() => {
  calls = [];
  rows = (call) => {
    if (call.table === "playbooks") return playbook;
    if (call.op === "insert" || call.op === "upsert") return { id: "new-row", key: call.payload?.key ?? "k" };
    if (call.table === "skills") return { id: "skill-1", name: "triage", description: "Old", content: "old body" };
    if (call.table === "api_keys") return { id: "key-1", name: "Team member" };
    return null;
  };
  vi.mocked(getSupabase).mockReturnValue(client() as never);
  vi.mocked(getServiceSupabase).mockReturnValue(client() as never);
  vi.mocked(validateApiKey).mockResolvedValue(null);
  vi.mocked(validateUserApiKey).mockResolvedValue(null);
  vi.mocked(getAuthenticatedUser).mockResolvedValue(null);
  vi.mocked(checkPlaybookWriteAccess).mockResolvedValue(false);
});

describe("MCP writes with a propose-only key", () => {
  it("write_memory stores a pending memory proposal and leaves memories alone", async () => {
    onlyPermission("memory:propose");
    const body = await (await rpc("write_memory", { key: "lesson", value: { text: "Check the register first" } })).json();
    expect(JSON.stringify(body)).toContain("pending_review");
    expect(writes("memories")).toEqual([]);
    const [proposal] = writes("memory_history");
    expect(proposal.payload).toMatchObject({
      playbook_id: PB, review_status: "pending", proposed_by: "Team member apb_live_abcd…", proposed_by_api_key_id: "key-1",
      snapshot: { key: "lesson", value: { text: "Check the register first" } },
    });
  });

  it("create_skill and update_skill store pending skill proposals and leave skills alone", async () => {
    onlyPermission("skills:propose");
    await rpc("create_skill", { name: "new-skill", description: "Does a thing when asked to.", content: "# Body" });
    await rpc("update_skill", { skill_id: "triage", content: "new body" });
    expect(writes("skills")).toEqual([]);
    const [created, changed] = writes("skill_versions");
    expect(created.payload).toMatchObject({ skill_id: null, name: "new-skill", change_type: "PROPOSAL", review_status: "pending" });
    // The whole proposed version, so approving applies exactly what was reviewed.
    expect(changed.payload).toMatchObject({ skill_id: "skill-1", name: "triage", description: "Old", content: "new body" });
  });

  it("still writes directly with memory:write, and refuses a key with neither", async () => {
    onlyPermission("memory:write");
    await rpc("write_memory", { key: "fact", value: { a: 1 } });
    expect(writes("memories")).toHaveLength(1);
    expect(writes("memory_history")).toEqual([]);

    calls = [];
    onlyPermission("memory:read");
    const body = await (await rpc("write_memory", { key: "fact", value: { a: 1 } })).json();
    expect(JSON.stringify(body)).toContain("memory:write or memory:propose permission required");
    expect(writes("memories")).toEqual([]);
    expect(writes("memory_history")).toEqual([]);
  });
});

describe("REST memory write with a propose-only key", () => {
  it("answers 202 with a pending proposal and leaves memories alone", async () => {
    vi.mocked(validateApiKey).mockImplementation(async (_r, permission) =>
      permission === "memory:propose" ? { id: "key-1", name: "Hermes", key_prefix: "apb_live_abcd", playbooks: { id: PB, guid: "team-guid" } } as never : null);
    const res = await memoryPut(new Request("http://localhost/api/playbooks/team-guid/memory/lesson", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-API-Key": "apb_live_test" },
      body: JSON.stringify({ value: { text: "A principle" } }),
    }));
    expect(res.status).toBe(202);
    expect((await res.json()).status).toBe("pending_review");
    expect(writes("memories")).toEqual([]);
    expect(writes("memory_history")[0].payload).toMatchObject({ review_status: "pending", proposed_by: "Hermes apb_live_abcd…" });
  });
});

describe("reviewing proposals", () => {
  const review = (id: string, body: Record<string, unknown>) =>
    proposalPost(new Request(`http://localhost/api/playbooks/team-guid/proposals/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }));

  it("lets the owner or an editor approve a memory proposal, which then takes effect", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: "editor-1" } as never);
    vi.mocked(checkPlaybookWriteAccess).mockResolvedValue(true);
    const pending = { id: "p-1", playbook_id: PB, memory_id: null, review_status: "pending", snapshot: { key: "lesson", value: { text: "x" } } };
    rows = (call) => {
      if (call.table === "playbooks") return playbook;
      if (call.table === "memory_history" && call.op === "select") return pending;
      if (call.table === "memories") return { id: "m-1", key: "lesson" };
      return null;
    };
    const res = await review("p-1", { kind: "memory", decision: "approve" });
    expect(await res.json()).toMatchObject({ status: "approved", target: "lesson" });
    expect(writes("memories")[0]).toMatchObject({ op: "upsert", payload: { key: "lesson", value: { text: "x" }, playbook_id: PB } });
    expect(writes("memory_history")[0]).toMatchObject({ op: "update", payload: { review_status: "approved", memory_id: "m-1" } });
  });

  it("rejects without touching memories", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: "editor-1" } as never);
    vi.mocked(checkPlaybookWriteAccess).mockResolvedValue(true);
    rows = (call) => (call.table === "playbooks" ? playbook : call.op === "select" ? { id: "p-2", snapshot: { key: "k" } } : null);
    expect((await (await review("p-2", { kind: "memory", decision: "reject" })).json()).status).toBe("rejected");
    expect(writes("memories")).toEqual([]);
    expect(writes("memory_history")[0].payload).toMatchObject({ review_status: "rejected" });
  });

  it("refuses a propose-only key, and lets a key review only the area it may write", async () => {
    vi.mocked(validateApiKey).mockImplementation(async (_r, permission) =>
      permission === "memory:propose" ? { id: "key-1", playbooks: { id: PB, guid: "team-guid" } } as never : null);
    expect((await review("p-1", { kind: "memory", decision: "approve" })).status).toBe(401);

    vi.mocked(validateApiKey).mockImplementation(async (_r, permission) =>
      permission === "memory:write" ? { id: "key-2", playbooks: { id: PB, guid: "team-guid" } } as never : null);
    expect((await review("p-1", { kind: "skill", decision: "approve" })).status).toBe(403);
    const listed = await proposalsGet(new Request("http://localhost/api/playbooks/team-guid/proposals"));
    expect(listed.status).toBe(200);
    expect(calls.some((c) => c.table === "skill_versions")).toBe(false);
    expect(writes("memories")).toEqual([]);
  });
});
