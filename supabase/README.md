# Database

## `schema.sql` — start here for a new project

A snapshot of the entire current schema in one file: enum types, tables,
constraints, indexes, functions, triggers, RLS flags and policies. Apply it to
an empty Supabase project and the database is ready.

It exists because `migrations/` never had a baseline. Every file in there is
incremental, so there was no `CREATE TABLE` anywhere for `playbooks`, `skills`,
`mcp_servers`, `memories`, `api_keys`, `profiles` or `playbook_stars` — the
schema could not be built from this repository at all. The live database had 32
applied migrations against 17 files here; the snapshot closes that gap without
committing 15 files of history nobody needs to replay.

It is generated from a live database's catalogs, so it reflects what is actually
deployed rather than what the migration files imply.

## `migrations/` — forward history only

Changes made *after* the snapshot. Do not apply the older ones on top of
`schema.sql`: the snapshot already contains their result, so re-running them
fails on objects that already exist.

When you change the schema, add a migration here **and** regenerate
`schema.sql` from a database where that migration has been applied, so the two
never disagree.

## Requires the Supabase stack

`schema.sql` references `auth.users` and its policies call `auth.uid()`. A bare
PostgreSQL server will reject it — run the
[self-hosted Supabase stack](https://supabase.com/docs/guides/self-hosting/docker)
if you need this on-premise.

## A note on RLS

Sensitive tables have RLS enabled, but RLS is not the
primary authorization mechanism: almost every API route queries with the
service-role key, which bypasses it. Authorization lives in
`src/app/api/_shared/guards.ts`.

RLS *is* load-bearing for the endpoints that read public playbooks with the
anon key — the MCP manifest at `/api/mcp/:guid` and the public skills/MCP
listings. Those depend on the six `FOR SELECT TO public` policies on
`playbooks`, `skills`, `mcp_servers` and `skill_attachments`. Removing them as
apparently-dead code breaks those endpoints rather than merely tightening them.

Policies written against `auth.uid()` are currently inert, because no
JWT-bearing client queries tables directly — the browser talks only to
`/api/*`.

`playbook_snapshots` is intentionally private: RLS is enabled, `anon` and
`authenticated` have no direct table grants, and only the management API's
role-checked service client can read or write snapshots. The playbook FK is
`ON DELETE SET NULL`, so the owner can recover a backup by GUID after deleting
the playbook itself.

## Production deployment

The [Deploy Supabase workflow](../.github/workflows/deploy-supabase.yml) runs on
merges to `main` that change migrations, or manually. It runs the test suite,
previews and applies pending migrations, then checks the live schema and access
grants. Set the `SUPABASE_DB_URL` GitHub Actions secret to a percent-encoded
Postgres connection string for project `bydcjwxfiiolmnddzbpy` (prefer the
session pooler if the runner cannot reach the direct IPv6 host). Do not commit
the connection string.

The production history through `20260919075416` predates this repository's
current migration filenames. `scripts/prepare-supabase-deploy.mjs` stages the
audited, already-applied versions as no-op placeholders and copies only newer
migration files into a temporary CLI workdir. The real SQL is always taken from
`supabase/migrations`. If production history changes outside this workflow,
review and update `deploy-baseline-versions.txt` before another deployment.
