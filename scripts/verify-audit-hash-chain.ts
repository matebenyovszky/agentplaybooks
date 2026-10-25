/**
 * Verify every playbook's audit hash chain using the same SQL canonical
 * function as the insert trigger. Used by the self-host restore drill.
 *
 * Prefers docker compose exec (the drill does not install a host psql).
 * Falls back to `psql "$DATABASE_URL"` when COMPOSE_FILE is unset.
 */
import { execFileSync } from "node:child_process";

const CHAIN_SQL = `
SELECT count(*)::text
FROM (
  WITH RECURSIVE anchors AS (
    SELECT
      p.playbook_id,
      coalesce(
        (
          SELECT c.anchor_hash
          FROM public.audit_chain_checkpoints c
          WHERE c.playbook_id = p.playbook_id
          ORDER BY c.created_at DESC, c.id DESC
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
    UNION ALL
    SELECT c.id, c.playbook_id, c.hash
    FROM public.audit_logs c
    JOIN walk w ON c.playbook_id = w.playbook_id AND c.prev_hash = w.hash
  )
  SELECT 1
  FROM public.audit_logs l
  WHERE l.hash IS NULL
     OR l.prev_hash IS NULL
     OR NOT EXISTS (SELECT 1 FROM walk w WHERE w.id = l.id)
     OR l.hash IS DISTINCT FROM encode(
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
) broken;
`;

function runPsql(sql: string): string {
  const composeFile = process.env.COMPOSE_FILE;
  const project = process.env.COMPOSE_PROJECT_NAME || "agentplaybooks-selfhost";
  const dbService = process.env.DB_SERVICE || "db";
  const postgresUser = process.env.POSTGRES_USER || "postgres";
  const postgresDb = process.env.POSTGRES_DB || "postgres";

  if (composeFile) {
    return execFileSync(
      "docker",
      [
        "compose",
        "-f",
        composeFile,
        "--project-name",
        project,
        "exec",
        "-T",
        dbService,
        "psql",
        "-U",
        postgresUser,
        "-d",
        postgresDb,
        "-At",
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        sql,
      ],
      { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
    ).trim();
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("Set COMPOSE_FILE (restore drill) or DATABASE_URL");
  }
  return execFileSync(
    "psql",
    [url, "-At", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
  ).trim();
}

function main() {
  const hasFn = runPsql(
    "SELECT to_regprocedure('public.audit_log_canonical(uuid,uuid,uuid,text,text,text,integer,text,text,text,text,text,timestamptz,text)') IS NOT NULL",
  );
  if (hasFn !== "t") {
    throw new Error("public.audit_log_canonical is missing; hash-chain schema is not applied");
  }

  const mismatches = runPsql(CHAIN_SQL);
  if (mismatches !== "0") {
    throw new Error(`audit hash-chain mismatches=${mismatches}`);
  }

  const n = runPsql("SELECT count(*)::text FROM public.audit_logs");
  process.stdout.write(`AUDIT_CHAIN_OK=1\nCHECKED=${n}\nMISMATCHES=0\n`);
}

main();
