import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/mcp/[guid]/route";
import { POST as callRestTool } from "@/app/api/mcp/[guid]/tools/[tool]/route";
import { getSupabase, getServiceSupabase } from "@/app/api/_shared/supabase";
import { resolvePrivatePlaybookActor, validateUserApiKey } from "@/app/api/_shared/auth";
import { getPlaybookAccessRole } from "@/app/api/_shared/guards";
import { listFederatedTools, callFederatedTool } from "@/lib/mcp/federation";
import { loadFederationSecrets } from "@/app/api/_shared/federation-secrets";
import type { McpTool, MCPServer } from "@/lib/supabase/types";

vi.mock("@/app/api/_shared/supabase", () => ({ getSupabase: vi.fn(), getServiceSupabase: vi.fn() }));
vi.mock("@/app/api/_shared/auth", async original => ({
  ...await original<typeof import("@/app/api/_shared/auth")>(),
  resolvePrivatePlaybookActor: vi.fn(),
  validateUserApiKey: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/app/api/_shared/guards", () => ({ getPlaybookAccessRole: vi.fn().mockResolvedValue(null) }));
vi.mock("@/app/api/_shared/federation-secrets", () => ({ loadFederationSecrets: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/mcp/federation", async original => ({
  ...await original<typeof import("@/lib/mcp/federation")>(),
  listFederatedTools: vi.fn(),
  listFederatedResources: vi.fn().mockResolvedValue([]),
  callFederatedTool: vi.fn().mockResolvedValue({ content: [{ type: "text", text: "found" }] }),
}));

const read = { readOnlyHint: true, destructiveHint: false };
const tool = (name: string, annotations?: McpTool["annotations"]): McpTool => ({ name, inputSchema: { type: "object" }, annotations });
const serverDefaults = { playbook_id: "public", publisher_id: null, description: null, resources: [], created_at: "2026-10-25T00:00:00Z" };
const publicServer: MCPServer = { ...serverDefaults, id: "public-server", name: "PublicReader", transport_type: "http", transport_config: { access: "public" },
  tools: [tool("search", read), tool("delete", { readOnlyHint: false }), tool("unknown")] };
const protectedServer: MCPServer = { ...serverDefaults, id: "protected-server", name: "Protected", transport_type: "http", transport_config: { access: "playbook_api_key" },
  tools: [tool("read", read)] };
let playbook: { id: string; guid: string; name: string; visibility: string };
let serial = 0;
const mutations = vi.fn();

function database() {
  return { from(table: string) {
    const data = table === "playbooks" ? playbook : table === "mcp_servers" ? [publicServer, protectedServer]
      : table === "skills" ? [{ id: "skill-1", name: "review", content: "Review code" }] : [];
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "order", "limit", "ilike"]) builder[method] = vi.fn(() => builder);
    for (const method of ["insert", "upsert", "update", "delete"]) builder[method] = mutations;
    builder.maybeSingle = vi.fn(async () => ({ data, error: null }));
    builder.single = vi.fn(async () => ({ data, error: null }));
    builder.then = (resolve: (value: unknown) => void) => Promise.resolve({ data, error: null }).then(resolve);
    return builder;
  } };
}

function request(method: string, params: object = {}, credential?: string, query = "") {
  return POST(new Request(`http://localhost/api/mcp/${playbook.guid}${query}`, {
    method: "POST", headers: { "Content-Type": "application/json", ...(credential ? { Authorization: credential } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  }));
}
async function names(credential?: string, query = "") {
  const body = await (await request("tools/list", {}, credential, query)).json();
  return body.result.tools.map((t: McpTool) => t.name) as string[];
}

beforeEach(() => {
  vi.clearAllMocks();
  playbook = { id: `public-${++serial}`, guid: `public-guid-${serial}`, name: "Public review", visibility: "public" };
  vi.mocked(getSupabase).mockReturnValue(database() as never);
  vi.mocked(getServiceSupabase).mockReturnValue(database() as never);
  vi.mocked(resolvePrivatePlaybookActor).mockImplementation(async request => request.headers.get("Authorization") === "Bearer valid"
    ? { kind: "playbook_key", role: "admin", permissions: ["full"] } : null);
  vi.mocked(validateUserApiKey).mockResolvedValue(null);
  vi.mocked(getPlaybookAccessRole).mockResolvedValue(null);
  vi.mocked(listFederatedTools).mockImplementation(async servers => servers.flatMap(server => server.tools.map(t => ({
    ...t, name: `${server.name.toLowerCase()}__${t.name}`,
    _meta: { serverId: server.id, serverName: server.name, originalName: t.name, transport: "http" },
  }))));
});

describe("anonymous public MCP tools", () => {
  it("publishes only available public reads in both the manifest and RPC catalog", async () => {
    const manifest = await (await GET(new Request(`http://localhost/api/mcp/${playbook.guid}`))).json();
    const listed = await names();
    expect(manifest.tools.map((t: McpTool) => t.name)).toEqual(listed);
    expect(listed).toContain("list_skills");
    expect(listed).toContain("search_memory");
    expect(listed).toContain("publicreader__search");
    for (const hidden of ["read_memory", "write_memory", "list_secrets", "use_secret", "list_mcp_servers", "publicreader__delete", "publicreader__unknown", "protected__read"]) {
      expect(listed).not.toContain(hidden);
    }
    expect(manifest.tools.every((t: McpTool) => t.annotations?.readOnlyHint === true)).toBe(true);
    expect(vi.mocked(loadFederationSecrets).mock.calls.every(([server]) => server.id !== protectedServer.id)).toBe(true);
    const result = await (await request("tools/call", { name: "list_skills", arguments: {} })).json();
    expect(result.result.structuredContent.skills).toHaveLength(1);
  });

  it("keeps authenticated and anonymous caches separate, including pinned views", async () => {
    for (const query of ["", "?toolset=memory", "?toolset=admin"]) {
      const signedIn = await names("Bearer valid", query);
      const anonymous = await names(undefined, query);
      expect(signedIn.length).toBeGreaterThan(anonymous.length);
      expect(anonymous).not.toContain("write_memory");
      expect(anonymous).not.toContain("delete_skill");
      expect(await names("Bearer valid", query)).toEqual(signedIn);
      expect(await names("Bearer invalid", query)).toEqual(anonymous);
    }
  });

  it("filters find_tools using the same access boundary", async () => {
    const allowed = await names();
    for (const query of ["write", "secret", "protected", "delete", "unknown"]) {
      const body = await (await request("tools/call", { name: "find_tools", arguments: { query } })).json();
      const matches = body.result.structuredContent.matches as McpTool[];
      expect(matches.every(tool => allowed.includes(tool.name)), query).toBe(true);
    }
    const found = await (await request("tools/call", { name: "find_tools", arguments: { query: "publicreader" } })).json();
    expect(found.result.structuredContent.matches.map((t: McpTool) => t.name)).toEqual(["publicreader__search"]);
  });

  it("recognizes a scoped account writer only when that account can access this playbook", async () => {
    vi.mocked(validateUserApiKey).mockResolvedValue({ user_id: "writer", permissions: ["memory:write"] } as never);
    vi.mocked(getPlaybookAccessRole).mockResolvedValue("editor");
    expect(await names("Bearer scoped-account")).toContain("write_memory");
    vi.mocked(getPlaybookAccessRole).mockResolvedValue(null);
    expect(await names("Bearer scoped-account")).not.toContain("write_memory");
  });

  it("refuses direct calls to hidden builtins before reading secrets or mutating data", async () => {
    for (const name of ["read_memory", "write_memory", "delete_memory", "use_secret", "list_secrets"]) {
      const body = await (await request("tools/call", { name, arguments: { key: "sample", value: "changed" } })).json();
      expect(JSON.stringify(body)).toContain("not a public read-only tool");
    }
    expect(mutations).not.toHaveBeenCalled();
    expect(loadFederationSecrets).not.toHaveBeenCalled();
  });

  it("refuses protected federation and requires the shared read-only gate for public RPC and REST calls", async () => {
    const denied = await request("tools/call", { name: "protected__read", arguments: {} });
    expect(denied.status).toBe(403);
    expect(callFederatedTool).not.toHaveBeenCalled();
    await request("tools/call", { name: "publicreader__search", arguments: {} });
    expect(callFederatedTool).toHaveBeenLastCalledWith(publicServer, "publicreader__search", {}, expect.objectContaining({ readOnly: true }));
    await callRestTool(new Request(`http://localhost/api/mcp/${playbook.guid}/tools/publicreader__search`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
    }));
    expect(callFederatedTool).toHaveBeenLastCalledWith(publicServer, "publicreader__search", {}, expect.objectContaining({ readOnly: true }));
  });
});
