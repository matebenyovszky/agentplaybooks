-- @manual-production-migration
-- Audit-log compliance: hash chain, auditor role, retention checkpoints.
--
-- PRODUCTION: this migration rewrites every existing audit_logs row to backfill
-- prev_hash/hash. Apply only with operator approval, during a maintenance
-- window, after a backup. Follow scripts/ops/audit-migration/RUNBOOK.md
-- (preflight, in-DB copy, pg_dump, postflight, rollback). It is backwards
-- compatible (new columns are additive; existing readers ignore them) but it
-- must not be run unattended against prod. Apply before merging/deploying the
-- app change; the previously deployed app tolerates the additive schema.
--
-- Fresh installs that already applied an updated supabase/schema.sql are a
-- no-op on the ADD COLUMN / CREATE TABLE IF NOT EXISTS statements.

BEGIN;
SET LOCAL lock_timeout = '10s';
-- Keep old writers blocked while triggers are disabled and rows are backfilled.
-- A failure rolls back both the data changes and trigger state.
LOCK TABLE public.audit_logs IN SHARE ROW EXCLUSIVE MODE;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Role column is referenced by auditor RLS policies below, so it must exist first.
ALTER TABLE public.playbook_collaborators
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'editor';
ALTER TABLE public.playbook_collaborators
  DROP CONSTRAINT IF EXISTS playbook_collaborators_role_check;
ALTER TABLE public.playbook_collaborators
  ADD CONSTRAINT playbook_collaborators_role_check
  CHECK (role IN ('editor', 'auditor'));
COMMENT ON COLUMN public.playbook_collaborators.role IS
  'editor: content write, no secrets. auditor: read/export audit logs and playbook metadata only.';

-- The membership table itself has RLS with no client SELECT policy. Check only
-- the caller's accepted auditor membership without exposing invite hashes or
-- granting access to the full private playbook row.
CREATE SCHEMA IF NOT EXISTS audit_private;
REVOKE ALL ON SCHEMA audit_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA audit_private TO authenticated, service_role;
CREATE OR REPLACE FUNCTION audit_private.is_auditor(p_playbook_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.playbook_collaborators c
    WHERE c.playbook_id = p_playbook_id
      AND c.user_id = (SELECT auth.uid())
      AND c.accepted_at IS NOT NULL AND c.role = 'auditor'
  );
$$;
REVOKE ALL ON FUNCTION audit_private.is_auditor(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION audit_private.is_auditor(uuid) TO authenticated, service_role;

ALTER TABLE public.api_keys DROP CONSTRAINT IF EXISTS api_keys_role_check;
ALTER TABLE public.api_keys ADD CONSTRAINT api_keys_role_check
  CHECK (role IN ('viewer', 'coworker', 'proposer', 'admin', 'auditor'));

-- --------------------------------------------------------------------
-- Hash chain columns
-- --------------------------------------------------------------------

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS prev_hash text,
  ADD COLUMN IF NOT EXISTS hash text;

COMMENT ON COLUMN public.audit_logs.prev_hash IS
  'SHA-256 hex of the previous row in this playbook chain, or 64 zeros for genesis / a retention checkpoint.';
COMMENT ON COLUMN public.audit_logs.hash IS
  'SHA-256 hex of the canonical JSON of this row (including prev_hash, excluding hash).';

CREATE UNIQUE INDEX IF NOT EXISTS audit_logs_playbook_prev_hash_idx
  ON public.audit_logs (playbook_id, prev_hash)
  WHERE prev_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS audit_logs_playbook_hash_idx
  ON public.audit_logs (playbook_id, hash) WHERE hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.audit_chain_checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkpoint_seq bigint GENERATED ALWAYS AS IDENTITY,
  playbook_id uuid NOT NULL REFERENCES public.playbooks(id) ON DELETE CASCADE,
  anchor_hash text NOT NULL,
  purged_through timestamptz NOT NULL,
  purged_through_id uuid,
  purged_count integer NOT NULL CHECK (purged_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_chain_checkpoints
  ADD COLUMN IF NOT EXISTS checkpoint_seq bigint GENERATED ALWAYS AS IDENTITY;

COMMENT ON TABLE public.audit_chain_checkpoints IS
  'Anchor hashes for prefixes removed by retention. Remaining rows chain from the latest anchor_hash.';

CREATE INDEX IF NOT EXISTS audit_chain_checkpoints_playbook_created_idx
  ON public.audit_chain_checkpoints (playbook_id, checkpoint_seq DESC);

ALTER TABLE public.audit_chain_checkpoints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can read audit chain checkpoints" ON public.audit_chain_checkpoints;
CREATE POLICY "Owners can read audit chain checkpoints"
  ON public.audit_chain_checkpoints FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.playbooks
    WHERE playbooks.id = audit_chain_checkpoints.playbook_id
      AND playbooks.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Auditors can read audit chain checkpoints" ON public.audit_chain_checkpoints;
CREATE POLICY "Auditors can read audit chain checkpoints"
  ON public.audit_chain_checkpoints FOR SELECT TO authenticated
  USING (audit_private.is_auditor(playbook_id));

REVOKE ALL ON public.audit_chain_checkpoints FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.audit_chain_checkpoints TO authenticated;
GRANT ALL ON public.audit_chain_checkpoints TO service_role;
GRANT SELECT ON public.audit_logs TO authenticated;

-- --------------------------------------------------------------------
-- Canonical JSON + trigger (must match src/lib/audit-chain.ts)
-- --------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.audit_log_canonical(
  p_id uuid,
  p_playbook_id uuid,
  p_mcp_server_id uuid,
  p_operation text,
  p_target text,
  p_status text,
  p_latency_ms integer,
  p_error_code text,
  p_actor_type text,
  p_actor_id text,
  p_secret_name text,
  p_request_id text,
  p_created_at timestamptz,
  p_prev_hash text
) RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT concat(
    '{',
    '"actor_id":', COALESCE(to_json(p_actor_id)::text, 'null'), ',',
    '"actor_type":', COALESCE(to_json(p_actor_type)::text, 'null'), ',',
    '"created_at":', to_json(to_char(timezone('UTC', p_created_at), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text, ',',
    '"error_code":', COALESCE(to_json(p_error_code)::text, 'null'), ',',
    '"id":', to_json(p_id::text)::text, ',',
    '"latency_ms":', COALESCE(p_latency_ms, 0)::text, ',',
    '"mcp_server_id":', COALESCE(to_json(p_mcp_server_id::text)::text, 'null'), ',',
    '"operation":', to_json(p_operation)::text, ',',
    '"playbook_id":', to_json(p_playbook_id::text)::text, ',',
    '"prev_hash":', to_json(COALESCE(p_prev_hash, repeat('0', 64)))::text, ',',
    '"request_id":', COALESCE(to_json(p_request_id)::text, 'null'), ',',
    '"secret_name":', COALESCE(to_json(p_secret_name)::text, 'null'), ',',
    '"status":', to_json(p_status)::text, ',',
    '"target":', COALESCE(to_json(p_target)::text, 'null'),
    '}'
  );
$$;

CREATE OR REPLACE FUNCTION public.audit_logs_assign_hash()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  prev text;
  canonical text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'audit_logs rows are immutable';
  END IF;

  PERFORM pg_advisory_xact_lock(('x' || substr(md5(NEW.playbook_id::text), 1, 16))::bit(64)::bigint);

  IF NEW.prev_hash IS NULL THEN
    -- Chain tip: the hash no other row in this playbook uses as prev_hash.
    -- Do not ORDER BY created_at, id — now() is transaction-stable, so several
    -- rows share a timestamp, and UUID id is not insertion order. That made
    -- sequential INSERTs in one transaction collide on playbook_prev_hash_idx.
    SELECT a.hash INTO prev
    FROM public.audit_logs a
    WHERE a.playbook_id = NEW.playbook_id
      AND a.hash IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.audit_logs child
        WHERE child.playbook_id = a.playbook_id
          AND child.prev_hash = a.hash
      )
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT 1;

    IF prev IS NULL THEN
      SELECT c.anchor_hash INTO prev
      FROM public.audit_chain_checkpoints c
      WHERE c.playbook_id = NEW.playbook_id
      ORDER BY c.checkpoint_seq DESC
      LIMIT 1;
    END IF;

    NEW.prev_hash := COALESCE(prev, repeat('0', 64));
  END IF;

  canonical := public.audit_log_canonical(
    NEW.id,
    NEW.playbook_id,
    NEW.mcp_server_id,
    NEW.operation,
    NEW.target,
    NEW.status,
    NEW.latency_ms,
    NEW.error_code,
    NEW.actor_type,
    NEW.actor_id,
    NEW.secret_name,
    NEW.request_id,
    NEW.created_at,
    NEW.prev_hash
  );
  NEW.hash := encode(extensions.digest(convert_to(canonical, 'UTF8'), 'sha256'), 'hex');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_assign_hash ON public.audit_logs;
CREATE TRIGGER audit_logs_assign_hash
  BEFORE INSERT ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_logs_assign_hash();

DROP TRIGGER IF EXISTS audit_logs_deny_update ON public.audit_logs;
CREATE TRIGGER audit_logs_deny_update
  BEFORE UPDATE ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_logs_assign_hash();

REVOKE ALL ON FUNCTION public.audit_log_canonical(uuid, uuid, uuid, text, text, text, integer, text, text, text, text, text, timestamptz, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_log_canonical(uuid, uuid, uuid, text, text, text, integer, text, text, text, text, text, timestamptz, text) TO service_role;

REVOKE ALL ON FUNCTION public.audit_logs_assign_hash() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_logs_assign_hash() TO service_role;

-- Backfill existing rows in chain order. The trigger is INSERT-only for hashing;
-- this UPDATE is the one allowed rewrite, so the deny-update trigger is dropped
-- around it and recreated above after this block... actually the deny trigger
-- is already in place. Disable it for the backfill.

ALTER TABLE public.audit_logs DISABLE TRIGGER audit_logs_deny_update;
ALTER TABLE public.audit_logs DISABLE TRIGGER audit_logs_assign_hash;

DO $$
DECLARE
  pb uuid;
  rec record;
  prev text;
  canonical text;
  next_hash text;
BEGIN
  PERFORM set_config('search_path', 'pg_catalog, public, extensions, pg_temp', true);
  FOR pb IN
    SELECT DISTINCT playbook_id FROM public.audit_logs ORDER BY playbook_id
  LOOP
    prev := repeat('0', 64);
    FOR rec IN
      SELECT * FROM public.audit_logs
      WHERE playbook_id = pb
      ORDER BY created_at ASC, id ASC
    LOOP
      IF rec.hash IS NOT NULL AND rec.prev_hash IS NOT NULL THEN
        prev := rec.hash;
        CONTINUE;
      END IF;
      canonical := public.audit_log_canonical(
        rec.id, rec.playbook_id, rec.mcp_server_id, rec.operation, rec.target,
        rec.status, rec.latency_ms, rec.error_code, rec.actor_type, rec.actor_id,
        rec.secret_name, rec.request_id, rec.created_at, prev
      );
      next_hash := encode(extensions.digest(convert_to(canonical, 'UTF8'), 'sha256'), 'hex');
      UPDATE public.audit_logs
        SET prev_hash = prev, hash = next_hash
      WHERE id = rec.id;
      prev := next_hash;
    END LOOP;
  END LOOP;
END;
$$;

ALTER TABLE public.audit_logs ENABLE TRIGGER audit_logs_assign_hash;
ALTER TABLE public.audit_logs ENABLE TRIGGER audit_logs_deny_update;

-- --------------------------------------------------------------------
-- Retention purge: delete a prefix, keep an anchor, write an audit row
-- --------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.purge_audit_logs(
  p_older_than timestamptz,
  p_playbook_id uuid DEFAULT NULL,
  p_actor_type text DEFAULT 'system',
  p_actor_id text DEFAULT 'retention'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  playbook uuid;
  last_row public.audit_logs%ROWTYPE;
  start_hash text;
  purge_ids uuid[];
  n integer;
  total integer := 0;
  playbooks_touched integer := 0;
BEGIN
  IF p_older_than IS NULL THEN
    RAISE EXCEPTION 'p_older_than is required';
  END IF;

  FOR playbook IN
    SELECT DISTINCT playbook_id
    FROM public.audit_logs
    WHERE created_at < p_older_than
      AND (p_playbook_id IS NULL OR playbook_id = p_playbook_id)
  LOOP
    PERFORM pg_advisory_xact_lock(('x' || substr(md5(playbook::text), 1, 16))::bit(64)::bigint);

    SELECT c.anchor_hash INTO start_hash
    FROM public.audit_chain_checkpoints c WHERE c.playbook_id = playbook
    ORDER BY c.checkpoint_seq DESC LIMIT 1;
    start_hash := COALESCE(start_hash, repeat('0', 64));

    -- Retention removes a chain prefix, not every row with an old timestamp.
    -- Transaction timestamps can tie or move backwards relative to append order.
    WITH RECURSIVE prefix AS (
      SELECT a.id, a.hash, 1 AS depth FROM public.audit_logs a
      WHERE a.playbook_id = playbook AND a.prev_hash = start_hash
        AND a.created_at < p_older_than
      UNION ALL
      SELECT child.id, child.hash, parent.depth + 1
      FROM prefix parent JOIN public.audit_logs child
        ON child.playbook_id = playbook AND child.prev_hash = parent.hash
      WHERE child.created_at < p_older_than
    )
    SELECT array_agg(id ORDER BY depth), count(*)::integer
      INTO purge_ids, n FROM prefix;
    CONTINUE WHEN n = 0;

    SELECT * INTO last_row FROM public.audit_logs
    WHERE id = purge_ids[array_length(purge_ids, 1)];

    INSERT INTO public.audit_chain_checkpoints (
      playbook_id, anchor_hash, purged_through, purged_through_id, purged_count
    ) VALUES (
      playbook, last_row.hash, last_row.created_at, last_row.id, n
    );

    DELETE FROM public.audit_logs
    WHERE playbook_id = playbook AND id = ANY(purge_ids);

    INSERT INTO public.audit_logs (
      playbook_id, operation, status, actor_type, actor_id, target
    ) VALUES (
      playbook,
      'audit.retention_purge',
      'success',
      COALESCE(p_actor_type, 'system'),
      COALESCE(p_actor_id, 'retention'),
      to_char(timezone('UTC', p_older_than), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    );

    total := total + n;
    playbooks_touched := playbooks_touched + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'purged', total,
    'playbooks', playbooks_touched,
    'older_than', p_older_than
  );
END;
$$;

REVOKE ALL ON FUNCTION public.purge_audit_logs(timestamptz, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_audit_logs(timestamptz, uuid, text, text) TO service_role;

-- --------------------------------------------------------------------
-- Auditor collaborator role (column added at top; policies here)
-- --------------------------------------------------------------------

DROP POLICY IF EXISTS "Auditors can read audit logs" ON public.audit_logs;
CREATE POLICY "Auditors can read audit logs"
  ON public.audit_logs FOR SELECT TO authenticated
  USING (audit_private.is_auditor(playbook_id));

-- Playbook-scoped API key role used for machine auditors (no vault access).
ALTER TABLE public.api_keys DROP CONSTRAINT IF EXISTS api_keys_role_check;
ALTER TABLE public.api_keys ADD CONSTRAINT api_keys_role_check
  CHECK (role IN ('viewer', 'coworker', 'proposer', 'admin', 'auditor'));

-- The authorized application API returns metadata to auditors. A SELECT policy
-- on this table would expose instructions/persona/config as well as metadata.
DROP POLICY IF EXISTS "Auditors can read playbook metadata" ON public.playbooks;

COMMIT;
