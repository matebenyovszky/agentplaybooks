import { shortToolDescription } from "./tool-discovery";
import type { McpTool } from "@/lib/supabase/types";

/**
 * Named views over a playbook's tool surface.
 *
 * A connected client pays for every advertised tool on every call — this
 * playbook's own surface measured ~11.7k tokens across 63 tools, and a
 * registry review graded the raw count 2/5. But the fix cannot be "remove
 * tools": the same surface is the product. So the view controls what is
 * *advertised*, and only a pinned view controls what may be *called*:
 *
 *   ?toolset=runtime   advertised: everything except playbook administration,
 *                      plus find_tools. Enforced: calls outside it are refused.
 *   ?toolset=memory    advertised and enforced: the memory tools only. For a
 *                      connection handed to an agent that should touch nothing
 *                      else.
 *   ?toolset=admin     advertised and enforced: skill/playbook/server/secret
 *                      administration. For management sessions.
 *   (no parameter)     everything plus find_tools, nothing enforced — the
 *                      compatible default.
 *
 * One playbook, one connection: an agent on the default view discovers what it
 * needs through find_tools. The server accepts omitted names, but a client
 * must still register a callable tool; discovery schemas cannot do that. Pinning
 * a view is the *policy* case — a deliberately narrowed connection — which is the
 * only reason to add the same playbook twice.
 */

const MEMORY_TOOL_NAMES = new Set([
  "read_memory",
  "get_memory_history",
  "search_memory",
  "write_memory",
  "delete_memory",
  "consolidate_memories",
  "promote_memory",
  "get_memory_context",
  "archive_memories",
  "get_memory_tree",
]);

/**
 * Administration changes what the playbook *is* — its skills, its servers, its
 * secrets, its own definition. An agent applying the playbook needs none of
 * these, and excluding them from the runtime view means a runaway session
 * cannot delete a skill it was merely supposed to read.
 */
const ADMIN_TOOL_NAMES = new Set([
  "create_skill",
  "update_skill",
  "delete_skill",
  "list_skill_versions",
  "rollback_skill",
  "update_playbook",
  "create_mcp_server",
  "update_mcp_server",
  "delete_mcp_server",
  "store_secret",
  "rotate_secret",
  "delete_secret",
]);

export const TOOLSET_NAMES = ["full", "runtime", "memory", "admin"] as const;
export type ToolsetName = (typeof TOOLSET_NAMES)[number];

export type ToolsetView = {
  name: ToolsetName;
  /** Pinned views refuse calls outside themselves; the default view never does. */
  enforced: boolean;
  /** Whether a tool belongs to this view. Federated tools carry no entry in the name sets. */
  includes: (toolName: string, isFederated: boolean) => boolean;
};

/**
 * Resolve the `toolset` query parameter into a view. An unknown name is an
 * error, not a silent fallback to `full` — a caller who pinned a view meant to
 * narrow the surface, and widening it because of a typo would be the worst
 * possible reading of their intent.
 */
export function resolveToolset(requested: string | null | undefined): ToolsetView | { error: string } {
  const name = (requested || "full").trim().toLowerCase();
  switch (name) {
    case "full":
      return { name: "full", enforced: false, includes: () => true };
    case "runtime":
      return {
        name: "runtime",
        enforced: true,
        includes: (toolName, isFederated) => isFederated || !ADMIN_TOOL_NAMES.has(toolName),
      };
    case "memory":
      return {
        name: "memory",
        enforced: true,
        includes: (toolName, isFederated) => !isFederated && MEMORY_TOOL_NAMES.has(toolName),
      };
    case "admin":
      return {
        name: "admin",
        enforced: true,
        includes: (toolName, isFederated) => !isFederated && ADMIN_TOOL_NAMES.has(toolName),
      };
    default:
      return { error: `Unknown toolset "${requested}". Valid toolsets: ${TOOLSET_NAMES.join(", ")}.` };
  }
}

/** find_tools belongs to the browsing views; a pinned narrow view must not carry a discovery tool for things it refuses to serve. */
export function viewCarriesFindTools(view: ToolsetView): boolean {
  return view.name === "full" || view.name === "runtime";
}

/** Rank exact operation names, query coverage, then name/description matches.
 * Compact results label partial matches; full schemas are loaded only on request.
 */
export function searchToolCatalog(
  tools: McpTool[],
  query: string,
  limit = 10,
  options: { includeSchemas?: boolean; browse?: boolean; offset?: number } = {},
) {
  const normalized = query.toLowerCase().trim().replace(/[_\s-]+/g, " ");
  const terms = [...new Set(normalized.split(/\s+/).filter(Boolean))];
  const boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 25)) : 10;
  const offset = Number.isFinite(options.offset) ? Math.max(0, Math.min(Math.floor(options.offset!), 1000)) : 0;
  if (terms.length === 0 && !options.browse) return [];

  const scored = tools.map((tool) => {
    const name = tool.name.toLowerCase();
    const description = (tool.description || "").toLowerCase();
    const matched = terms.filter(term => name.includes(term) || description.includes(term));
    const exact = Boolean(normalized) && name.replace(/[_\s-]+/g, " ") === normalized;
    const score = terms.reduce((sum, term) => sum + (name.includes(term) ? 3 : description.includes(term) ? 1 : 0), 0);
    return { tool, matched, exact, score };
  });

  return scored
    .filter(entry => entry.matched.length > 0 || options.browse && terms.length === 0)
    .sort((a, b) => Number(b.exact) - Number(a.exact)
      || b.matched.length - a.matched.length || b.score - a.score || a.tool.name.localeCompare(b.tool.name))
    .slice(offset, offset + boundedLimit)
    .map(({ tool, matched, exact }) => ({
      name: tool.name,
      description: options.includeSchemas === false ? shortToolDescription(tool) : tool.description || tool.name,
      ...(options.includeSchemas !== false ? { inputSchema: tool.inputSchema || { type: "object", properties: {} } } : {}),
      ...(tool.annotations ? { annotations: tool.annotations } : {}),
      ...(terms.length ? {
        match: exact ? "exact" : matched.length === terms.length ? "all_terms" : "partial",
        ...(matched.length < terms.length ? { missing_terms: terms.filter(term => !matched.includes(term)) } : {}),
      } : {}),
    }));
}
