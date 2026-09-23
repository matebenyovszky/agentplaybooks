DO $verify$
DECLARE
  client_role text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version = '20260922213700'
  ) THEN
    RAISE EXCEPTION 'portable snapshot migration is not recorded';
  END IF;

  IF to_regclass('public.playbook_snapshots') IS NULL THEN
    RAISE EXCEPTION 'playbook_snapshots table is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = 'public.playbook_snapshots'::regclass AND relrowsecurity
  ) THEN
    RAISE EXCEPTION 'playbook_snapshots RLS is disabled';
  END IF;

  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_table_privilege(client_role, 'public.playbook_snapshots', 'SELECT')
      OR has_table_privilege(client_role, 'public.playbook_snapshots', 'INSERT')
      OR has_table_privilege(client_role, 'public.playbook_snapshots', 'UPDATE')
      OR has_table_privilege(client_role, 'public.playbook_snapshots', 'DELETE')
      OR has_table_privilege(client_role, 'public.playbook_snapshots', 'TRUNCATE')
      OR has_table_privilege(client_role, 'public.playbook_snapshots', 'REFERENCES')
      OR has_table_privilege(client_role, 'public.playbook_snapshots', 'TRIGGER')
    THEN
      RAISE EXCEPTION 'playbook_snapshots unexpectedly grants access to %', client_role;
    END IF;
  END LOOP;

  IF NOT has_table_privilege('service_role', 'public.playbook_snapshots', 'SELECT, INSERT, UPDATE, DELETE') THEN
    RAISE EXCEPTION 'playbook_snapshots service_role CRUD grants are missing';
  END IF;

  IF (SELECT count(*) FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'playbook_snapshots'
        AND indexname IN (
          'playbook_snapshots_pkey',
          'playbook_snapshots_owner_guid_created_idx',
          'playbook_snapshots_playbook_created_idx'
        )) <> 3 THEN
    RAISE EXCEPTION 'playbook_snapshots indexes are missing';
  END IF;
END
$verify$;
