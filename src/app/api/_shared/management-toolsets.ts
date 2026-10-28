import type { McpTool } from "@/lib/supabase/types";
import { resolveToolset } from "./toolsets";

const CORE = new Set([
  "list_playbooks", "create_playbook", "get_playbook", "update_persona",
  "list_skills", "get_skill", "get_skill_reference",
  "search_memory", "read_memory", "write_memory",
  "list_canvas", "read_canvas", "write_canvas", "list_mcp_servers", "find_tools",
]);
const ACCOUNT_ADMIN = new Set([
  "create_playbook", "delete_playbook", "create_persona", "update_persona",
  "delete_persona", "reset_persona",
]);
const CANVAS = new Set([
  "list_canvas", "read_canvas", "write_canvas", "patch_canvas_section",
  "get_canvas_toc", "lock_canvas_section", "unlock_canvas_section",
]);
const SECRETS = new Set([
  "list_secrets", "use_secret", "use_secret_write", "store_secret", "rotate_secret", "delete_secret",
]);
const PLANNING = new Set(["create_task_graph", "update_task_status"]);
const NAVIGATION = new Set(["list_playbooks", "get_playbook", "find_tools"]);
// Public directory review requires fixed, independently exposed operations.
// Deliberately exclude dispatchers, credential handling and legacy aliases.
const DIRECTORY = new Set([
  "list_playbooks", "create_playbook", "get_playbook", "update_playbook", "delete_playbook",
  "update_persona", "reset_persona",
  "list_skills", "get_skill", "get_skill_reference", "create_skill", "update_skill", "delete_skill", "list_skill_versions", "rollback_skill",
  "read_memory", "search_memory", "get_memory_history", "write_memory", "delete_memory", "consolidate_memories", "promote_memory", "get_memory_context", "archive_memories", "get_memory_tree",
  "create_task_graph", "update_task_status",
  "list_canvas", "read_canvas", "write_canvas", "patch_canvas_section", "get_canvas_toc", "lock_canvas_section", "unlock_canvas_section",
  "list_runs", "create_run", "update_run", "delete_run",
]);

export type ManagementToolset = {
  name: string;
  advertised: McpTool[];
  searchable: McpTool[];
  allows: (name: string) => boolean;
};

/** Core is a compact catalog, not a grant or restriction. Explicit domain views restrict calls. */
export function managementToolset(catalog: McpTool[], requested?: string | null): ManagementToolset | { error: string } {
  const name = (requested || "core").trim().toLowerCase();
  if (!["core", "full", "directory", "runtime", "memory", "canvas", "secrets", "admin"].includes(name)) {
    return { error: `Unknown management toolset "${requested}". Valid toolsets: core, full, directory, runtime, memory, canvas, secrets, admin.` };
  }
  const known = new Set(catalog.map(tool => tool.name));
  let includes: (name: string) => boolean;
  if (name === "core" || name === "full") includes = () => true;
  else if (name === "directory") includes = tool => DIRECTORY.has(tool);
  else if (name === "canvas") includes = tool => CANVAS.has(tool) || NAVIGATION.has(tool);
  else if (name === "secrets") includes = tool => SECRETS.has(tool) || NAVIGATION.has(tool);
  else {
    const view = resolveToolset(name);
    if ("error" in view) return { error: `Unknown management toolset "${requested}". Valid toolsets: core, full, runtime, memory, canvas, secrets, admin.` };
    includes = tool => NAVIGATION.has(tool)
      || (name === "admin" && ACCOUNT_ADMIN.has(tool))
      || (name === "memory" && PLANNING.has(tool))
      || (view.includes(tool, false) && !(name === "runtime" && ACCOUNT_ADMIN.has(tool)));
  }
  const searchable = catalog.filter(tool => includes(tool.name));
  return {
    name,
    advertised: name === "core" ? searchable.filter(tool => CORE.has(tool.name)) : searchable,
    searchable,
    allows: tool => known.has(tool) && includes(tool),
  };
}
