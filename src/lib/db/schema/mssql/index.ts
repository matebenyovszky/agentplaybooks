/**
 * Microsoft SQL Server schema.
 *
 * Keep this schema structurally aligned with ../index.ts. SQL Server does not
 * have PostgreSQL arrays, jsonb or enum types, so JSON values are stored in
 * nvarchar(max) columns and enums are guarded by CHECK constraints.
 */
import { sql } from "drizzle-orm";
import {
  bit,
  check,
  customType,
  datetimeoffset,
  int,
  mssqlTable,
  nvarchar,
  uniqueIndex,
} from "drizzle-orm/mssql-core";

const uniqueidentifier = customType<{
  data: string;
  driverData: string;
}>({
  dataType: () => "uniqueidentifier",
});

const id = (name: string) =>
  uniqueidentifier(name).primaryKey().default(sql`newid()`);

const foreignId = (name: string) => uniqueidentifier(name);

const shortText = (name: string, length = 255) =>
  nvarchar(name, { length });

const longText = (name: string) =>
  nvarchar(name, { length: "max" });

const json = <T>(name: string) =>
  nvarchar(name, { mode: "json", length: "max" }).$type<T>();

const timestamp = (name: string) =>
  datetimeoffset(name, { precision: 7 });

const createdAt = () =>
  timestamp("created_at").default(sql`sysdatetimeoffset()`).notNull();

const updatedAt = () =>
  timestamp("updated_at").default(sql`sysdatetimeoffset()`).notNull();

export const playbooks = mssqlTable("playbooks", {
  id: id("id"),
  user_id: foreignId("user_id").notNull(),
  publisher_id: foreignId("publisher_id"),
  guid: shortText("guid", 128).notNull().unique(),
  name: shortText("name").notNull(),
  description: longText("description"),
  config: json<Record<string, unknown>>("config").default(sql`N'{}'`),
  visibility: nvarchar("visibility", {
    length: 16,
    enum: ["public", "private", "unlisted"],
  }).default("private").notNull(),
  star_count: int("star_count").default(0).notNull(),
  tags: json<string[]>("tags").default(sql`N'[]'`).notNull(),
  persona_name: shortText("persona_name"),
  persona_system_prompt: longText("persona_system_prompt"),
  persona_metadata: json<Record<string, unknown>>("persona_metadata"),
  created_at: createdAt(),
  updated_at: updatedAt(),
}, (table) => [
  check(
    "playbooks_visibility_check",
    sql`${table.visibility} in (N'public', N'private', N'unlisted')`,
  ),
  check(
    "playbooks_config_json_check",
    sql`${table.config} is null or isjson(${table.config}) = 1`,
  ),
  check("playbooks_tags_json_check", sql`isjson(${table.tags}) = 1`),
  check(
    "playbooks_persona_metadata_json_check",
    sql`${table.persona_metadata} is null or isjson(${table.persona_metadata}) = 1`,
  ),
]);

export const playbookStars = mssqlTable("playbook_stars", {
  id: id("id"),
  playbook_id: foreignId("playbook_id").notNull()
    .references(() => playbooks.id, { onDelete: "cascade" }),
  user_id: foreignId("user_id").notNull(),
  created_at: createdAt(),
}, (table) => [
  uniqueIndex("playbook_stars_playbook_user_idx")
    .on(table.playbook_id, table.user_id),
]);

export const playbookCollaborators = mssqlTable("playbook_collaborators", {
  id: id("id"),
  playbook_id: foreignId("playbook_id").notNull()
    .references(() => playbooks.id, { onDelete: "cascade" }),
  user_id: foreignId("user_id"),
  invited_by: foreignId("invited_by").notNull(),
  invite_token_hash: shortText("invite_token_hash", 128).notNull().unique(),
  invite_expires_at: timestamp("invite_expires_at").notNull(),
  accepted_at: timestamp("accepted_at"),
  created_at: createdAt(),
}, (table) => [
  uniqueIndex("playbook_collaborators_playbook_user_idx")
    .on(table.playbook_id, table.user_id)
    .where(sql`${table.user_id} is not null`),
]);

export const skills = mssqlTable("skills", {
  id: id("id"),
  playbook_id: foreignId("playbook_id").notNull()
    .references(() => playbooks.id, { onDelete: "cascade" }),
  publisher_id: foreignId("publisher_id"),
  name: shortText("name").notNull(),
  description: longText("description"),
  content: longText("content"),
  licence: shortText("licence", 128),
  created_at: createdAt(),
  priority: int("priority").default(50),
});

export const skillAttachments = mssqlTable("skill_attachments", {
  id: id("id"),
  skill_id: foreignId("skill_id").notNull()
    .references(() => skills.id, { onDelete: "cascade" }),
  filename: shortText("filename", 512).notNull(),
  file_type: shortText("file_type", 128).notNull(),
  language: shortText("language", 128),
  description: longText("description"),
  content: longText("content").notNull(),
  size_bytes: int("size_bytes").notNull(),
  created_at: createdAt(),
  updated_at: updatedAt(),
});

export const skillVersions = mssqlTable("skill_versions", {
  id: id("id"),
  playbook_id: foreignId("playbook_id").notNull()
    // SQL Server rejects the playbooks -> skills -> skill_versions and direct
    // playbooks -> skill_versions cascade combination as multiple cascade paths.
    .references(() => playbooks.id),
  skill_id: foreignId("skill_id").notNull()
    .references(() => skills.id, { onDelete: "cascade" }),
  name: shortText("name").notNull(),
  description: longText("description"),
  content: longText("content"),
  recorded_at: timestamp("recorded_at")
    .default(sql`sysdatetimeoffset()`)
    .notNull(),
});

export const memories = mssqlTable("memories", {
  id: id("id"),
  playbook_id: foreignId("playbook_id").notNull()
    .references(() => playbooks.id, { onDelete: "cascade" }),
  key: shortText("key", 450).notNull(),
  value: json<Record<string, unknown>>("value").notNull(),
  tags: json<string[]>("tags").default(sql`N'[]'`).notNull(),
  description: longText("description"),
  updated_at: updatedAt(),
  tier: nvarchar("tier", {
    length: 16,
    enum: ["working", "contextual", "longterm"],
  }).default("contextual").notNull(),
  parent_key: shortText("parent_key", 450),
  priority: int("priority").default(50).notNull(),
  access_count: int("access_count").default(0).notNull(),
  last_accessed_at: timestamp("last_accessed_at"),
  summary: longText("summary"),
  source_task_id: shortText("source_task_id", 255),
  retention_policy: nvarchar("retention_policy", {
    length: 16,
    enum: ["permanent", "session", "auto"],
  }),
  memory_type: nvarchar("memory_type", {
    length: 16,
    enum: ["flat", "hierarchical"],
  }).default("flat").notNull(),
  status: nvarchar("status", {
    length: 16,
    enum: ["pending", "running", "completed", "failed", "blocked"],
  }),
  metadata: json<Record<string, unknown>>("metadata").default(sql`N'{}'`),
}, (table) => [
  uniqueIndex("memories_playbook_key_idx").on(table.playbook_id, table.key),
  check("memories_value_json_check", sql`isjson(${table.value}) = 1`),
  check("memories_tags_json_check", sql`isjson(${table.tags}) = 1`),
  check(
    "memories_metadata_json_check",
    sql`${table.metadata} is null or isjson(${table.metadata}) = 1`,
  ),
  check(
    "memories_tier_check",
    sql`${table.tier} in (N'working', N'contextual', N'longterm')`,
  ),
  check(
    "memories_retention_policy_check",
    sql`${table.retention_policy} is null or ${table.retention_policy} in (N'permanent', N'session', N'auto')`,
  ),
  check(
    "memories_memory_type_check",
    sql`${table.memory_type} in (N'flat', N'hierarchical')`,
  ),
  check(
    "memories_status_check",
    sql`${table.status} is null or ${table.status} in (N'pending', N'running', N'completed', N'failed', N'blocked')`,
  ),
]);

export const mcpServers = mssqlTable("mcp_servers", {
  id: id("id"),
  playbook_id: foreignId("playbook_id").notNull()
    .references(() => playbooks.id, { onDelete: "cascade" }),
  publisher_id: foreignId("publisher_id"),
  name: shortText("name").notNull(),
  description: longText("description"),
  tools: json<unknown[]>("tools").default(sql`N'[]'`),
  resources: json<unknown[]>("resources").default(sql`N'[]'`),
  transport_type: nvarchar("transport_type", {
    length: 16,
    enum: ["stdio", "http", "sse", "openapi"],
  }),
  transport_config: json<Record<string, unknown>>("transport_config"),
  created_at: createdAt(),
}, (table) => [
  check(
    "mcp_servers_tools_json_check",
    sql`${table.tools} is null or isjson(${table.tools}) = 1`,
  ),
  check(
    "mcp_servers_resources_json_check",
    sql`${table.resources} is null or isjson(${table.resources}) = 1`,
  ),
  check(
    "mcp_servers_transport_config_json_check",
    sql`${table.transport_config} is null or isjson(${table.transport_config}) = 1`,
  ),
  check(
    "mcp_servers_transport_type_check",
    sql`${table.transport_type} is null or ${table.transport_type} in (N'stdio', N'http', N'sse', N'openapi')`,
  ),
]);

export const canvas = mssqlTable("canvas", {
  id: id("id"),
  playbook_id: foreignId("playbook_id").notNull()
    .references(() => playbooks.id, { onDelete: "cascade" }),
  name: shortText("name").notNull(),
  slug: shortText("slug", 450).notNull(),
  content: longText("content").default("").notNull(),
  sections: json<unknown[]>("sections").default(sql`N'[]'`),
  metadata: json<Record<string, unknown>>("metadata").default(sql`N'{}'`),
  sort_order: int("sort_order").default(0).notNull(),
  created_at: createdAt(),
  updated_at: updatedAt(),
}, (table) => [
  uniqueIndex("canvas_playbook_slug_idx").on(table.playbook_id, table.slug),
  check(
    "canvas_sections_json_check",
    sql`${table.sections} is null or isjson(${table.sections}) = 1`,
  ),
  check(
    "canvas_metadata_json_check",
    sql`${table.metadata} is null or isjson(${table.metadata}) = 1`,
  ),
]);

export const secrets = mssqlTable("secrets", {
  id: id("id"),
  playbook_id: foreignId("playbook_id").notNull()
    .references(() => playbooks.id, { onDelete: "cascade" }),
  name: shortText("name", 255).notNull(),
  description: longText("description"),
  encrypted_value: longText("encrypted_value").notNull(),
  iv: shortText("iv", 255).notNull(),
  auth_tag: shortText("auth_tag", 255).notNull(),
  category: nvarchar("category", {
    length: 32,
    enum: [
      "api_key",
      "password",
      "token",
      "certificate",
      "connection_string",
      "general",
    ],
  }).default("general").notNull(),
  rotated_at: timestamp("rotated_at"),
  expires_at: timestamp("expires_at"),
  last_used_at: timestamp("last_used_at"),
  use_count: int("use_count").default(0).notNull(),
  allow_api_key_reveal: bit("allow_api_key_reveal").default(false).notNull(),
  created_by: shortText("created_by"),
  updated_by: shortText("updated_by"),
  created_at: createdAt(),
  updated_at: updatedAt(),
}, (table) => [
  uniqueIndex("secrets_playbook_name_idx").on(table.playbook_id, table.name),
  check(
    "secrets_category_check",
    sql`${table.category} in (N'api_key', N'password', N'token', N'certificate', N'connection_string', N'general')`,
  ),
]);

export const apiKeys = mssqlTable("api_keys", {
  id: id("id"),
  playbook_id: foreignId("playbook_id").notNull()
    .references(() => playbooks.id, { onDelete: "cascade" }),
  key_hash: shortText("key_hash", 128).notNull().unique(),
  key_prefix: shortText("key_prefix", 64).notNull(),
  name: shortText("name"),
  role: nvarchar("role", {
    length: 16,
    enum: ["viewer", "coworker", "admin"],
  }).default("viewer").notNull(),
  permissions: json<string[]>("permissions").default(sql`N'[]'`).notNull(),
  last_used_at: timestamp("last_used_at"),
  expires_at: timestamp("expires_at"),
  rotated_at: timestamp("rotated_at"),
  is_active: bit("is_active").default(true).notNull(),
  created_at: createdAt(),
}, (table) => [
  check("api_keys_permissions_json_check", sql`isjson(${table.permissions}) = 1`),
  check(
    "api_keys_role_check",
    sql`${table.role} in (N'viewer', N'coworker', N'admin')`,
  ),
]);

export const userApiKeys = mssqlTable("user_api_keys", {
  id: id("id"),
  user_id: foreignId("user_id").notNull(),
  key_hash: shortText("key_hash", 128).notNull().unique(),
  key_prefix: shortText("key_prefix", 64).notNull(),
  name: shortText("name"),
  permissions: json<string[]>("permissions").default(sql`N'[]'`).notNull(),
  last_used_at: timestamp("last_used_at"),
  expires_at: timestamp("expires_at"),
  is_active: bit("is_active").default(true).notNull(),
  created_at: createdAt(),
}, (table) => [
  check(
    "user_api_keys_permissions_json_check",
    sql`isjson(${table.permissions}) = 1`,
  ),
]);

export const profiles = mssqlTable("profiles", {
  id: id("id"),
  auth_user_id: foreignId("auth_user_id"),
  display_name: shortText("display_name").notNull(),
  avatar_svg: longText("avatar_svg"),
  website_url: shortText("website_url", 2048),
  description: longText("description"),
  is_verified: bit("is_verified").default(false).notNull(),
  is_virtual: bit("is_virtual").default(false).notNull(),
  created_at: createdAt(),
  updated_at: updatedAt(),
});
