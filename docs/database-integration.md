# Database Integration Concept (Local Postgres & MS SQL)

AgentPlaybooks currently uses Supabase (Postgres) via the `@supabase/supabase-js` client. To support self-hosted, local database deployments (such as bare-metal Postgres or MS SQL Server), there are two primary architectural paths.

## 1. Storage Adapter Pattern (Quickest path)

The application already abstracts some logic via the `StorageAdapter` interface (see `src/lib/storage/types.ts`). Currently, we have a `SupabaseAdapter` implementation. 

We can create new adapter implementations for direct database connections:

- **LocalPostgresAdapter**: Uses `pg` or `postgres` to connect to a local Postgres database.
- **MSSQLAdapter**: Uses the `mssql` package (tedious) to run T-SQL queries against a local MS SQL Server.

The API routes would then instantiate the correct adapter based on an environment variable (e.g., `DATABASE_PROVIDER=mssql`).

**Pros**: 
- Minimal changes to the existing `SupabaseAdapter` logic.
- Quick to prototype.

**Cons**:
- SQL queries need to be hand-written and maintained twice (once for Postgres dialect, once for T-SQL dialect).

## 2. ORM Integration (Robust, long-term path)

For a truly database-agnostic application, integrating an Object-Relational Mapper (ORM) is the recommended approach. 

- **Prisma ORM** or **Drizzle ORM** abstract the SQL generation.
- A central `schema.prisma` defines the tables (Playbooks, Secrets, Memories, Personas, etc.).
- Prisma officially supports PostgreSQL, MySQL, SQLite, and MS SQL Server out of the box.

The migration path would involve:
1. Translating the current Supabase RLS policies into application-layer checks inside the new ORM-based adapter.
2. Generating the Prisma schema from the existing Postgres database.
3. Swapping out the `supabase.from("...")` calls with `prisma.playbooks.findUnique(...)` calls.

**Pros**:
- Single codebase for all database providers.
- Type-safety guaranteed by the ORM.
- Easy to add new database support in the future (e.g., MySQL, SQLite).

**Cons**:
- Initial refactoring effort to move away from Supabase client libraries for CRUD operations.
- Application-layer security checks must replace Supabase Row Level Security (RLS).
