-- Record 20261024120000 in supabase_migrations.schema_migrations AFTER a
-- postflight GO. Manual `psql -f` does not insert this row. Without it,
-- the Deploy Supabase workflow's `supabase db push` on merge to main would
-- treat the file as pending and execute it again.
--
-- Idempotent. Does not run the migration SQL.

\ir check-project.sql

DO $$
DECLARE
  has_name boolean;
  has_statements boolean;
BEGIN
  IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN
    RAISE EXCEPTION
      'NO-GO: supabase_migrations.schema_migrations is missing — this is not a Supabase-managed database. Cannot record version 20261024120000.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'supabase_migrations'
      AND table_name = 'schema_migrations'
      AND column_name = 'name'
  ) INTO has_name;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'supabase_migrations'
      AND table_name = 'schema_migrations'
      AND column_name = 'statements'
  ) INTO has_statements;

  IF has_name AND has_statements THEN
    INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
    VALUES ('20261024120000', 'audit_logs_compliance', ARRAY[]::text[])
    ON CONFLICT (version) DO NOTHING;
  ELSIF has_name THEN
    INSERT INTO supabase_migrations.schema_migrations (version, name)
    VALUES ('20261024120000', 'audit_logs_compliance')
    ON CONFLICT (version) DO NOTHING;
  ELSE
    INSERT INTO supabase_migrations.schema_migrations (version)
    VALUES ('20261024120000')
    ON CONFLICT (version) DO NOTHING;
  END IF;

  RAISE NOTICE 'recorded supabase_migrations.schema_migrations version 20261024120000';
END
$$;

SELECT version
FROM supabase_migrations.schema_migrations
WHERE version = '20261024120000';
