-- Application routes query with the service-role key, which bypasses RLS but
-- still needs table grants. schema.sql enables RLS and grants a few later
-- tables explicitly; this covers the rest for a fresh Data API.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;

-- The audit trail is append-only for the API roles: the blanket grant above
-- must not hand back what 20261025120000_audit_logs_tamper_resistance revoked.
REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM service_role;
REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_chain_checkpoints FROM service_role;
