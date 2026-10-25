-- schema.sql's function-hardening block refuses to run if anon/authenticated
-- can CREATE in public. Make that true on a stock supabase/postgres image
-- before the snapshot is applied.
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
