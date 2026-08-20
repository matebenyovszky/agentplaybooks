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

18 tables have RLS enabled and there are 46 policies, but RLS is not the
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
