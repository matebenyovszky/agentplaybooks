\set ON_ERROR_STOP on
BEGIN READ ONLY;
SELECT version() AS postgres_version;
SELECT extname, extversion FROM pg_extension ORDER BY extname;
SELECT n.nspname AS schema, c.relname AS table_name, a.amname AS access_method,
       pg_get_userbyid(c.relowner) AS owner, c.relrowsecurity AS rls,
       c.relforcerowsecurity AS force_rls, c.relacl::text AS grants,
       pg_total_relation_size(c.oid) AS bytes
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
LEFT JOIN pg_am a ON a.oid=c.relam
WHERE c.relkind IN ('r','p') AND n.nspname NOT LIKE 'pg_%'
  AND n.nspname <> 'information_schema' ORDER BY 1,2;
SELECT format('SELECT %L AS table_name, count(*) AS rows FROM %I.%I;',
              n.nspname||'.'||c.relname,n.nspname,c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE c.relkind='r' AND n.nspname IN ('public','auth','storage','supabase_migrations')
  AND has_table_privilege(c.oid,'SELECT') ORDER BY 1
\gexec
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies ORDER BY 1,2,3;
SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes WHERE schemaname IN ('public','auth','storage') ORDER BY 1,2,3;
SELECT tgrelid::regclass::text AS table_name, tgname, pg_get_triggerdef(oid)
FROM pg_trigger WHERE NOT tgisinternal ORDER BY 1,2;
SELECT pubname, puballtables FROM pg_publication ORDER BY 1;
SELECT * FROM pg_publication_tables ORDER BY 1,2,3;
COMMIT;
