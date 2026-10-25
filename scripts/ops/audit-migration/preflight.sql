-- Preflight snapshot of public.audit_logs.
-- Run before the in-DB backup and before 20261024120000_audit_logs_compliance.sql.
-- Safe: read-only. Does not touch prod data.
--
-- Copy the summary row onto the RUNBOOK record sheet.
-- checksum_ids     = md5 of all ids ordered by id
-- checksum_original = md5 of per-row md5s over the original columns only
--                     (id, playbook_id, mcp_server_id, operation, target, status,
--                      latency_ms, error_code, request_id, created_at, actor_type,
--                      actor_id, secret_name). Ignores prev_hash/hash if present.

\echo === audit_logs preflight summary ===

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
