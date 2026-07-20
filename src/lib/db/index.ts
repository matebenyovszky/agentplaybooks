/**
 * Database Connection Factory
 * 
 * Creates a Drizzle ORM instance based on the configured dialect.
 * Supports PostgreSQL (default, Supabase-compatible) and MSSQL (enterprise).
 * 
 * Configuration via environment variables:
 *   DB_DIALECT=postgres|mssql  (default: postgres)
 *   DATABASE_URL=...           (connection string)
 * 
 * For Supabase deployments, falls back to NEXT_PUBLIC_SUPABASE_URL + service role key
 * to construct a direct PostgreSQL connection string.
 */

import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

export type DbInstance = ReturnType<typeof createDb>;

let _db: DbInstance | null = null;

/**
 * Get the database connection URL.
 * 
 * Priority:
 * 1. DATABASE_URL env var (explicit, works for both PG and MSSQL)
 * 2. Supabase project URL + service role key → construct direct PG connection
 */
function getDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  // Fallback: derive from Supabase project URL
  // Supabase URL format: https://PROJECT_REF.supabase.co
  // Direct PG format:    postgresql://postgres.[PROJECT_REF]:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseUrl) {
    const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
    const password = process.env.SUPABASE_DB_PASSWORD || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (projectRef && password) {
      // Use Supavisor pooler (port 6543) for serverless compatibility
      return `postgresql://postgres.${projectRef}:${password}@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`;
    }
  }

  throw new Error(
    "No database connection configured. Set DATABASE_URL or NEXT_PUBLIC_SUPABASE_URL + SUPABASE_DB_PASSWORD."
  );
}

/**
 * Create a new Drizzle ORM instance.
 * Uses the configured dialect (postgres or mssql).
 */
export function createDb() {
  const dialect = process.env.DB_DIALECT || "postgres";

  if (dialect === "mssql") {
    throw new Error("MSSQL dialect requires external driver implementation in this version.");
  }

  return drizzlePg({
    connection: { connectionString: getDatabaseUrl() },
    schema,
  });
}

/**
 * Get a singleton database instance.
 * Reuses the same connection across requests (important for connection pooling).
 */
export function getDb(): DbInstance {
  if (!_db) {
    _db = createDb();
  }
  return _db;
}

// Re-export schema for convenient imports
export { schema };
