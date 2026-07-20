# Enterprise Database ORM Migration, Python Docs & Container Support

## Background

The current codebase uses the **Supabase JS SDK** (`@supabase/supabase-js`) with raw `.from("table").select()` query-builder calls in **13+ API route files** totalling ~7,300 lines of direct database access. This approach is tightly coupled to Supabase/PostgreSQL and cannot work with Microsoft SQL Server or other databases.

We also need Python sample code for the secrets proxy/reveal API, and proper Docker containerization for enterprise self-hosting.

---

## 1. Python Sample Code (Documentation)

> [!NOTE]
> Quick win — no backend changes needed, only documentation updates.

### New file: `public/docs/secrets-python-examples.md`

A dedicated documentation page with ready-to-use Python examples for:
- **Proxy pattern** (`use_secret` via MCP and REST `/proxy`)
- **Reveal pattern** (when `allow_api_key_reveal` is enabled)
- **Store / Rotate / Delete** secrets via API

### Updates to existing docs

#### [MODIFY] [api-reference.md](file:///Users/matebenyovszky/Code/agentplaybooks/public/docs/api-reference.md)
- Add link to the new Python examples page in the Secrets section

#### [MODIFY] Blog posts (EN/HU/DE/ES)
- Add a "Python Integration" section to each `secrets-vault-*.md` blog post with a short code snippet and link to the full examples page

---

## 2. ORM Selection: **Drizzle ORM**

### Why Drizzle over Prisma?

| Factor | Drizzle | Prisma |
|--------|---------|--------|
| **Bundle size** | ~12-57 KB | ~1.6 MB |
| **Edge/Cloudflare** | ✅ First-class support | ⚠️ Improved in v7 but heavier |
| **MSSQL support** | ✅ `drizzle-orm/mssql-core` | ✅ Native |
| **Schema definition** | TypeScript (no codegen step) | `.prisma` DSL + `prisma generate` |
| **SQL proximity** | SQL-like API, full control | Abstracted, less control |
| **Build pipeline** | No generation step needed | Requires `prisma generate` |
| **Migrations** | `drizzle-kit` (SQL-based, reviewable) | Prisma Migrate |
| **Our use case fit** | Existing Supabase queries map directly | Would require rewriting query patterns |

> [!IMPORTANT]
> **Drizzle is the clear winner** for our use case because:
> 1. We already run on **Cloudflare Workers** where bundle size matters
> 2. Our queries are already SQL-like (Supabase query builder), so migration is natural
> 3. No build/codegen step — types come directly from schema files
> 4. Native `drizzle-orm/mssql-core` for enterprise MSSQL support
> 5. Same schema files generate migrations for both PostgreSQL and MSSQL

### Migration Strategy: **Incremental (Table-by-Table)**

Rather than a big-bang rewrite, we migrate one table/domain at a time. The existing Supabase Auth client remains for authentication — we only replace the database query layer.

```
Phase 0: Setup (Drizzle config, schema, DB connection)
Phase 1: Shared layer (auth queries, guards)  ← smallest surface, highest reuse
Phase 2: Secrets API                          ← already has tests, good proving ground  
Phase 3: Memory/Canvas APIs                   ← moderate complexity
Phase 4: Playbooks/Skills/MCP APIs            ← largest files (~5000 lines)
Phase 5: MCP Manage API                       ← final DB migration
Phase 6: Auth.js (NextAuth.js) Integration    ← fully local/MSSQL auth (Azure AD/Credentials)
```

Each phase is independently deployable. The Supabase Auth SDK stays in place for JWT/OAuth (it doesn't touch the DB directly for queries).

---

## Proposed Changes

### Phase 0: Setup & Schema

#### [NEW] `src/lib/db/schema/playbooks.ts`
Drizzle schema for `playbooks`, `playbook_stars` tables using `pgTable` / `mssqlTable`.

#### [NEW] `src/lib/db/schema/skills.ts`
Drizzle schema for `skills`, `skill_attachments`, `skill_versions` tables.

#### [NEW] `src/lib/db/schema/memories.ts`
Drizzle schema for `memories` table with RLM fields.

#### [NEW] `src/lib/db/schema/secrets.ts`
Drizzle schema for `secrets` table.

#### [NEW] `src/lib/db/schema/api-keys.ts`
Drizzle schema for `api_keys`, `user_api_keys` tables.

#### [NEW] `src/lib/db/schema/canvas.ts`
Drizzle schema for `canvas` table.

#### [NEW] `src/lib/db/schema/mcp-servers.ts`
Drizzle schema for `mcp_servers` table.

#### [NEW] `src/lib/db/schema/profiles.ts`
Drizzle schema for `profiles` table.

#### [NEW] `src/lib/db/schema/index.ts`
Re-exports all schemas + relations.

#### [NEW] `src/lib/db/index.ts`
Database connection factory with dialect detection:

```typescript
// Pseudo-code
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { drizzle as drizzleMssql } from 'drizzle-orm/node-mssql';

export function createDb() {
  const dialect = process.env.DB_DIALECT || 'postgres'; // 'postgres' | 'mssql'
  
  if (dialect === 'mssql') {
    return drizzleMssql(process.env.DATABASE_URL!);
  }
  return drizzlePg(process.env.DATABASE_URL!);
}
```

#### [NEW] `src/lib/db/migrate.ts`
Migration runner supporting both dialects.

#### [NEW] `drizzle.config.ts`
Drizzle Kit configuration for schema introspection and migration generation.

---

### Phase 1: Shared Layer

#### [MODIFY] [supabase.ts](file:///Users/matebenyovszky/Code/agentplaybooks/src/app/api/_shared/supabase.ts)
- Keep `getSupabase()` for **auth-only** operations (JWT validation)
- Add `getDb()` export that returns the Drizzle instance
- Deprecate `getServiceSupabase()` with a migration path

#### [MODIFY] [auth.ts](file:///Users/matebenyovszky/Code/agentplaybooks/src/app/api/_shared/auth.ts)
- Replace `supabase.from("api_keys")` and `supabase.from("user_api_keys")` queries with Drizzle equivalents
- Keep `supabase.auth.setSession()` / `supabase.auth.getUser()` calls (Supabase Auth SDK stays)

#### [MODIFY] [guards.ts](file:///Users/matebenyovszky/Code/agentplaybooks/src/app/api/_shared/guards.ts)
- Replace `supabase.from("playbooks")` queries with Drizzle

---

### Phase 2: Secrets API (Proving Ground)

#### [MODIFY] [app.ts](file:///Users/matebenyovszky/Code/agentplaybooks/src/app/api/playbooks/%5Bguid%5D/secrets/app.ts)
- Replace all `getServiceSupabase().from("secrets")` calls with Drizzle queries
- Keep crypto module unchanged

#### [MODIFY] [secrets.test.ts](file:///Users/matebenyovszky/Code/agentplaybooks/tests/api/secrets.test.ts)
- Update mocks to work with Drizzle
- Add tests for both PostgreSQL and MSSQL dialects

---

### Phase 3-5: Remaining APIs

#### [MODIFY] Memory, Canvas, Playbooks, Skills, MCP route files
- Same pattern: replace `supabase.from()` with `db.select()`, `db.insert()`, etc.
- Each route file gets its own test file

---

### Phase 6: Auth.js (NextAuth.js) Integration

To enable a fully localized or Microsoft SQL Server (Enterprise) deployment without relying on Supabase Auth, we will implement **Auth.js (NextAuth.js v5)**.

#### [NEW] `src/lib/db/schema/auth.ts`
Add Auth.js standard schemas for Drizzle (`users`, `accounts`, `sessions`, `verification_tokens`).

#### [NEW] `auth.ts` / `app/api/auth/[...nextauth]/route.ts`
Implement NextAuth setup with `@auth/drizzle-adapter`.
Providers:
- **Credentials** (Email/Password for basic local dev)
- **Azure AD (Microsoft Entra ID)** (Enterprise)
- **GitHub** (Standard developer login)

#### [MODIFY] `src/app/api/_shared/auth.ts`
Abstract the JWT/Session validation.
- If `process.env.AUTH_PROVIDER === 'supabase'`, use existing Supabase Auth logic.
- If `process.env.AUTH_PROVIDER === 'next-auth'`, use `auth()` from Auth.js.

---

## 3. Docker / Enterprise Container Support

#### [NEW] `Dockerfile`
Multi-stage production Dockerfile (Node.js 20 Alpine):
- Build stage: `npm ci && npm run build`
- Runtime stage: standalone Next.js output
- Non-root user, health check, proper signal handling

#### [NEW] `docker-compose.yml`
Full stack with:
- `app` service (the Next.js app)
- `postgres` service (PostgreSQL 16 with volume)
- Optional `mssql` service (SQL Server 2022 for enterprise testing)
- Environment variable templates

#### [NEW] `docker-compose.mssql.yml`
Override compose file for MSSQL-based deployments.

#### [NEW] `.dockerignore`
Excludes `node_modules`, `.next`, `.git`, etc.

#### [MODIFY] [self-hosting.md](file:///Users/matebenyovszky/Code/agentplaybooks/public/docs/self-hosting.md)
- Update Docker section with actual working Dockerfile and compose files
- Add MSSQL deployment section
- Add environment variable reference for `DB_DIALECT` and `DATABASE_URL`

---

## Open Questions

> [!IMPORTANT]
> **Migration approach for production:** When deploying the Drizzle migration to the existing Supabase PostgreSQL database, should we use `drizzle-kit push` (auto-apply), or should we generate SQL migrations and apply them manually (safer, auditable)?

---

## Verification Plan

### Automated Tests

```bash
# Run existing tests (Phase 2 first)
npm run test tests/api/secrets.test.ts

# New integration tests with actual DB
npm run test tests/db/

# Build verification
npm run build

# Docker build
docker compose build
docker compose up -d
docker compose exec app curl http://localhost:3000/api/health
```

### Manual Verification

1. Deploy to staging → verify all CRUD operations on secrets, memory, canvas, skills, playbooks
2. Test Docker compose with PostgreSQL
3. Test Docker compose with MSSQL (enterprise scenario)
4. Verify Python sample code works against the live API
