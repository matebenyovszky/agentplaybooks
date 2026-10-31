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
import legacyContract from "../fixtures/mcp-0.9.1-contract.json";

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
  it("exposes fixed directory operations and refuses excluded dispatchers before any access", async () => {
    const manifest = await (await GET(new Request("https://apbks.test/api/mcp/manage?toolset=directory"))).json();
    const names = manifest.tools.map((tool: { name: string }) => tool.name);
    expect(names).toHaveLength(39);
    expect(names).toContain("get_profile");
    expect(names).toEqual(expect.arrayContaining(["create_playbook", "update_persona", "reset_persona", "write_memory", "patch_canvas_section", "update_run"]));
    for (const name of ["find_tools", "call_connected_tool", "notes__search", "use_secret", "use_secret_write", "store_secret", "list_mcp_servers", "create_persona", "delete_persona"]) {
      expect(names).not.toContain(name);
      const result = await (await POST(request(name, { playbook_id: "pb" }, "directory"))).json();
      expect(result.error.code, name).toBe(-32602);
    }
    expect(db.from).not.toHaveBeenCalled();
    expect(scoped).not.toHaveBeenCalled();
    await POST(request("read_canvas", { playbook_id: "pb", slug: "plan" }, "directory"));
    expect(scoped).toHaveBeenCalledOnce();
  });
  it("advertises compact common tools and discovers hidden operations without selecting a playbook", async () => {
    const manifest = await (await GET(new Request("https://apbks.test/api/mcp/manage"))).json();
    expect(manifest.tools).toHaveLength(17);
    expect(manifest.tools.map((t: { name: string }) => t.name)).toEqual(expect.arrayContaining(["get_connection_info", "find_tools"]));
    expect(manifest.tools.map((t: { name: string }) => t.name)).toContain("get_profile");
    expect(manifest.tools.map((t: { name: string }) => t.name)).not.toContain("delete_playbook");
    const finder = manifest.tools.find((t: { name: string }) => t.name === "find_tools");
    expect(finder.inputSchema.required).toEqual(["query"]);
    const result = await (await POST(request("find_tools", { query: "reset_persona" }))).json();
    expect(result.error).toBeUndefined();
    expect(JSON.stringify(result.result)).toContain("reset_persona");
    expect(db.from).not.toHaveBeenCalled();
  });

  it("loads schema details only when requested and keeps startup descriptions bounded", async () => {
    const compact = await (await GET(new Request("https://apbks.test/api/mcp/manage"))).json();
    const full = await (await GET(new Request("https://apbks.test/api/mcp/manage?toolset=full"))).json();
    expect(JSON.stringify(compact.tools).length).toBeLessThan(20000);
    expect(JSON.stringify(compact.tools).length).toBeLessThan(JSON.stringify(full.tools).length / 3);
    expect(compact.tools.every((tool: { description: string; outputSchema?: unknown }) => tool.description.length <= 220)).toBe(true);
    expect(compact.tools.map((tool: { name: string }) => tool.name)).not.toContain("reveal_secret");
    const brief = await (await POST(request("find_tools", { query: "get_secret_status", include_schemas: false }))).json();
    expect(brief.result.structuredContent.matches[0]).toMatchObject({ name: "get_secret_status", match: "exact" });
    expect(brief.result.structuredContent.matches[0].inputSchema).toBeUndefined();
    const detailed = await (await POST(request("find_tools", { query: "get_secret_status", include_schemas: true }))).json();
    expect(detailed.result.structuredContent.matches[0].inputSchema.required).toEqual(["playbook_id", "secret_name"]);
    expect(db.from).not.toHaveBeenCalled();
  });

  it("preserves the released plugin's tools and schema discovery without new flags", async () => {
    const core = await (await GET(new Request("https://apbks.test/api/mcp/manage"))).json();
    const full = await (await GET(new Request("https://apbks.test/api/mcp/manage?toolset=full"))).json();
    expect(core.tools.map((tool: { name: string }) => tool.name)).toEqual(expect.arrayContaining(legacyContract.core_tools));
    expect(full.tools.map((tool: { name: string }) => tool.name)).toEqual(expect.arrayContaining(legacyContract.all_tools));
    // Cached output validation and OpenAI's profile tool keep their schemas.
    for (const tool of core.tools) {
      const complete = full.tools.find((entry: { name: string }) => entry.name === tool.name);
      expect(tool.inputSchema).toEqual(complete.inputSchema);
      expect(tool.outputSchema).toEqual(complete.outputSchema);
      expect(tool.annotations).toEqual(complete.annotations);
    }
    const found = await (await POST(request("find_tools", { query: "list_secrets" }))).json();
    const match = found.result.structuredContent.matches[0];
    expect(Object.keys(match)).toEqual(expect.arrayContaining(legacyContract.find_tools_required_match_fields));
    expect(match.inputSchema.required).toEqual(["playbook_id"]);
    expect(match.name).toBe("list_secrets");
  });

  it("reports catalog visibility without querying playbooks or secret values", async () => {
    const body = await (await POST(request("get_connection_info"))).json();
    const info = body.result.structuredContent;
    expect(info).toMatchObject({ toolset: "core", credential_kind: "user_key", account_permissions: ["full"], host_registration: "unknown_to_server", secret_reveal: { supported: true } });
    expect(info.catalog_revision).toBeTruthy();
    expect(info.api).toMatchObject({ api_version: "1.1.0", supported_majors: [1], unversioned_alias_major: 1 });
    expect(info.advertised_tools).not.toContain("delete_playbook");
    expect(info.callable_tools).toContain("delete_playbook");
    expect(db.from).not.toHaveBeenCalled();
    const memory = await (await POST(request("get_connection_info", {}, "memory"))).json();
    expect(memory.result.structuredContent.secret_reveal.supported).toBe(false);
    expect(memory.result.structuredContent.callable_tools).not.toContain("reveal_secret");
  });

  it("returns actionable reasons for excluded, unknown and incomplete calls", async () => {
    const excluded = await (await POST(request("reveal_secret", {}, "memory"))).json();
    expect(excluded.error.data.reason).toBe("toolset_excluded");
    const unknown = await (await POST(request("missing_function"))).json();
    expect(unknown.error.data.reason).toBe("unknown_tool");
    const missing = await (await POST(request("list_secrets"))).json();
    expect(missing.error.data.reason).toBe("missing_playbook_id");
    expect(db.from).not.toHaveBeenCalled();
    expect(scoped).not.toHaveBeenCalled();
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
    const found = await (await POST(request("find_tools", { playbook_id: "pb", query: "notes", include_schemas: true }))).json();
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

  it("keeps full connected-tool schemas for legacy scoped discovery", async () => {
    scoped.mockResolvedValueOnce(new Response(JSON.stringify({ result: { structuredContent: { matches: [
      { name: "notes__search", description: "Search connected notes", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
    ] } } })));
    const result = await (await POST(request("find_tools", { playbook_id: "pb", query: "notes" }))).json();
    const match = result.result.structuredContent.matches[0];
    expect(match.inputSchema.required).toEqual(["playbook_id", "query"]);
    const forwarded = await (scoped.mock.calls[0][0] as Request).json();
    expect(forwarded.params.arguments).toMatchObject({ query: "notes", include_schemas: true });
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
