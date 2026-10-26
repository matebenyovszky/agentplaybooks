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

  -- Account deletion: the function must exist and must stay out of reach of
  -- the browser roles — calling it is the API route's job, after it has
  -- checked the session and the typed confirmation.
  IF to_regprocedure('public.delete_account(uuid)') IS NULL THEN
    RAISE EXCEPTION 'delete_account function is missing';
  END IF;
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_function_privilege(client_role, 'public.delete_account(uuid)', 'EXECUTE') THEN
      RAISE EXCEPTION 'delete_account is executable by %', client_role;
    END IF;
  END LOOP;
  IF NOT has_function_privilege('service_role', 'public.delete_account(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'delete_account is not executable by service_role';
  END IF;

  -- A delete trigger on playbooks made every playbook delete fail; it must
  -- not come back. Bit 8 of tgtype is TRIGGER_TYPE_DELETE.
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.playbooks'::regclass AND NOT tgisinternal
      AND tgname = 'trigger_track_playbook_version'
      AND (tgtype & 8) <> 0
  ) THEN
    RAISE EXCEPTION 'trigger_track_playbook_version still fires on DELETE';
  END IF;
END
$verify$;

DO $verify_secret_clients$
DECLARE
  client_role text;
BEGIN
  IF to_regclass('public.secret_clients') IS NULL THEN
    RAISE EXCEPTION 'secret_clients table is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = 'public.secret_clients'::regclass AND relrowsecurity
  ) THEN
    RAISE EXCEPTION 'secret_clients RLS is disabled';
  END IF;
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_table_privilege(client_role, 'public.secret_clients', 'SELECT')
      OR has_table_privilege(client_role, 'public.secret_clients', 'INSERT')
      OR has_table_privilege(client_role, 'public.secret_clients', 'UPDATE')
      OR has_table_privilege(client_role, 'public.secret_clients', 'DELETE')
      OR has_table_privilege(client_role, 'public.secret_clients', 'TRUNCATE')
      OR has_table_privilege(client_role, 'public.secret_clients', 'REFERENCES')
      OR has_table_privilege(client_role, 'public.secret_clients', 'TRIGGER')
    THEN
      RAISE EXCEPTION 'secret_clients unexpectedly grants access to %', client_role;
    END IF;
  END LOOP;
  IF NOT has_table_privilege('service_role', 'public.secret_clients', 'SELECT')
    OR NOT has_table_privilege('service_role', 'public.secret_clients', 'INSERT')
    OR NOT has_table_privilege('service_role', 'public.secret_clients', 'UPDATE')
    OR NOT has_table_privilege('service_role', 'public.secret_clients', 'DELETE') THEN
    RAISE EXCEPTION 'secret_clients service_role CRUD grants are missing';
  END IF;
END
$verify_secret_clients$;


DO $verify_playbook_fork$
DECLARE
  fork_oid oid := to_regprocedure('public.fork_playbook_with_content(uuid,uuid,text)');
  client_role text;
BEGIN
  IF fork_oid IS NULL THEN
    RAISE EXCEPTION 'fork_playbook_with_content is missing';
  END IF;
  IF (SELECT prosecdef FROM pg_proc WHERE oid = fork_oid) THEN
    RAISE EXCEPTION 'fork_playbook_with_content must remain SECURITY INVOKER';
  END IF;
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_function_privilege(client_role, fork_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'fork_playbook_with_content unexpectedly executable by %', client_role;
    END IF;
  END LOOP;
  IF NOT has_function_privilege('service_role', fork_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'fork_playbook_with_content service_role grant is missing';
  END IF;
END
$verify_playbook_fork$;

DO $verify_rls_performance$
DECLARE
  expected record;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version = '20261026212458'
  ) THEN
    RAISE EXCEPTION 'RLS / foreign-key index optimization is not recorded';
  END IF;

  FOR expected IN
    SELECT * FROM (VALUES
      ('mcp_servers', 'mcp_servers_publisher_id_idx', ARRAY['publisher_id']),
      ('canvas', 'canvas_run_playbook_idx', ARRAY['run_id', 'playbook_id']),
      ('playbook_runs', 'playbook_runs_created_by_idx', ARRAY['created_by']),
      ('playbook_versions', 'playbook_versions_changed_by_api_key_idx', ARRAY['changed_by_api_key_id']),
      ('skill_versions', 'skill_versions_changed_by_api_key_idx', ARRAY['changed_by_api_key_id'])
    ) AS indexes(table_name, index_name, columns)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_index i
      JOIN pg_class c ON c.oid = i.indexrelid
      JOIN pg_am am ON am.oid = c.relam
      WHERE i.indrelid = to_regclass('public.' || expected.table_name)
        AND c.oid = to_regclass('public.' || expected.index_name)
        AND i.indisvalid AND i.indisready AND i.indpred IS NULL
        AND am.amname = 'btree'
        AND (SELECT array_agg(a.attname::text ORDER BY k.ordinality)
             FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, ordinality)
             JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
             WHERE k.ordinality <= i.indnkeyatts) = expected.columns
    ) THEN
      RAISE EXCEPTION 'Missing or incorrect FK index: %', expected.index_name;
    END IF;
  END LOOP;

  -- Same detection as Supabase's auth_rls_initplan advisor, for the identity
  -- functions used by these policies. Inspect USING and WITH CHECK separately.
  IF EXISTS (
    SELECT 1 FROM pg_policies p
    CROSS JOIN LATERAL (VALUES (p.qual), (p.with_check)) AS e(expression)
    CROSS JOIN (VALUES ('auth.uid()'), ('auth.role()')) AS f(call)
    WHERE p.schemaname = 'public'
      AND e.expression LIKE '%' || f.call || '%'
      AND lower(e.expression) NOT LIKE '%select ' || f.call || '%'
  ) THEN
    RAISE EXCEPTION 'A public policy still evaluates request identity per row';
  END IF;
END
$verify_rls_performance$;
