/**
 * Drizzle ORM Schema: Playbooks
 */
import { pgTable, uuid, text, timestamp, jsonb, integer, pgEnum, uniqueIndex } from "drizzle-orm/pg-core";

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

/**
 * Human access to a playbook. Pending rows contain an invite hash and no user;
 * accepting an invite binds the row to exactly one authenticated account.
 */
export const playbookCollaborators = pgTable("playbook_collaborators", {
  id: uuid("id").primaryKey().defaultRandom(),
  playbook_id: uuid("playbook_id").notNull().references(() => playbooks.id, { onDelete: "cascade" }),
  user_id: uuid("user_id"),
  invited_by: uuid("invited_by").notNull(),
  invite_token_hash: text("invite_token_hash").notNull().unique(),
  invite_expires_at: timestamp("invite_expires_at", { withTimezone: true }).notNull(),
  accepted_at: timestamp("accepted_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("playbook_collaborators_playbook_user_idx")
    .on(table.playbook_id, table.user_id),
]);
