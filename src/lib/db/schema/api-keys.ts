/**
 * Drizzle ORM Schema: API Keys
 */
import { pgTable, uuid, text, timestamp, boolean, pgEnum } from "drizzle-orm/pg-core";
import { playbooks } from "./playbooks";

export const apiKeyRoleEnum = pgEnum("api_key_role", ["viewer", "coworker", "admin"]);

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  playbook_id: uuid("playbook_id").notNull().references(() => playbooks.id, { onDelete: "cascade" }),
  key_hash: text("key_hash").notNull().unique(),
  key_prefix: text("key_prefix").notNull(),
  name: text("name"),
  role: apiKeyRoleEnum("role").default("viewer").notNull(),
  permissions: text("permissions").array().default([]).notNull(),
  last_used_at: timestamp("last_used_at", { withTimezone: true }),
  expires_at: timestamp("expires_at", { withTimezone: true }),
  rotated_at: timestamp("rotated_at", { withTimezone: true }),
  is_active: boolean("is_active").default(true).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const userApiKeys = pgTable("user_api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull(),
  key_hash: text("key_hash").notNull().unique(),
  key_prefix: text("key_prefix").notNull(),
  name: text("name"),
  permissions: text("permissions").array().default([]).notNull(),
  last_used_at: timestamp("last_used_at", { withTimezone: true }),
  expires_at: timestamp("expires_at", { withTimezone: true }),
  is_active: boolean("is_active").default(true).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
