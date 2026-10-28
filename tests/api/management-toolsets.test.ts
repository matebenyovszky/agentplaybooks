import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { db, scoped, canWrite } = vi.hoisted(() => ({
  db: { from: vi.fn(), select: vi.fn(), eq: vi.fn(), update: vi.fn(), maybeSingle: vi.fn(), single: vi.fn() },
  scoped: vi.fn(), canWrite: vi.fn(),
}));
vi.mock("@/app/api/_shared/auth", () => ({
  validateUserApiKey: vi.fn(async () => ({ user_id: "owner", permissions: ["full"] })),
  getAuthenticatedUser: vi.fn(async () => null),
}));
vi.mock("@/app/api/_shared/supabase", () => ({ getServiceSupabase: () => db }));
vi.mock("@/app/api/mcp/[guid]/route", () => ({ POST: scoped }));
vi.mock("@/app/api/_shared/guards", () => ({ checkPlaybookWriteAccess: canWrite }));
import { GET, POST } from "@/app/api/mcp/manage/route";

function request(name: string, args: Record<string, unknown> = {}, toolset = "") {
  return new Request(`https://apbks.test/api/mcp/manage${toolset ? `?toolset=${toolset}` : ""}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const name of ["from", "select", "eq", "update"] as const) db[name].mockReturnValue(db);
  db.maybeSingle.mockResolvedValue({ data: { id: "pb", guid: "project" } });
  db.single.mockResolvedValue({ data: { id: "pb", persona_name: "Reviewer" } });
  canWrite.mockResolvedValue(true);
  scoped.mockResolvedValue(new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [] } })));
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("compact management discovery", () => {
  it("advertises 16 core tools and discovers hidden operations without selecting a playbook", async () => {
    const manifest = await (await GET(new Request("https://apbks.test/api/mcp/manage"))).json();
    expect(manifest.tools).toHaveLength(16);
    expect(manifest.tools.map((t: { name: string }) => t.name)).toContain("get_profile");
    expect(manifest.tools.map((t: { name: string }) => t.name)).not.toContain("delete_playbook");
    const finder = manifest.tools.find((t: { name: string }) => t.name === "find_tools");
    expect(finder.inputSchema.required).toEqual(["query"]);
    const result = await (await POST(request("find_tools", { query: "reset_persona" }))).json();
    expect(result.error).toBeUndefined();
    expect(JSON.stringify(result.result)).toContain("reset_persona");
    expect(db.from).not.toHaveBeenCalled();
  });

  it("keeps full discovery and direct calls to non-core tools compatible", async () => {
    const manifest = await (await GET(new Request("https://apbks.test/api/mcp/manage?toolset=full"))).json();
    expect(manifest.tools.map((t: { name: string }) => t.name)).toEqual(expect.arrayContaining(["create_persona", "delete_persona", "store_secret"]));
    await POST(request("store_secret", { playbook_id: "pb", name: "test", value: "NEVER_LOG_THIS" }));
    expect(scoped).toHaveBeenCalledOnce();
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain("NEVER_LOG_THIS");
  });

  it("enforces pinned views before database access and rejects misspelled views", async () => {
    for (const name of ["delete_playbook", "store_secret", "create_persona", "reset_persona"]) {
      const result = await (await POST(request(name, { playbook_id: "pb" }, "memory"))).json();
      expect(result.error.code).toBe(-32602);
    }
    const result = await (await POST(request("find_tools", { query: "secret", playbook_id: "pb" }, "memory"))).json();
    expect(JSON.stringify(result.result)).not.toContain("store_secret");
    expect(db.from).not.toHaveBeenCalled();
    expect(scoped).not.toHaveBeenCalled();
    expect((await GET(new Request("https://apbks.test/api/mcp/manage?toolset=memroy"))).status).toBe(400);
  });

  it("forwards allowed canvas calls without leaking an unsupported scoped toolset", async () => {
    await POST(request("read_canvas", { playbook_id: "pb", canvas_id: "doc" }, "canvas"));
    const forwarded = scoped.mock.calls[0][0] as Request;
    expect(new URL(forwarded.url).searchParams.has("toolset")).toBe(false);
    expect((await forwarded.json()).params.arguments).toEqual({ canvas_id: "doc" });
  });

  it("returns callable account schemas for scoped search and routes connected names through the same guards", async () => {
    scoped.mockResolvedValueOnce(new Response(JSON.stringify({ result: { structuredContent: { matches: [
      { name: "notes__search", description: "Search connected notes", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
    ] } } })));
    const found = await (await POST(request("find_tools", { playbook_id: "pb", query: "notes" }))).json();
    const match = found.result.structuredContent.matches.find((m: { name: string }) => m.name === "notes__search");
    expect(match.inputSchema.required).toEqual(["playbook_id", "query"]);
    await POST(request("notes__search", { playbook_id: "pb", query: "selected fact" }));
    expect(scoped).toHaveBeenCalledTimes(2);
    const forwarded = scoped.mock.calls[1][0] as Request;
    expect((await forwarded.json()).params).toEqual({ name: "notes__search", arguments: { query: "selected fact" } });
    const denied = await (await POST(request("notes__search", { playbook_id: "pb" }, "memory"))).json();
    expect(denied.error.code).toBe(-32602);
    expect(scoped).toHaveBeenCalledTimes(2);
  });

  it("edits a persona by playbook ID, rejects mismatches and resets only with write access", async () => {
    const result = await (await POST(request("update_persona", { playbook_id: "pb", name: "Reviewer" }))).json();
    expect(result.error).toBeUndefined();
    expect(db.update).toHaveBeenCalledWith({ persona_name: "Reviewer" });
    db.update.mockClear();
    const mismatch = await (await POST(request("update_persona", { playbook_id: "pb", persona_id: "other", name: "Wrong" }))).json();
    expect(mismatch.error).toBeDefined();
    expect(db.update).not.toHaveBeenCalled();
    await POST(request("reset_persona", { playbook_id: "pb" }));
    expect(db.update).toHaveBeenCalledWith({ persona_name: "Assistant", persona_system_prompt: "You are a helpful AI assistant.", persona_metadata: {} });
    db.update.mockClear();
    canWrite.mockResolvedValue(false);
    expect((await (await POST(request("reset_persona", { playbook_id: "pb" }))).json()).error).toBeDefined();
    expect(db.update).not.toHaveBeenCalled();
  });
});
