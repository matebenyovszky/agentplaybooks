-- Fully reverse 20261024120000_audit_logs_compliance.sql.
-- Idempotent. Runs in one transaction. Restores row content from
-- public.audit_logs_backup_20261025 when that table exists and the migration
-- had added hash columns (the backfill rewrites prev_hash/hash).
--
-- Does not drop the backup table. Does not revoke GRANT SELECT on audit_logs
-- (that grant may already have existed on hosted projects).

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

-- Restore original row bodies while the extra columns still exist so a second
-- pass (columns already dropped) is a no-op.
DO $$
DECLARE
  n bigint;
  has_hash boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'audit_logs'
      AND column_name = 'hash'
  ) INTO has_hash;

  IF to_regclass('public.audit_logs_backup_20261025') IS NULL THEN
    RAISE NOTICE 'no audit_logs_backup_20261025 — skipping row restore';
  ELSIF NOT has_hash THEN
    RAISE NOTICE 'hash column already dropped — skipping row restore';
  ELSE
    DELETE FROM public.audit_logs;
    INSERT INTO public.audit_logs (
      id, playbook_id, mcp_server_id, operation, target, status, latency_ms,
      error_code, request_id, created_at, actor_type, actor_id, secret_name
    )
    SELECT
      id, playbook_id, mcp_server_id, operation, target, status, latency_ms,
      error_code, request_id, created_at, actor_type, actor_id, secret_name
    FROM public.audit_logs_backup_20261025;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'restored % rows from audit_logs_backup_20261025', n;
  END IF;
END
$$;

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
  END AS backup_row_count;

COMMIT;
