/**
 * Drizzle ORM Schema: Memories
 */
import { pgTable, uuid, text, timestamp, jsonb, integer, pgEnum } from "drizzle-orm/pg-core";
import { playbooks } from "./playbooks";

export const memoryTierEnum = pgEnum("memory_tier", ["working", "contextual", "longterm"]);
export const retentionPolicyEnum = pgEnum("retention_policy", ["permanent", "session", "auto"]);
export const memoryTypeEnum = pgEnum("memory_type", ["flat", "hierarchical"]);
export const memoryStatusEnum = pgEnum("memory_status", ["pending", "running", "completed", "failed", "blocked"]);

export const memories = pgTable("memories", {
  id: uuid("id").primaryKey().defaultRandom(),
  playbook_id: uuid("playbook_id").notNull().references(() => playbooks.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  value: jsonb("value").notNull().$type<Record<string, unknown>>(),
  tags: text("tags").array().default([]).notNull(),
  description: text("description"),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  // RLM fields
  tier: memoryTierEnum("tier").default("contextual").notNull(),
  parent_key: text("parent_key"),
  priority: integer("priority").default(50).notNull(),
  access_count: integer("access_count").default(0).notNull(),
  last_accessed_at: timestamp("last_accessed_at", { withTimezone: true }),
  summary: text("summary"),
  source_task_id: text("source_task_id"),
  retention_policy: retentionPolicyEnum("retention_policy"),
  // Hierarchical graph memory fields
  memory_type: memoryTypeEnum("memory_type").default("flat").notNull(),
  status: memoryStatusEnum("status"),
  metadata: jsonb("metadata").default({}).$type<Record<string, unknown>>(),
});
