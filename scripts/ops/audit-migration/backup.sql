-- In-DB copy of public.audit_logs taken immediately before the compliance
-- migration. Idempotent: if audit_logs_backup_20261025 already exists, it is
-- left unchanged (do not overwrite a good backup).
--
-- Production target: heap project zcphxfospbvqplonkvco. Retired project
-- bydcjwxfiiolmnddzbpy is forbidden. Run check-project.sh on PROD_DB_URL first.
--
-- This is the restore source for rollback.sql. Also take a pg_dump file
-- (see RUNBOOK.md); this table is the fast in-cluster copy.

\ir check-project.sql

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.audit_logs_backup_20261025') IS NOT NULL THEN
    RAISE NOTICE 'audit_logs_backup_20261025 already exists — leaving it unchanged';
  ELSE
    CREATE TABLE public.audit_logs_backup_20261025 AS
      SELECT * FROM public.audit_logs;
    COMMENT ON TABLE public.audit_logs_backup_20261025 IS
      'Point-in-time copy of audit_logs taken immediately before 20261024120000_audit_logs_compliance.sql';
    RAISE NOTICE 'created audit_logs_backup_20261025';
  END IF;
END
$$;

-- Supabase may grant new public tables to API roles by default. Keep the
-- rollback copy private, including when an earlier run already created it.
ALTER TABLE public.audit_logs_backup_20261025 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.audit_logs_backup_20261025 FROM PUBLIC, anon, authenticated;

SELECT
  (SELECT count(*) FROM public.audit_logs) AS live_row_count,
  (SELECT count(*) FROM public.audit_logs_backup_20261025) AS backup_row_count,
  (SELECT count(*) FROM public.audit_logs)
    = (SELECT count(*) FROM public.audit_logs_backup_20261025) AS counts_equal;

COMMIT;
