/**
 * Drizzle ORM Schema: Secrets
 */
import { pgTable, uuid, text, timestamp, integer, boolean, pgEnum } from "drizzle-orm/pg-core";
import { playbooks } from "./playbooks";

export const secretCategoryEnum = pgEnum("secret_category", [
  "api_key", "password", "token", "certificate", "connection_string", "general",
]);

export const secrets = pgTable("secrets", {
  id: uuid("id").primaryKey().defaultRandom(),
  playbook_id: uuid("playbook_id").notNull().references(() => playbooks.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  encrypted_value: text("encrypted_value").notNull(),
  iv: text("iv").notNull(),
  auth_tag: text("auth_tag").notNull(),
  category: secretCategoryEnum("category").default("general").notNull(),
  rotated_at: timestamp("rotated_at", { withTimezone: true }),
  expires_at: timestamp("expires_at", { withTimezone: true }),
  last_used_at: timestamp("last_used_at", { withTimezone: true }),
  use_count: integer("use_count").default(0).notNull(),
  allow_api_key_reveal: boolean("allow_api_key_reveal").default(false).notNull(),
  created_by: text("created_by"),
  updated_by: text("updated_by"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
