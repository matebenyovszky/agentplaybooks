/**
 * Database Connection Factory
 * 
 * Creates a Drizzle ORM instance based on the configured dialect.
 * Supports PostgreSQL (default, Supabase-compatible) and Microsoft SQL Server.
 * 
 * Configuration via environment variables:
 *   DB_DIALECT=postgres|mssql  (default: postgres)
 *   DATABASE_URL=...           (connection string)
 * 
 * For Supabase deployments, falls back to NEXT_PUBLIC_SUPABASE_URL + service role key
 * to construct a direct PostgreSQL connection string.
 */

import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzleMsSql } from "drizzle-orm/node-mssql";
import * as postgresSchema from "./schema";
import * as mssqlSchema from "./schema/mssql";

export type DatabaseDialect = "postgres" | "mssql";

type PostgresDb = ReturnType<typeof createPostgresDb>;
export type DbInstance = PostgresDb;

let _db: DbInstance | null = null;

export function getDatabaseDialect(
  configuredDialect = process.env.DB_DIALECT,
): DatabaseDialect {
  const dialect = configuredDialect?.trim().toLowerCase() || "postgres";
  if (dialect === "postgres" || dialect === "postgresql") {
    return "postgres";
  }
  if (dialect === "mssql" || dialect === "sqlserver") {
    return "mssql";
  }
  throw new Error(
    `Unsupported DB_DIALECT "${configuredDialect}". Expected "postgres" or "mssql".`,
  );
}

/**
 * Get the database connection URL.
 * 
 * Priority:
 * 1. DATABASE_URL env var (explicit, works for both PG and MSSQL)
 * 2. Supabase project URL + database password → construct direct PG connection
 */
function getDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  if (getDatabaseDialect() === "mssql") {
    throw new Error(
      "DATABASE_URL is required when DB_DIALECT=mssql.",
    );
  }

  // Fallback: derive from Supabase project URL
  // Supabase URL format: https://PROJECT_REF.supabase.co
  // Direct PG format:    postgresql://postgres.[PROJECT_REF]:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseUrl) {
    const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
    // A Supabase service-role key is a JWT for the Data API, not a PostgreSQL
    // password. Treating it as one makes otherwise valid Supabase deployments
    // fail every Drizzle query with a database authentication error.
    const password = process.env.SUPABASE_DB_PASSWORD;
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
 * Whether the deployment has enough configuration for a direct database
 * connection. Supabase-only deployments intentionally use the Data API.
 */
export function hasDirectDatabaseConnection(
  configuredDialect = process.env.DB_DIALECT,
  databaseUrl = process.env.DATABASE_URL,
  supabaseDbPassword = process.env.SUPABASE_DB_PASSWORD,
): boolean {
  return Boolean(
    databaseUrl
      || (getDatabaseDialect(configuredDialect) === "postgres" && supabaseDbPassword),
  );
}

/**
 * The public schema has the PostgreSQL type shape for backwards compatibility
 * with the routes already migrated to Drizzle. At runtime it contains genuine
 * MSSQL table objects when DB_DIALECT=mssql, so the MSSQL query builder receives
 * the correct column metadata.
 */
export const schema = (
  getDatabaseDialect() === "mssql" ? mssqlSchema : postgresSchema
) as unknown as typeof postgresSchema;

function createPostgresDb() {
  return drizzlePg({
    connection: { connectionString: getDatabaseUrl() },
  });
}

function createMsSqlDb(): DbInstance {
  return drizzleMsSql(getDatabaseUrl()) as unknown as DbInstance;
}

/**
 * Create a new Drizzle ORM instance using the configured database dialect.
 */
export function createDb(): DbInstance {
  return getDatabaseDialect() === "mssql"
    ? createMsSqlDb()
    : createPostgresDb();
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

export function resetDbForTests(): void {
  _db = null;
}
