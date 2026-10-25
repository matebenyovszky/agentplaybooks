-- Postflight after 20261024120000_audit_logs_compliance.sql.
-- 1. Same row count + original-column checksum as preflight (must match).
-- 2. Recompute every row hash from stored prev_hash + canonical fields using
--    public.audit_log_canonical + extensions.digest, exactly as the migration
--    and src/lib/audit-chain.ts do. Report mismatch_count and first_broken_id.
--    Chain membership follows prev_hash pointers from genesis/checkpoint, not
--    created_at,id (those tie when now() is transaction-stable). Expect 0.
--
-- Production target: heap project zcphxfospbvqplonkvco. Retired project
-- bydcjwxfiiolmnddzbpy is forbidden. Run check-project.sh on PROD_DB_URL first.

\ir check-project.sql

\echo === audit_logs postflight summary (original columns) ===

SELECT
  count(*) AS row_count,
  min(created_at) AS min_created_at,
  max(created_at) AS max_created_at,
  md5(coalesce(string_agg(id::text, ',' ORDER BY id), '')) AS checksum_ids,
  md5(coalesce(string_agg(row_md5, '' ORDER BY id), '')) AS checksum_original
FROM (
  SELECT
    id,
    created_at,
    md5(concat_ws(
      E'\x1f',
      id::text,
      playbook_id::text,
      coalesce(mcp_server_id::text, ''),
      operation,
      coalesce(target, ''),
      status,
      latency_ms::text,
      coalesce(error_code, ''),
      coalesce(request_id, ''),
      to_char(timezone('UTC', created_at), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      coalesce(actor_type, ''),
      coalesce(actor_id, ''),
      coalesce(secret_name, '')
    )) AS row_md5
  FROM public.audit_logs
) AS rows;

\echo === audit_logs count by action (operation) ===

SELECT operation AS action, count(*) AS n
FROM public.audit_logs
GROUP BY operation
ORDER BY operation;

\echo === hash-chain verification ===

DO $$
BEGIN
  IF to_regprocedure(
       'public.audit_log_canonical(uuid,uuid,uuid,text,text,text,integer,text,text,text,text,text,timestamptz,text)'
     ) IS NULL THEN
    RAISE EXCEPTION 'NO-GO: public.audit_log_canonical is missing — migration did not apply';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'audit_logs'
      AND column_name = 'hash'
  ) THEN
    RAISE EXCEPTION 'NO-GO: audit_logs.hash is missing — migration did not apply';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.audit_logs WHERE hash IS NULL OR prev_hash IS NULL
  ) THEN
    RAISE EXCEPTION 'NO-GO: some audit_logs rows have NULL hash/prev_hash — backfill incomplete';
  END IF;
END
$$;

DROP TABLE IF EXISTS audit_postflight_chain;
CREATE TEMP TABLE audit_postflight_chain AS
WITH RECURSIVE anchors AS (
  SELECT
    p.playbook_id,
    coalesce(
      (
        SELECT c.anchor_hash
        FROM public.audit_chain_checkpoints c
        WHERE c.playbook_id = p.playbook_id
        ORDER BY c.checkpoint_seq DESC
        LIMIT 1
      ),
      repeat('0', 64)
    ) AS start_hash
  FROM (SELECT DISTINCT playbook_id FROM public.audit_logs) p
),
walk AS (
  SELECT l.id, l.playbook_id, l.hash
  FROM public.audit_logs l
  JOIN anchors a ON a.playbook_id = l.playbook_id AND l.prev_hash = a.start_hash
  UNION
  SELECT c.id, c.playbook_id, c.hash
  FROM public.audit_logs c
  JOIN walk w ON c.playbook_id = w.playbook_id AND c.prev_hash = w.hash
)
SELECT
  l.id,
  l.created_at,
  (
    l.hash IS DISTINCT FROM encode(
      extensions.digest(
        convert_to(
          public.audit_log_canonical(
            l.id, l.playbook_id, l.mcp_server_id, l.operation, l.target, l.status,
            l.latency_ms, l.error_code, l.actor_type, l.actor_id, l.secret_name,
            l.request_id, l.created_at, l.prev_hash
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    )
  ) AS hash_mismatch,
  (
    l.hash IS NULL
    OR l.prev_hash IS NULL
    OR w.id IS NULL
  ) AS chain_mismatch
FROM public.audit_logs l
LEFT JOIN walk w ON w.id = l.id;

SELECT
  count(*) FILTER (WHERE hash_mismatch) AS hash_mismatches,
  count(*) FILTER (WHERE chain_mismatch) AS chain_mismatches,
  count(*) FILTER (WHERE hash_mismatch OR chain_mismatch) AS mismatch_count,
  (
    SELECT id
    FROM audit_postflight_chain
    WHERE hash_mismatch OR chain_mismatch
    ORDER BY created_at ASC, id ASC
    LIMIT 1
  ) AS first_broken_id
FROM audit_postflight_chain;

DO $$
DECLARE
  mismatches bigint;
  first_id uuid;
BEGIN
  SELECT count(*) FILTER (WHERE hash_mismatch OR chain_mismatch)
    INTO mismatches
  FROM pg_temp.audit_postflight_chain;

  SELECT id
    INTO first_id
  FROM pg_temp.audit_postflight_chain
  WHERE hash_mismatch OR chain_mismatch
  ORDER BY created_at ASC, id ASC
  LIMIT 1;

  IF mismatches <> 0 THEN
    RAISE EXCEPTION 'NO-GO: hash-chain mismatches = %, first_broken_id = %', mismatches, first_id;
  END IF;
  RAISE NOTICE 'GO: hash-chain mismatches = 0';
END
$$;
