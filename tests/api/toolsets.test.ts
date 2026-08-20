import { describe, expect, it } from "vitest";
import { resolveToolset, searchToolCatalog } from "@/app/api/_shared/toolsets";
import { PLAYBOOK_TOOLS } from "@/app/api/_shared/playbook-tools";

/**
 * The toolset view controls what is advertised; only a pinned view controls
 * what may be called. The properties worth pinning down: the runtime view
 * keeps administration out of an agent's hands, a pinned narrow view stays
 * narrow, a typo fails loudly instead of silently widening back to full, and
 * discovery through find_tools never reveals a tool the view would refuse.
 */

function view(name: string) {
  const resolved = resolveToolset(name);
  if ("error" in resolved) throw new Error(resolved.error);
  return resolved;
}

describe("resolving a toolset", () => {
  it("defaults to full, unenforced, when nothing is requested", () => {
    for (const requested of [undefined, null, "", "full"]) {
      const resolved = resolveToolset(requested);
      if ("error" in resolved) throw new Error(resolved.error);
      expect(resolved.name).toBe("full");
      expect(resolved.enforced).toBe(false);
      expect(resolved.includes("delete_skill", false)).toBe(true);
    }
  });

  it("rejects an unknown name instead of widening a pinned view", () => {
    const resolved = resolveToolset("memroy");
    expect("error" in resolved && resolved.error).toContain("memroy");
    expect("error" in resolved && resolved.error).toContain("full, runtime, memory, admin");
  });

  it("keeps playbook administration out of the runtime view", () => {
    const runtime = view("runtime");
    for (const admin of ["create_skill", "delete_skill", "update_playbook", "delete_mcp_server", "rotate_secret"]) {
      expect(runtime.includes(admin, false), admin).toBe(false);
    }
    expect(runtime.includes("read_memory", false)).toBe(true);
    expect(runtime.includes("find_tools", false)).toBe(true);
    expect(runtime.includes("supabase__execute_sql", true)).toBe(true);
    expect(runtime.enforced).toBe(true);
  });

  it("keeps a pinned memory view to memory alone", () => {
    const memory = view("memory");
    expect(memory.includes("read_memory", false)).toBe(true);
    expect(memory.includes("write_memory", false)).toBe(true);
    expect(memory.includes("list_skills", false)).toBe(false);
    expect(memory.includes("use_secret", false)).toBe(false);
    expect(memory.includes("supabase__execute_sql", true)).toBe(false);
    // No discovery tool for things the view refuses to serve.
    expect(memory.includes("find_tools", false)).toBe(false);
  });

  it("gives the admin view exactly the administration tools", () => {
    const admin = view("admin");
    expect(admin.includes("update_playbook", false)).toBe(true);
    expect(admin.includes("read_memory", false)).toBe(false);
    expect(admin.includes("cloudflare__docs", true)).toBe(false);
  });

  it("names every runtime-excluded tool in the real catalog", () => {
    // The admin set is maintained by hand; a renamed tool would silently fall
    // into the runtime view. Anchor the split to the real definitions.
    const runtime = view("runtime");
    const excluded = PLAYBOOK_TOOLS.filter((tool) => !runtime.includes(tool.name, false)).map((tool) => tool.name);
    expect(excluded.sort()).toEqual([
      "create_mcp_server",
      "create_skill",
      "delete_mcp_server",
      "delete_secret",
      "delete_skill",
      "list_skill_versions",
      "rollback_skill",
      "rotate_secret",
      "store_secret",
      "update_mcp_server",
      "update_playbook",
      "update_skill",
    ]);
  });
});

describe("searching the tool catalog", () => {
  const catalog = [
    { name: "supabase__execute_sql", description: "Executes raw SQL in the Postgres database", inputSchema: { type: "object" } },
    { name: "supabase__list_tables", description: "Lists all SQL tables in one or more schemas", inputSchema: { type: "object" } },
    { name: "read_memory", description: "Read one memory entry by key", inputSchema: { type: "object" } },
    { name: "write_memory", description: "Write or overwrite a memory entry", inputSchema: { type: "object" } },
  ];

  it("ranks a name match above a description match", () => {
    // "sql" is in execute_sql's name but only in list_tables' description.
    const matches = searchToolCatalog(catalog, "sql");
    expect(matches.map((m) => m.name)).toEqual(["supabase__execute_sql", "supabase__list_tables"]);
  });

  it("matches across multiple terms and returns the schema", () => {
    const [match] = searchToolCatalog(catalog, "memory read");
    expect(match.name).toBe("read_memory");
    expect(match.inputSchema).toEqual({ type: "object" });
  });

  it("returns nothing for an empty query, and respects the limit", () => {
    expect(searchToolCatalog(catalog, "   ")).toEqual([]);
    expect(searchToolCatalog(catalog, "memory", 1)).toHaveLength(1);
  });

  it("finds every real builtin by a word from its own name", () => {
    for (const tool of PLAYBOOK_TOOLS) {
      const term = tool.name.split("_").findLast((part) => part.length > 2) ?? tool.name;
      const matches = searchToolCatalog(PLAYBOOK_TOOLS, term, 25);
      expect(matches.map((m) => m.name), `${tool.name} via "${term}"`).toContain(tool.name);
    }
  });
});
