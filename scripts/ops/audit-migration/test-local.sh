#!/usr/bin/env bash
# Local rehearsal of the prod runbook against a throwaway Postgres database.
# Not for production. Requires local psql/pg_dump (PostgreSQL 16 used here).
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
DIR="$ROOT/scripts/ops/audit-migration"
MIGRATION="$ROOT/supabase/migrations/20261024120000_audit_logs_compliance.sql"
DB="audit_migration_test_$$"
DUMP_DIR="$(mktemp -d /tmp/audit-migration-XXXXXX)"
DUMP_FILE="$DUMP_DIR/audit_logs_backup_20261025.sql"

export PGHOST="${PGHOST:-/var/run/postgresql}"
export PGUSER="${PGUSER:-ubuntu}"

checksum_sql() {
  psql -d "$DB" -A -t -v ON_ERROR_STOP=1 -c "
    SELECT md5(coalesce(string_agg(row_md5, '' ORDER BY id), ''))
    FROM (
      SELECT id, md5(concat_ws(
        E'\x1f',
        id::text, playbook_id::text, coalesce(mcp_server_id::text, ''),
        operation, coalesce(target, ''), status, latency_ms::text,
        coalesce(error_code, ''), coalesce(request_id, ''),
        to_char(timezone('UTC', created_at), 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'),
        coalesce(actor_type, ''), coalesce(actor_id, ''), coalesce(secret_name, '')
      )) AS row_md5
      FROM public.audit_logs
    ) rows;
  " | tr -d '[:space:]'
}

elapsed() {
  local start="$1"
  python3 -c "import time; print(f'{time.time() - $start:.3f}')"
}

echo "=== creating database $DB ==="
createdb "$DB"
trap 'dropdb --if-exists "$DB"; rm -rf "$DUMP_DIR"' EXIT

psql -d "$DB" -v ON_ERROR_STOP=1 -f "$DIR/fixture-pre-migration.sql" >/dev/null

echo
echo "=== 1. preflight ==="
t=$(date +%s.%N)
psql -d "$DB" -v ON_ERROR_STOP=1 -f "$DIR/preflight.sql"
T_PREFLIGHT="$(elapsed "$t")"
ORIG_CHECKSUM="$(checksum_sql)"
ORIG_COUNT="$(psql -d "$DB" -A -t -v ON_ERROR_STOP=1 -c 'SELECT count(*) FROM public.audit_logs;' | tr -d '[:space:]')"
echo "preflight_seconds=$T_PREFLIGHT row_count=$ORIG_COUNT checksum_original=$ORIG_CHECKSUM"

echo
echo "=== 2. in-DB backup table ==="
t=$(date +%s.%N)
psql -d "$DB" -v ON_ERROR_STOP=1 -f "$DIR/backup.sql"
T_BACKUP="$(elapsed "$t")"
echo "backup_table_seconds=$T_BACKUP"

echo
echo "=== 3. pg_dump --data-only --table=public.audit_logs ==="
t=$(date +%s.%N)
pg_dump -d "$DB" --data-only --table=public.audit_logs -f "$DUMP_FILE"
test -s "$DUMP_FILE"
DUMP_SHA="$(sha256sum "$DUMP_FILE")"
T_DUMP="$(elapsed "$t")"
echo "$DUMP_SHA"
echo "dump_bytes=$(wc -c < "$DUMP_FILE") dump_seconds=$T_DUMP"

echo
echo "=== GO/NO-GO before migrate ==="
BACKUP_COUNT="$(psql -d "$DB" -A -t -v ON_ERROR_STOP=1 -c 'SELECT count(*) FROM public.audit_logs_backup_20261025;' | tr -d '[:space:]')"
if [[ "$BACKUP_COUNT" != "$ORIG_COUNT" || ! -s "$DUMP_FILE" || -z "$DUMP_SHA" ]]; then
  echo "NO-GO: backup_count=$BACKUP_COUNT live=$ORIG_COUNT dump empty or sha missing"
  exit 1
fi
echo "GO: backup_row_count=$BACKUP_COUNT == live_row_count, dump non-empty, sha256 recorded"

echo
echo "=== 4. apply migration ==="
t=$(date +%s.%N)
psql -d "$DB" -v ON_ERROR_STOP=1 -f "$MIGRATION" >/tmp/audit-migration-apply.log
T_MIGRATE="$(elapsed "$t")"
echo "migration_seconds=$T_MIGRATE"
tail -n 5 /tmp/audit-migration-apply.log

echo
echo "=== 5. postflight ==="
t=$(date +%s.%N)
psql -d "$DB" -v ON_ERROR_STOP=1 -f "$DIR/postflight.sql"
T_POST="$(elapsed "$t")"
POST_CHECKSUM="$(checksum_sql)"
POST_COUNT="$(psql -d "$DB" -A -t -v ON_ERROR_STOP=1 -c 'SELECT count(*) FROM public.audit_logs;' | tr -d '[:space:]')"
echo "postflight_seconds=$T_POST row_count=$POST_COUNT checksum_original=$POST_CHECKSUM"

if [[ "$POST_COUNT" != "$ORIG_COUNT" || "$POST_CHECKSUM" != "$ORIG_CHECKSUM" ]]; then
  echo "NO-GO: count/checksum changed (before $ORIG_COUNT $ORIG_CHECKSUM after $POST_COUNT $POST_CHECKSUM)"
  exit 1
fi
echo "GO: row count unchanged, checksum_original unchanged, mismatches = 0"

echo
echo "=== 6. rollback ==="
t=$(date +%s.%N)
psql -d "$DB" -v ON_ERROR_STOP=1 -f "$DIR/rollback.sql"
T_ROLLBACK="$(elapsed "$t")"
echo "rollback_seconds=$T_ROLLBACK"

echo
echo "=== 7. preflight after rollback (must match original checksum) ==="
psql -d "$DB" -v ON_ERROR_STOP=1 -f "$DIR/preflight.sql"
FINAL_CHECKSUM="$(checksum_sql)"
FINAL_COUNT="$(psql -d "$DB" -A -t -v ON_ERROR_STOP=1 -c 'SELECT count(*) FROM public.audit_logs;' | tr -d '[:space:]')"
if [[ "$FINAL_COUNT" != "$ORIG_COUNT" || "$FINAL_CHECKSUM" != "$ORIG_CHECKSUM" ]]; then
  echo "FAIL: rollback checksum mismatch before=$ORIG_CHECKSUM after=$FINAL_CHECKSUM"
  exit 1
fi
echo "PASS: rollback preflight matches original checksum_original=$FINAL_CHECKSUM count=$FINAL_COUNT"

echo
echo "=== 8. rollback is idempotent ==="
psql -d "$DB" -v ON_ERROR_STOP=1 -f "$DIR/rollback.sql" >/dev/null
echo "PASS: second rollback succeeded"

TOTAL="$(python3 -c "print(f'{float('$T_PREFLIGHT')+float('$T_BACKUP')+float('$T_DUMP')+float('$T_MIGRATE')+float('$T_POST')+float('$T_ROLLBACK'):.3f}')")"
echo
echo "=== timing (N=$ORIG_COUNT rows, local PostgreSQL) ==="
echo "preflight_s=$T_PREFLIGHT"
echo "backup_table_s=$T_BACKUP"
echo "pg_dump_s=$T_DUMP"
echo "migration_s=$T_MIGRATE"
echo "postflight_s=$T_POST"
echo "rollback_s=$T_ROLLBACK"
echo "total_s=$TOTAL"
echo "checksum_original=$ORIG_CHECKSUM"
echo "dump_sha256=$DUMP_SHA"
