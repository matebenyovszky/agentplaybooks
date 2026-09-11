import type { Memory } from "@/lib/supabase/types";

export type MemoryScope = "active" | "archived" | "all";
export type MemoryEntry = Memory & { memory_id: string; history_id: string | null };
export type MemorySearch = {
  search?: string;
  key?: string;
  id?: string;
  history_key?: string;
  scope?: MemoryScope;
  tags?: string[];
  tier?: string;
  memory_type?: string;
  status?: string;
  include_children?: boolean;
  after?: string;
  before?: string;
  limit?: number;
  offset?: number;
};

/** Shared documentation for both REST read surfaces. */
export const MEMORY_SEARCH_PARAMETERS = [
  { name: "key", schema: { type: "string" }, description: "Read the current entry by key, including archived entries" },
  { name: "id", schema: { type: "string", format: "uuid" }, description: "Read the current entry by memory ID" },
  { name: "history_key", schema: { type: "string" }, description: "Previous versions linked to this current key" },
  { name: "search", schema: { type: "string" }, description: "Case-insensitive literal text in keys, JSON values, descriptions and summaries" },
  { name: "scope", schema: { type: "string", enum: ["active", "archived", "all"], default: "active" }, description: "Archived includes manually archived entries and previous versions" },
  { name: "after", schema: { type: "string", format: "date-time" }, description: "Inclusive lower bound on memory_at" },
  { name: "before", schema: { type: "string", format: "date-time" }, description: "Inclusive upper bound on memory_at" },
  { name: "tags", schema: { type: "string" }, description: "Comma-separated tags (any match)" },
  { name: "tier", schema: { type: "string", enum: ["working", "contextual", "longterm"] } },
  { name: "memory_type", schema: { type: "string", enum: ["flat", "hierarchical"] } },
  { name: "status", schema: { type: "string", enum: ["pending", "running", "completed", "failed", "blocked"] } },
  { name: "include_children", schema: { type: "boolean", default: true } },
  { name: "limit", schema: { type: "integer", minimum: 1, maximum: 200, default: 100 } },
  { name: "offset", schema: { type: "integer", minimum: 0, default: 0 } },
].map(parameter => ({ ...parameter, in: "query", required: false }));

/** Require an unambiguous timestamp, including a timezone. */
export function memoryTimestamp(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error("memory_at must be an ISO 8601 timestamp with a timezone");
  }
  const date = value.slice(0, 10);
  if (new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
    throw new Error("memory_at contains an invalid calendar date");
  }
  return new Date(value).toISOString();
}

export function memoryWriteFields(body: Record<string, unknown>): { memory_at?: string; is_archived?: boolean } {
  const fields: { memory_at?: string; is_archived?: boolean } = {};
  if (body.memory_at !== undefined) fields.memory_at = memoryTimestamp(body.memory_at);
  else if (body.value !== undefined) fields.memory_at = new Date().toISOString();
  if (body.is_archived !== undefined) {
    if (typeof body.is_archived !== "boolean") throw new Error("is_archived must be a boolean");
    fields.is_archived = body.is_archived;
  }
  return fields;
}

export function parseMemorySearch(input: Record<string, unknown>): MemorySearch {
  const scope = input.scope ?? "active";
  if (typeof scope !== "string" || !["active", "archived", "all"].includes(scope)) throw new Error("scope must be active, archived, or all");
  const options: MemorySearch = { scope: scope as MemoryScope };
  for (const field of ["search", "key", "id", "history_key", "tier", "memory_type", "status"] as const) {
    if (input[field] !== undefined) {
      if (typeof input[field] !== "string") throw new Error(`${field} must be a string`);
      options[field] = input[field];
    }
  }
  if ([options.key, options.id, options.history_key].filter(value => value !== undefined).length > 1) throw new Error("Use only one of key, id, or history_key");
  for (const field of ["key", "id", "history_key"] as const) {
    if (options[field] !== undefined && !options[field]) throw new Error(`${field} must not be empty`);
  }
  for (const field of ["after", "before"] as const) {
    if (input[field] !== undefined) options[field] = memoryTimestamp(input[field]);
  }
  if (options.after && options.before && options.after > options.before) throw new Error("after must not be later than before");
  if (input.tags !== undefined) {
    const tags = typeof input.tags === "string" ? input.tags.split(",").map(t => t.trim()).filter(Boolean) : input.tags;
    if (!Array.isArray(tags) || !tags.every(t => typeof t === "string")) throw new Error("tags must be strings");
    options.tags = tags;
  }
  if (input.include_children !== undefined) {
    if (![true, false, "true", "false"].includes(input.include_children as boolean | string)) throw new Error("include_children must be a boolean");
    options.include_children = input.include_children === true || input.include_children === "true";
  }
  for (const field of ["limit", "offset"] as const) {
    if (input[field] !== undefined) {
      const value = Number(input[field]);
      if (!["number", "string"].includes(typeof input[field]) || input[field] === "" || !Number.isSafeInteger(value) || value < (field === "limit" ? 1 : 0) || (field === "limit" && value > 200)) throw new Error(`${field} is out of range`);
      options[field] = value;
    }
  }
  return options;
}

export function literalMemoryPattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, "\\$&")}%`;
}
