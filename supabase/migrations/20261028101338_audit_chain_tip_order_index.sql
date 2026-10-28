-- Match the audit trigger's full ORDER BY before LIMIT 1. The existing
-- (playbook_id, created_at DESC) index needs an incremental sort after the
-- anti-join, which scans the entire chain to discover there is no second tip.
-- Observed in production: 50,314 child probes and ~1.65s excluding selection
-- of the benchmark playbook. Preserve all hashes, triggers and access rules.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';
CREATE INDEX IF NOT EXISTS audit_logs_chain_tip_order_idx
  ON public.audit_logs (playbook_id, created_at DESC, id DESC)
  INCLUDE (hash)
  WHERE hash IS NOT NULL;
COMMIT;
