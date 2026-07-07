/**
 * Drizzle ORM Schema: Skills
 */
import { pgTable, uuid, text, timestamp, integer } from "drizzle-orm/pg-core";
import { playbooks } from "./playbooks";

export const skills = pgTable("skills", {
  id: uuid("id").primaryKey().defaultRandom(),
  playbook_id: uuid("playbook_id").notNull().references(() => playbooks.id, { onDelete: "cascade" }),
  publisher_id: uuid("publisher_id"),
  name: text("name").notNull(),
  description: text("description"),
  content: text("content"),
  licence: text("licence"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  priority: integer("priority").default(50),
});

export const skillAttachments = pgTable("skill_attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  skill_id: uuid("skill_id").notNull().references(() => skills.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  file_type: text("file_type").notNull(),
  language: text("language"),
  description: text("description"),
  content: text("content").notNull(),
  size_bytes: integer("size_bytes").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const skillVersions = pgTable("skill_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  playbook_id: uuid("playbook_id").notNull().references(() => playbooks.id, { onDelete: "cascade" }),
  skill_id: uuid("skill_id").notNull().references(() => skills.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  content: text("content"),
  recorded_at: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
});
