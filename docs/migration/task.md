# Implementation Tasks

## Python Sample Code & Documentation
- [x] Create `public/docs/secrets-python-examples.md` with proxy/reveal/store examples
- [x] Update `api-reference.md` with link to Python examples
- [x] Update blog posts (EN/HU/DE/ES) with Python snippet

## Phase 0: Drizzle ORM Setup
- [x] Install Drizzle dependencies (`drizzle-orm`, `drizzle-kit`, `pg`, `@types/pg`)
- [x] Create `drizzle.config.ts`
- [x] Create `src/lib/db/schema/playbooks.ts`
- [x] Create `src/lib/db/schema/skills.ts`
- [x] Create `src/lib/db/schema/memories.ts`
- [x] Create `src/lib/db/schema/secrets.ts`
- [x] Create `src/lib/db/schema/api-keys.ts`
- [x] Create `src/lib/db/schema/canvas.ts`
- [x] Create `src/lib/db/schema/mcp-servers.ts`
- [x] Create `src/lib/db/schema/profiles.ts`
- [x] Create `src/lib/db/schema/index.ts`
- [x] Create `src/lib/db/index.ts` (connection factory)
- [x] Verify build passes with new schemas

## Phase 1: Shared Layer Migration (Complete)
- [x] Migrate `_shared/supabase.ts` — add `getDb()`
- [x] Migrate `_shared/auth.ts` — API key queries
- [x] Migrate `_shared/guards.ts` — playbook queries
- [x] Verify build passes (0 errors/warnings)

## Phase 2: Secrets API Migration
- [ ] Migrate `secrets/app.ts` to Drizzle
- [ ] Update `secrets.test.ts`
- [ ] Verify build

## Phase 3-5: Remaining API Routes
- [ ] Memory/Canvas APIs
- [ ] Playbooks/Skills/MCP APIs
- [ ] MCP Manage API

## Phase 6: Auth.js (NextAuth.js) Integration
- [ ] Create `src/lib/db/schema/auth.ts`
- [ ] Implement `app/api/auth/[...nextauth]/route.ts` with Azure AD & Credentials
- [ ] Update `_shared/auth.ts` to support both Supabase and NextAuth

## Docker / Enterprise Support
- [x] Create `Dockerfile`
- [x] Create `docker-compose.yml` (PostgreSQL)
- [x] Create `docker-compose.mssql.yml` (MSSQL override)
- [x] Create `.dockerignore`
- [ ] Update `self-hosting.md`

## Verification
- [x] All tests pass (4/4)
- [x] Build succeeds (zero errors, zero warnings)
- [ ] Docker build test
