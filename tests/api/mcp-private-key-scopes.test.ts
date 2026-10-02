import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/mcp/[guid]/route";
import { getServiceSupabase, getSupabase } from "@/app/api/_shared/supabase";
import { resolvePrivatePlaybookActor, type PrivatePlaybookActor } from "@/app/api/_shared/auth";

/**
 * A private playbook's MCP endpoint used to admit only memory:read keys, so a
 * key that may only write (or propose) could not reach its own tools. Now any
 * key of the playbook gets in, and every read is checked per tool and resource.
 * These pin that a write-only key reaches the endpoint but reads nothing.
 */

vi.mock("@/app/api/_shared/supabase", () => ({ getSupabase: vi.fn(), getServiceSupabase: vi.fn() }));
vi.mock("@/app/api/_shared/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/api/_shared/auth")>()),
  resolvePrivatePlaybookActor: vi.fn(),
  canAccessPrivatePlaybook: vi.fn(),
}));
vi.mock("@/lib/mcp/federation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mcp/federation")>()),
  federatedTools: vi.fn().mockResolvedValue([]),
  federatedResources: vi.fn().mockResolvedValue([]),
  callFederatedTool: vi.fn(),
  readFederatedResource: vi.fn(),
}));

const privatePlaybook = { id: "playbook-1", guid: "private-guid", user_id: "owner-1", name: "Team", description: null,
  persona_name: null, persona_system_prompt: null, persona_metadata: null, instructions: null };

/** Public lookup finds nothing; the private lookup finds the playbook. Data queries return nothing. */
function client(row: unknown) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "order", "limit", "ilike", "is", "not", "gte", "lte", "or", "range"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn(async () => ({ data: row, error: null }));
  builder.single = vi.fn(async () => ({ data: row, error: null }));
  builder.then = (resolve: (value: unknown) => void) => resolve({ data: [], error: null });
  return { from: vi.fn(() => builder) };
}

function rpc(method: string, params: Record<string, unknown> = {}) {
  return POST(new Request("http://localhost/api/mcp/private-guid", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": "apb_live_test" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  }));
}

const asKey = (permissions: string[], role = "coworker") =>
  vi.mocked(resolvePrivatePlaybookActor).mockResolvedValue({ kind: "playbook_key", role, permissions } as PrivatePlaybookActor);

beforeEach(() => {
  vi.mocked(getSupabase).mockReturnValue(client(null) as unknown as ReturnType<typeof getSupabase>);
  vi.mocked(getServiceSupabase).mockReturnValue(client(privatePlaybook) as unknown as ReturnType<typeof getServiceSupabase>);
});

describe("private playbook MCP with a write-only key", () => {
  it("reaches the endpoint: tools are listed", async () => {
    asKey(["memory:write"]);
    const body = await (await rpc("tools/list")).json();
    expect(body.error).toBeUndefined();
    expect(body.result.tools.some((tool: { name: string }) => tool.name === "write_memory")).toBe(true);
  });

  it("cannot read memory, skills or canvas through tools", async () => {
    asKey(["memory:write"], "proposer");
    for (const [name, permission] of [["read_memory", "memory:read"], ["search_memory", "memory:read"],
      ["list_skills", "skills:read"], ["get_skill", "skills:read"], ["read_canvas", "canvas:read"], ["list_mcp_servers", "playbooks:read"]]) {
      const body = await (await rpc("tools/call", { name, arguments: { key: "x", skill_id: "x", slug: "x" } })).json();
      const text = JSON.stringify(body);
      expect(text, name).toContain(`${permission} permission required`);
    }
  });

  it("cannot read skills or memory through the skills extension or resources", async () => {
    asKey(["memory:write"]);
    expect((await (await rpc("skills/list")).json()).error?.code).toBe(-32001);
    expect((await (await rpc("skills/get", { uri: "skill://private-guid/x/SKILL.md" })).json()).error?.code).toBe(-32001);
    for (const uri of ["playbook://private-guid/memory", "playbook://other/memory", "playbook://private-guid/skills", "skill://private-guid/x/SKILL.md"]) {
      expect((await (await rpc("resources/read", { uri })).json()).error?.code, uri).toBe(-32001);
    }
    const listed = await (await rpc("resources/list")).json();
    expect(listed.result.resources.every((resource: { uri: string }) => !resource.uri.includes("/attachments/"))).toBe(true);
  });

  it("still refuses a caller with no key of this playbook", async () => {
    vi.mocked(resolvePrivatePlaybookActor).mockResolvedValue(null);
    const body = await (await rpc("tools/call", { name: "read_memory", arguments: { key: "x" } })).json();
    expect(JSON.stringify(body)).not.toContain("memory:read permission required");
    expect(body.result?.content ?? null).toBeNull();
  });
});

describe("private playbook MCP with a scoped read key", () => {
  it("passes the read check for its scope only", async () => {
    asKey(["skills:read"]);
    const memory = await (await rpc("tools/call", { name: "read_memory", arguments: { key: "x" } })).json();
    expect(JSON.stringify(memory)).toContain("memory:read permission required");
    const skills = await (await rpc("tools/call", { name: "list_skills", arguments: {} })).json();
    expect(JSON.stringify(skills)).not.toContain("skills:read permission required");
  });
});
