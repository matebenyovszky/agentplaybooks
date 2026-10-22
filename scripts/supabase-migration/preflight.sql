-- Read-only, aggregate-only inventory; works in psql and the Dashboard SQL editor.
-- Run on both projects before classifying the full pg_dump archive for restore.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT jsonb_build_object(
  'postgres_version', version(),
  'role', current_user,
  'default_access_method', current_setting('default_table_access_method'),
  'extensions', (SELECT jsonb_agg(jsonb_build_object('name', extname, 'version', extversion) ORDER BY extname) FROM pg_extension),
  'tables', (
    SELECT jsonb_agg(jsonb_build_object(
      'schema', n.nspname, 'table', c.relname,
      'owner', pg_get_userbyid(c.relowner), 'method', am.amname,
      'rls', c.relrowsecurity, 'force_rls', c.relforcerowsecurity,
      'rows', (xpath('/row/row_count/text()', query_to_xml(
        format('SELECT count(*) AS row_count FROM %I.%I', n.nspname, c.relname),
        false, true, '')))[1]::text::bigint
    ) ORDER BY n.nspname, c.relname)
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_am am ON am.oid = c.relam
    WHERE c.relkind = 'r'
      AND n.nspname IN ('public', 'auth', 'storage', 'vault', 'supabase_migrations')
      AND has_table_privilege(c.oid, 'SELECT')
  ),
  'managed_columns', (
    SELECT jsonb_agg(jsonb_build_object(
      'schema', table_schema, 'table', table_name, 'column', column_name,
      'type', udt_name, 'nullable', is_nullable
    ) ORDER BY table_schema, table_name, ordinal_position)
    FROM information_schema.columns
    WHERE table_schema IN ('auth', 'storage')
  ),
  'custom_managed_triggers', (
    SELECT jsonb_agg(pg_get_triggerdef(t.oid) ORDER BY n.nspname, c.relname, t.tgname)
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
    JOIN pg_namespace fn ON fn.oid = p.pronamespace
    WHERE NOT t.tgisinternal AND n.nspname IN ('auth', 'storage')
      AND fn.nspname NOT IN ('auth', 'storage')
  )
) AS migration_preflight;
ROLLBACK;
