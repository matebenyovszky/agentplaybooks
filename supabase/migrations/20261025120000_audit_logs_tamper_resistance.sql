-- The audit trail outlives what it describes, and only retention deletes it.
--
-- Until now three ordinary operations erased audit history without leaving a
-- trace:
--
--   * deleting a playbook cascaded to every audit row of that playbook
--     (audit_logs.playbook_id and audit_chain_checkpoints.playbook_id were
--     ON DELETE CASCADE), and deleting an account deletes its playbooks;
--   * deleting a federated MCP server cascaded to the rows of its calls
--     (audit_logs.mcp_server_id), which also broke the playbook's hash chain;
--   * any role with DELETE or TRUNCATE on the table could remove rows; only
--     UPDATE was refused.
--
-- After this migration:
--
--   * audit_logs and audit_chain_checkpoints keep the playbook and server ids
--     as plain values, without foreign keys, so the trail of a deleted playbook,
--     server or account stays in the table and its chain still verifies;
--   * DELETE on audit_logs is refused unless it comes from
--     public.purge_audit_logs, the retention function, which records a
--     checkpoint and an audit.retention_purge row for every prefix it removes;
--   * TRUNCATE is refused on both tables, and checkpoints cannot be changed or
--     deleted at all;
--   * the API roles lose UPDATE, DELETE and TRUNCATE on both tables.
--
-- A database superuser can still disable triggers. That is outside what a
-- database can enforce on itself; forwarding the trail to an external syslog or
-- SIEM (AUDIT_SYSLOG_URL / AUDIT_SIEM_WEBHOOK_URL) is what makes such an edit
-- detectable.
--
-- No row is rewritten: this is DDL plus function replacements only.

BEGIN;
SET LOCAL lock_timeout = '10s';

-- --------------------------------------------------------------------
-- 1. No cascades into the trail
-- --------------------------------------------------------------------

-- The constraints still carry the table's former name.
ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS mcp_proxy_audit_logs_playbook_id_fkey;
ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS mcp_proxy_audit_logs_mcp_server_id_fkey;
ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_playbook_id_fkey;
ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_mcp_server_id_fkey;
ALTER TABLE public.audit_chain_checkpoints DROP CONSTRAINT IF EXISTS audit_chain_checkpoints_playbook_id_fkey;

COMMENT ON COLUMN public.audit_logs.playbook_id IS
  'The playbook the event belongs to. Deliberately not a foreign key: the trail outlives the playbook.';
COMMENT ON COLUMN public.audit_logs.mcp_server_id IS
  'The federated server of a call, if any. Deliberately not a foreign key: the trail outlives the server.';

-- --------------------------------------------------------------------
-- 2. Only retention deletes rows
-- --------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.audit_logs_deny_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  -- purge_audit_logs sets this transaction-local flag around its own DELETE.
  -- The API roles cannot run arbitrary SQL, so they cannot set it.
  IF TG_OP = 'DELETE' AND current_setting('agentplaybooks.audit_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'audit trail rows cannot be removed outside retention (public.purge_audit_logs): %', lower(TG_OP)
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_chain_checkpoints_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'audit chain checkpoints cannot be changed (%)', lower(TG_OP)
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_deny_delete ON public.audit_logs;
CREATE TRIGGER audit_logs_deny_delete
  BEFORE DELETE ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_logs_deny_delete();

DROP TRIGGER IF EXISTS audit_logs_deny_truncate ON public.audit_logs;
CREATE TRIGGER audit_logs_deny_truncate
  BEFORE TRUNCATE ON public.audit_logs
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.audit_logs_deny_delete();

DROP TRIGGER IF EXISTS audit_chain_checkpoints_immutable ON public.audit_chain_checkpoints;
CREATE TRIGGER audit_chain_checkpoints_immutable
  BEFORE UPDATE OR DELETE ON public.audit_chain_checkpoints
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_chain_checkpoints_immutable();

DROP TRIGGER IF EXISTS audit_chain_checkpoints_deny_truncate ON public.audit_chain_checkpoints;
CREATE TRIGGER audit_chain_checkpoints_deny_truncate
  BEFORE TRUNCATE ON public.audit_chain_checkpoints
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.audit_chain_checkpoints_immutable();

REVOKE ALL ON FUNCTION public.audit_logs_deny_delete() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_chain_checkpoints_immutable() FROM PUBLIC, anon, authenticated;

-- The API roles append and read; they never change or remove history.
REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM PUBLIC, anon, authenticated, service_role;
REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_chain_checkpoints FROM PUBLIC, anon, authenticated, service_role;

-- --------------------------------------------------------------------
-- 3. Retention is the one deleter
-- --------------------------------------------------------------------

-- Same body as in 20261024120000_audit_logs_compliance.sql, with the purge flag
-- set around the DELETE.
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

    PERFORM set_config('agentplaybooks.audit_purge', 'on', true);
    DELETE FROM public.audit_logs
    WHERE playbook_id = playbook AND id = ANY(purge_ids);
    PERFORM set_config('agentplaybooks.audit_purge', 'off', true);

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

COMMIT;
