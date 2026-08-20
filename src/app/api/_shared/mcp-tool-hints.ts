import type { McpToolAnnotations } from "@/lib/supabase/types";

/**
 * Closed-world MCP annotation presets.
 *
 * The protocol defaults `openWorldHint` to true, so tools that only touch
 * playbook state must declare false. `idempotentHint` is listed even on reads
 * so Glama's introspection does not treat the hint as undeclared.
 */
export const READ_CLOSED: McpToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export const WRITE_CLOSED: McpToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};

export const IDEMPOTENT_WRITE_CLOSED: McpToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export const DESTRUCTIVE_CLOSED: McpToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
};

export const OPEN_WORLD_CALL: McpToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
};

const stringOrNull = { type: ["string", "null"] as const };

/**
 * Every output schema here MUST be `type: "object"` at the top level. The MCP
 * spec types `structuredContent` as an object, and a strict client validates
 * the whole listing against that: three top-level `type: "array"` schemas were
 * enough for Hermes Agent to reject the entire ListToolsResult — "3 validation
 * errors", connection parked, no tools at all. List results are therefore
 * wrapped under a named property (see STRUCTURED_RESULT_KEYS below), and the
 * call path returns the same wrapped value as `structuredContent` — a schema we
 * declare but never deliver would be the same lie one layer down.
 */
export const skillListOutputSchema: Record<string, unknown> = {
  type: "object",
  properties: {
    skills: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "Skill UUID" },
          name: { type: "string" },
          description: stringOrNull,
          content: stringOrNull,
          licence: stringOrNull,
          publisher_id: stringOrNull,
          priority: { type: ["number", "null"] },
        },
      },
    },
  },
  required: ["skills"],
};

export const skillRecordOutputSchema: Record<string, unknown> = {
  type: "object",
  properties: {
    id: { type: "string" },
    playbook_id: { type: "string" },
    name: { type: "string" },
    description: stringOrNull,
    content: stringOrNull,
    licence: stringOrNull,
    publisher_id: stringOrNull,
    priority: { type: ["number", "null"] },
    created_at: { type: "string" },
    skill_attachments: { type: "array", items: { type: "object" } },
  },
};

export const memoryRecordOutputSchema: Record<string, unknown> = {
  type: "object",
  properties: {
    key: { type: "string" },
    // A memory value is arbitrary JSON — a string or number stored via
    // write_memory must not make the declared schema refute the real result.
    value: {},
    tags: { type: "array", items: { type: "string" } },
    description: stringOrNull,
    tier: { type: "string", enum: ["working", "contextual", "longterm"] },
    priority: { type: "number" },
    parent_key: stringOrNull,
    summary: stringOrNull,
    access_count: { type: "number" },
    updated_at: { type: "string" },
  },
};

export const memoryContextOutputSchema: Record<string, unknown> = {
  type: "object",
  properties: {
    tiers: { type: "object", additionalProperties: { type: "array", items: { type: "object" } } },
    total_items: { type: "number" },
  },
  required: ["tiers", "total_items"],
};

export const memoryTreeOutputSchema: Record<string, unknown> = {
  type: "object",
  properties: {
    root: stringOrNull,
    tree: { type: "array", items: { type: "object" } },
    total_nodes: { type: "number" },
  },
  required: ["root", "tree", "total_nodes"],
};

export const canvasListOutputSchema: Record<string, unknown> = {
  type: "object",
  properties: {
    documents: {
      type: "array",
      items: {
        type: "object",
        properties: {
          run_id: { type: "string" },
          slug: { type: "string" },
          name: { type: "string" },
          sort_order: { type: "number" },
          version: { type: "number" },
          updated_at: { type: "string" },
          metadata: { type: "object" },
        },
      },
    },
  },
  required: ["documents"],
};

export const canvasTocOutputSchema: Record<string, unknown> = {
  type: "object",
  properties: {
    name: { type: "string" },
    slug: { type: "string" },
    toc: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          heading: { type: "string" },
          level: { type: "number" },
          locked_by: stringOrNull,
        },
      },
    },
  },
  required: ["name", "slug", "toc"],
};

export const secretListOutputSchema: Record<string, unknown> = {
  type: "object",
  properties: {
    secrets: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          description: stringOrNull,
          category: { type: "string" },
          rotated_at: stringOrNull,
          expires_at: stringOrNull,
          last_used_at: stringOrNull,
          use_count: { type: "number" },
          created_at: { type: "string" },
          updated_at: { type: "string" },
        },
      },
    },
  },
  required: ["secrets"],
};

export const playbookListOutputSchema: Record<string, unknown> = {
  type: "object",
  properties: {
    playbooks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          guid: { type: "string" },
          name: { type: "string" },
          current_user_role: { type: "string" },
          persona_count: { type: "number" },
        },
        additionalProperties: true,
      },
    },
  },
  required: ["playbooks"],
};

export const findToolsOutputSchema: Record<string, unknown> = {
  type: "object",
  properties: {
    matches: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Callable tool name" },
          description: { type: "string" },
          inputSchema: { type: "object" },
        },
        required: ["name", "description", "inputSchema"],
      },
    },
  },
  required: ["matches"],
};

/**
 * The property a list tool's rows are wrapped under, both in the schema above
 * and in the `structuredContent` the call returns. One table, used by both,
 * so the promise and the delivery cannot drift apart.
 */
export const STRUCTURED_RESULT_KEYS: Record<string, string> = {
  list_skills: "skills",
  list_canvas: "documents",
  list_secrets: "secrets",
  list_playbooks: "playbooks",
  find_tools: "matches",
};

/**
 * The `structuredContent` for a tool result, or null when the tool declares no
 * output schema (declaring nothing is honest; declaring and not delivering is
 * not). List results are wrapped under their named property; object results
 * pass through; anything that cannot honour the declared shape yields null
 * rather than an object the schema would refute.
 */
export function structuredToolResult(
  tools: ReadonlyArray<{ name: string; outputSchema?: unknown }>,
  toolName: string,
  result: unknown,
): Record<string, unknown> | null {
  const tool = tools.find((candidate) => candidate.name === toolName);
  if (!tool?.outputSchema) return null;
  const key = STRUCTURED_RESULT_KEYS[toolName];
  if (key) return { [key]: Array.isArray(result) ? result : [] };
  return typeof result === "object" && result !== null && !Array.isArray(result)
    ? result as Record<string, unknown>
    : null;
}
