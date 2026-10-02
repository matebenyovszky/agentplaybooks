/**
 * The permission each read-only playbook tool needs on a private playbook.
 *
 * These tools carry no permission check of their own: before per-tool scopes,
 * a private playbook admitted only memory:read keys, so every read was gated
 * at the door. Now that a write-only key can reach the endpoint, each read is
 * checked against this table (see actorMayRead). A test reads the tools/call
 * switch and fails if any case neither checks a permission itself nor appears
 * here or in NO_DATA_TOOLS.
 */
export const READ_TOOL_PERMISSIONS: Record<string, string> = {
  read_memory: "memory:read",
  search_memory: "memory:read",
  get_memory_history: "memory:read",
  get_memory_tree: "memory:read",
  get_memory_context: "memory:read",
  list_skills: "skills:read",
  get_skill: "skills:read",
  list_skill_versions: "skills:read",
  list_canvas: "canvas:read",
  read_canvas: "canvas:read",
  get_canvas_toc: "canvas:read",
  list_runs: "canvas:read",
  list_mcp_servers: "playbooks:read",
};

/** Tools that read no playbook data, so they need no permission at all. */
export const NO_DATA_TOOLS = new Set(["find_tools"]);

/**
 * The permission a playbook resource read needs, matched exactly the way
 * resources/read matches its branches (suffix patterns, any prefix), so no
 * URI reaches data without a check. Federated resources check their own
 * access; the usage guide is static documentation.
 */
export function readPermissionForResource(uri: string): string | null {
  if (uri.startsWith("skill://")) return "skills:read";
  if (/\/memory$/.test(uri)) return "memory:read";
  if (/\/personas$/.test(uri)) return "personas:read";
  if (/\/skills$/.test(uri) || /\/skills\/[^/]+\/attachments\/[^/]+$/.test(uri)) return "skills:read";
  if (/\/canvas(\/|$)/.test(uri)) return "canvas:read";
  return null;
}
