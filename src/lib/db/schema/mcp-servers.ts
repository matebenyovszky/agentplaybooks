/**
 * Drizzle ORM Schema: MCP Servers
 */
import { pgTable, uuid, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { playbooks } from "./playbooks";

export const mcpServers = pgTable("mcp_servers", {
  id: uuid("id").primaryKey().defaultRandom(),
  playbook_id: uuid("playbook_id").notNull().references(() => playbooks.id, { onDelete: "cascade" }),
  publisher_id: uuid("publisher_id"),
  name: text("name").notNull(),
  description: text("description"),
  tools: jsonb("tools").default([]),
  resources: jsonb("resources").default([]),
  transport_type: text("transport_type", { enum: ["stdio", "http", "sse", "openapi"] }),
  transport_config: jsonb("transport_config").$type<Record<string, unknown>>(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
