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
  WITH ordered AS (
    SELECT
      id,
      playbook_id,
      created_at,
      prev_hash,
      hash,
      public.audit_log_canonical(
        id, playbook_id, mcp_server_id, operation, target, status,
        latency_ms, error_code, actor_type, actor_id, secret_name,
        request_id, created_at, prev_hash
      ) AS canonical,
      lag(hash) OVER (
        PARTITION BY playbook_id
        ORDER BY created_at ASC, id ASC
      ) AS prev_row_hash
    FROM public.audit_logs
  )
  SELECT 1
  FROM ordered
  WHERE hash IS DISTINCT FROM encode(
          extensions.digest(convert_to(canonical, 'UTF8'), 'sha256'),
          'hex'
        )
     OR prev_hash IS DISTINCT FROM coalesce(prev_row_hash, repeat('0', 64))
     OR hash IS NULL
     OR prev_hash IS NULL
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
