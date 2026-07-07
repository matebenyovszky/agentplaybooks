/**
 * Drizzle ORM Schema: Canvas
 */
import { pgTable, uuid, text, timestamp, jsonb, integer } from "drizzle-orm/pg-core";
import { playbooks } from "./playbooks";

export const canvas = pgTable("canvas", {
  id: uuid("id").primaryKey().defaultRandom(),
  playbook_id: uuid("playbook_id").notNull().references(() => playbooks.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  content: text("content").notNull().default(""),
  sections: jsonb("sections").default([]),
  metadata: jsonb("metadata").default({}).$type<Record<string, unknown>>(),
  sort_order: integer("sort_order").default(0).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
