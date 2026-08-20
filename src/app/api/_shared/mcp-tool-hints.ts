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

export const skillListOutputSchema: Record<string, unknown> = {
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
    value: { type: "object" },
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
};

export const playbookListOutputSchema: Record<string, unknown> = {
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
};
