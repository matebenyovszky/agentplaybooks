import type { McpTool } from "@/lib/supabase/types";
import {
  DESTRUCTIVE_CLOSED,
  IDEMPOTENT_WRITE_CLOSED,
  playbookListOutputSchema,
  READ_CLOSED,
  WRITE_CLOSED,
} from "@/app/api/_shared/mcp-tool-hints";

/** Account lifecycle tools. Playbook-scoped tools live in playbook-tools.ts. */
export const ACCOUNT_TOOLS: McpTool[] = [
  {
    name: "list_playbooks",
    description: "List playbooks owned by or shared with the authenticated user, including access role and content counts. Read-only; it does not create or modify playbooks. Use get_playbook when you need the singleton persona, skills, connected servers, and memory for one playbook. Requires playbooks:read or full permission.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    outputSchema: playbookListOutputSchema,
    annotations: READ_CLOSED,
  },
  {
    name: "create_playbook",
    description: "Create a new playbook container for a singleton persona, skills, and memory. Each call inserts a new playbook; it does not upsert by name. Requires playbooks:write or full permission. Use update_playbook to change an existing playbook, not this tool.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name of the playbook" },
        description: { type: "string", description: "Description of what the playbook is for" },
        visibility: { type: "string", enum: ["public", "private", "unlisted"], description: "Visibility of the playbook", default: "private" },
        tags: { type: "array", items: { type: "string" }, description: "Discovery and organization tags" },
        persona_name: { type: "string", description: "Initial persona name" },
        persona_system_prompt: { type: "string", description: "Initial persona/system prompt" },
        persona_metadata: { type: "object", description: "Initial persona metadata" },
        instructions: { type: "string", description: "Always-on project instructions (the AGENTS.md / CLAUDE.md content). Separate from the persona: the persona is who the agent is, these are the rules of this project." },
      },
      required: ["name"],
    },
    annotations: WRITE_CLOSED,
  },
  {
    name: "get_playbook",
    description: "Get a playbook with its singleton persona, skills, connected MCP servers, and memory. This is the only persona retrieval tool; there is no get_persona. Read-only. Requires playbooks:read or full permission. Use list_playbooks to discover IDs first, and get_skill when you need one skill's full content rather than the playbook summary.",
    inputSchema: {
      type: "object",
      properties: {
        playbook_id: { type: "string", description: "UUID of the playbook" },
      },
      required: ["playbook_id"],
    },
    annotations: READ_CLOSED,
  },
  {
    name: "delete_playbook",
    description: "Permanently delete a playbook and all of its contents (persona, skills, memory, API keys, canvas, and secrets). This cannot be undone. Requires playbooks:write or full permission, and only the owner may delete. Do not use this to reset a persona (delete_persona) or remove a single skill or memory; those have dedicated tools.",
    inputSchema: {
      type: "object",
      properties: {
        playbook_id: { type: "string", description: "UUID of the playbook to delete" },
      },
      required: ["playbook_id"],
    },
    annotations: DESTRUCTIVE_CLOSED,
  },
  {
    name: "create_persona",
    description: "Set the playbook's singleton persona name and system prompt. This does not add a second persona; it is a backward-compatible alias that overwrites those fields. Requires personas:write or full permission. Prefer update_persona to change a subset of fields. Use update_playbook only when you also need playbook name, visibility, config, or project instructions. Do not use delete_persona unless you intend to reset to the default Assistant.",
    inputSchema: {
      type: "object",
      properties: {
        playbook_id: { type: "string", description: "UUID of the playbook" },
        name: { type: "string", description: "Name of the persona" },
        system_prompt: { type: "string", description: "The system prompt that defines this persona's behavior" },
        metadata: { type: "object", description: "Optional metadata" },
      },
      required: ["playbook_id", "name", "system_prompt"],
    },
    annotations: DESTRUCTIVE_CLOSED,
  },
  {
    name: "update_persona",
    description: "Update the singleton persona's name, system prompt, or metadata without resetting to defaults. persona_id must equal playbook_id because the persona is stored on the playbook row. Requires personas:write or full permission. Use create_persona to replace name and system prompt together, delete_persona to reset to the default Assistant, and update_playbook when changing playbook-level fields as well.",
    inputSchema: {
      type: "object",
      properties: {
        playbook_id: { type: "string", description: "UUID of the playbook" },
        persona_id: { type: "string", description: "Must equal playbook_id; the persona is a singleton stored on the playbook" },
        name: { type: "string", description: "New name" },
        system_prompt: { type: "string", description: "New system prompt" },
        metadata: { type: "object", description: "New metadata" },
      },
      required: ["playbook_id", "persona_id"],
    },
    annotations: IDEMPOTENT_WRITE_CLOSED,
  },
  {
    name: "delete_persona",
    description: "Reset the playbook's singleton persona to the default Assistant name and system prompt. Despite the delete_* name, this is not a hard delete: each playbook always keeps exactly one logical persona, so the fields are overwritten rather than removed. persona_id must equal playbook_id because the persona is stored on the playbook row. Custom name, system prompt, and metadata are permanently replaced and cannot be undone. Requires personas:write or full permission. Use update_persona to change fields without resetting, create_persona to set a new identity, and delete_playbook only when the entire playbook should be removed.",
    inputSchema: {
      type: "object",
      properties: {
        playbook_id: { type: "string", description: "UUID of the playbook" },
        persona_id: { type: "string", description: "Must equal playbook_id; the persona is a singleton stored on the playbook" },
      },
      required: ["playbook_id", "persona_id"],
    },
    annotations: DESTRUCTIVE_CLOSED,
  },
];
