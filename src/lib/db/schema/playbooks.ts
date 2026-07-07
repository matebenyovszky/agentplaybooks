/**
 * Drizzle ORM Schema: Playbooks
 */
import { pgTable, uuid, text, timestamp, jsonb, integer, pgEnum } from "drizzle-orm/pg-core";

export const visibilityEnum = pgEnum("visibility", ["public", "private", "unlisted"]);

export const playbooks = pgTable("playbooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull(),
  publisher_id: uuid("publisher_id"),
  guid: text("guid").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  config: jsonb("config").default({}).$type<Record<string, unknown>>(),
  visibility: visibilityEnum("visibility").default("private").notNull(),
  star_count: integer("star_count").default(0).notNull(),
  tags: text("tags").array().default([]).notNull(),
  // 1 Playbook = 1 Persona (embedded)
  persona_name: text("persona_name"),
  persona_system_prompt: text("persona_system_prompt"),
  persona_metadata: jsonb("persona_metadata").$type<Record<string, unknown>>(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const playbookStars = pgTable("playbook_stars", {
  id: uuid("id").primaryKey().defaultRandom(),
  playbook_id: uuid("playbook_id").notNull().references(() => playbooks.id, { onDelete: "cascade" }),
  user_id: uuid("user_id").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
