# Public function hardening review — 2026-09-13

Scope: `20260913173449_harden_public_functions.sql` (PR #107).

The migration changes function configuration and direct EXECUTE grants only.
It preserves function identities, bodies, signatures, SECURITY DEFINER settings,
table grants, RLS policies, existing trigger bindings and user data.

## Production inspection

- All ten targeted functions exist with the exact expected signatures; their
  bodies match the consolidated schema. All are owned by postgres, with no
  function-local search_path and explicit EXECUTE grants to anon, authenticated
  and service_role, plus inherited PUBLIC execution.
- The eight trigger functions are used by auth.users, playbooks, skills,
  playbook_stars, skill_attachments, profiles, secrets and memories.
- The newer track_memory_history function is already hardened and excluded.
- anon and authenticated cannot CREATE in public. A migration precondition
  checks this prerequisite; pg_catalog precedes public and pg_temp is last.
- No repository caller, documentation, database function, policy or registered
  dependency references the two standalone helpers. No matching PostgREST RPC
  calls were found in the retained pg_stat_statements entries. Statistics are
  bounded by retention/reset and cannot rule out unknown external clients.
- increment_usage_count references public_skills/public_mcp_servers, both absent
  in production. Its legacy update branches already cannot succeed. The
  migration preserves the helper for the server but does not repair it.
- The active attachment API inserts into skill_attachments after application
  authorization, rather than calling add_skill_attachment. Direct table access
  and its row policies are unchanged.

## Executable checks

`tests/database-function-hardening.test.ts` runs the same workflows before and
after migration on PostgreSQL/PGlite with the repository's actual baseline,
constraints, RLS, triggers, and latest memory-history migration. Only the
Supabase-managed Auth scaffolding and extension setup are substituted locally.

Twenty checks cover Auth profile creation (provider name and email fallback),
private-playbook visibility, persona/skill versioning, star/unstar and nested
triggers, attachment CRUD/limit, profile/vault/memory timestamps, server helper
execution, blocked direct RPCs, temp-schema shadowing, memory history,
idempotency and rejection of an unsafe public-schema configuration.

The intended compatibility change is that direct anon/authenticated SQL RPC
calls to the two internal helpers are rejected. Playbook API keys, REST/MCP
routes and the application's server-side service_role path retain access.

Apply in one transaction with short lock/statement timeouts. Record the exact
SQL and pre-change rollback statements in the migration history, and verify
function ACLs, unchanged bodies/triggers/RLS and the security advisor afterward.
