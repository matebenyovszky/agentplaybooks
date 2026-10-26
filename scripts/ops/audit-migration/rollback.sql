-- Fully reverse 20261024120000_audit_logs_compliance.sql.
-- Idempotent. Runs in one transaction. Only the added hash columns are removed;
-- original fields and every audit row written since backup are preserved.
--
-- Also removes version 20261024120000 from supabase_migrations.schema_migrations
-- so a later Deploy Supabase `db push` will not treat a rolled-back database as
-- already migrated.
--
-- Production target: heap project zcphxfospbvqplonkvco. Retired project
-- bydcjwxfiiolmnddzbpy is forbidden. Run check-project.sh on PROD_DB_URL first.
--
-- Does not drop the backup table. Does not revoke GRANT SELECT on audit_logs
-- (that grant may already have existed on hosted projects).

\ir check-project.sql

BEGIN;

-- Policies that reference playbook_collaborators.role must go before DROP COLUMN.
DROP POLICY IF EXISTS "Auditors can read audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Auditors can read playbook metadata" ON public.playbooks;

DROP TRIGGER IF EXISTS audit_logs_assign_hash ON public.audit_logs;
DROP TRIGGER IF EXISTS audit_logs_deny_update ON public.audit_logs;

DROP FUNCTION IF EXISTS public.purge_audit_logs(timestamptz, uuid, text, text);
DROP FUNCTION IF EXISTS public.audit_logs_assign_hash();
DROP FUNCTION IF EXISTS public.audit_log_canonical(uuid, uuid, uuid, text, text, text, integer, text, text, text, text, text, timestamptz, text);

DROP TABLE IF EXISTS public.audit_chain_checkpoints CASCADE;

DROP INDEX IF EXISTS public.audit_logs_playbook_prev_hash_idx;
DROP INDEX IF EXISTS public.audit_logs_playbook_hash_idx;
DROP FUNCTION IF EXISTS audit_private.is_auditor(uuid);
DROP SCHEMA IF EXISTS audit_private;

-- Backfill never changes original columns. Restoring the old copy with
-- DELETE/INSERT would discard new security events, so retain all live rows.

ALTER TABLE public.audit_logs DROP COLUMN IF EXISTS prev_hash;
ALTER TABLE public.audit_logs DROP COLUMN IF EXISTS hash;

ALTER TABLE public.playbook_collaborators
  DROP CONSTRAINT IF EXISTS playbook_collaborators_role_check;
ALTER TABLE public.playbook_collaborators
  DROP COLUMN IF EXISTS role;

-- Restore the pre-migration api_keys role check (no auditor).
-- Auditor keys cannot exist until the new app is deployed; refuse if they do.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'api_keys'
      AND column_name = 'role'
  ) AND EXISTS (
    SELECT 1 FROM public.api_keys WHERE role = 'auditor'
  ) THEN
    RAISE EXCEPTION 'api_keys still has auditor rows; refuse rollback of api_keys_role_check';
  END IF;
END
$$;

ALTER TABLE public.api_keys DROP CONSTRAINT IF EXISTS api_keys_role_check;
ALTER TABLE public.api_keys ADD CONSTRAINT api_keys_role_check
  CHECK (role IN ('viewer', 'coworker', 'proposer', 'admin'));

-- Unrecord so merge+Deploy Supabase cannot skip a rolled-back database.
DO $$
BEGIN
  IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN
    RAISE NOTICE 'supabase_migrations.schema_migrations missing — skip unrecord';
  ELSE
    DELETE FROM supabase_migrations.schema_migrations
    WHERE version = '20261024120000';
    IF FOUND THEN
      RAISE NOTICE 'removed schema_migrations version 20261024120000';
    ELSE
      RAISE NOTICE 'schema_migrations version 20261024120000 was not present';
    END IF;
  END IF;
END
$$;

SELECT
  (to_regclass('public.audit_chain_checkpoints') IS NULL) AS checkpoints_dropped,
  (NOT EXISTS (
     SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'hash'
   )) AS hash_column_dropped,
  (to_regprocedure('public.audit_log_canonical(uuid,uuid,uuid,text,text,text,integer,text,text,text,text,text,timestamptz,text)') IS NULL) AS canonical_dropped,
  (NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_logs_assign_hash')) AS trigger_dropped,
  (NOT EXISTS (
     SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'playbook_collaborators' AND column_name = 'role'
   )) AS collaborator_role_dropped,
  (SELECT count(*) FROM public.audit_logs) AS live_row_count,
  CASE
    WHEN to_regclass('public.audit_logs_backup_20261025') IS NULL THEN NULL
    ELSE (SELECT count(*) FROM public.audit_logs_backup_20261025)
  END AS backup_row_count,
  CASE
    WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL THEN NULL
    ELSE (
      SELECT count(*)::integer
      FROM supabase_migrations.schema_migrations
      WHERE version = '20261024120000'
    )
  END AS schema_migrations_row;

COMMIT;
