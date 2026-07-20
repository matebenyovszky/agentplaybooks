/**
 * Drizzle ORM Schema: Profiles
 */
import { pgTable, uuid, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  auth_user_id: uuid("auth_user_id"),
  display_name: text("display_name").notNull(),
  avatar_svg: text("avatar_svg"),
  website_url: text("website_url"),
  description: text("description"),
  is_verified: boolean("is_verified").default(false).notNull(),
  is_virtual: boolean("is_virtual").default(false).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
