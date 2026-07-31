/**
 * Drizzle ORM Schema: Canvas
 */
import { foreignKey, pgTable, uuid, text, timestamp, jsonb, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { playbooks } from "./playbooks";

export const playbookRuns = pgTable("playbook_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  playbook_id: uuid("playbook_id").notNull().references(() => playbooks.id, { onDelete: "cascade" }),
  created_by: uuid("created_by"),
  name: text("name").notNull(),
  status: text("status", { enum: ["active", "completed", "archived"] }).default("active").notNull(),
  context: jsonb("context").default({}).$type<Record<string, unknown>>().notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("playbook_runs_id_playbook_unique").on(table.id, table.playbook_id),
]);

export const canvas = pgTable("canvas", {
  id: uuid("id").primaryKey().defaultRandom(),
  playbook_id: uuid("playbook_id").notNull().references(() => playbooks.id, { onDelete: "cascade" }),
  run_id: uuid("run_id").notNull(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  content: text("content").notNull().default(""),
  sections: jsonb("sections").default([]),
  metadata: jsonb("metadata").default({}).$type<Record<string, unknown>>(),
  sort_order: integer("sort_order").default(0).notNull(),
  version: integer("version").default(1).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("canvas_run_slug_unique").on(table.run_id, table.slug),
  foreignKey({
    columns: [table.run_id, table.playbook_id],
    foreignColumns: [playbookRuns.id, playbookRuns.playbook_id],
    name: "canvas_run_playbook_fk",
  }).onDelete("cascade"),
]);
