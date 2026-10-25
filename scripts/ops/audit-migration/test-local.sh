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
CHECK="$DIR/check-project.sh"

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

echo "=== 0. project-ref sanity check (offline URI parse, no network) ==="
chmod +x "$CHECK"

expect_nogo() {
  local label="$1"
  shift
  if PROD_DB_URL="$1" "$CHECK" >/tmp/audit-check-out.txt 2>/tmp/audit-check-err.txt; then
    echo "FAIL: $label should have aborted"
    cat /tmp/audit-check-err.txt
    exit 1
  fi
  if ! grep -q "NO-GO" /tmp/audit-check-err.txt; then
    echo "FAIL: $label stderr missing NO-GO"
    cat /tmp/audit-check-err.txt
    exit 1
  fi
  echo "PASS: aborted $label"
}

expect_go() {
  local label="$1"
  shift
  if ! PROD_DB_URL="$1" "$CHECK" >/tmp/audit-check-out.txt 2>/tmp/audit-check-err.txt; then
    echo "FAIL: $label should have passed"
    cat /tmp/audit-check-err.txt
    exit 1
  fi
  if ! grep -q "GO: target is heap project zcphxfospbvqplonkvco" /tmp/audit-check-out.txt; then
    echo "FAIL: $label stdout missing GO"
    cat /tmp/audit-check-out.txt
    exit 1
  fi
  echo "PASS: accepted $label"
}

expect_nogo "retired direct" "postgresql://postgres:x@db.bydcjwxfiiolmnddzbpy.supabase.co:5432/postgres"
expect_nogo "retired pooler" "postgresql://postgres.bydcjwxfiiolmnddzbpy:x@aws-0-eu-central-1.pooler.supabase.com:5432/postgres"
expect_nogo "localhost" "postgresql://postgres:x@localhost:5432/postgres"
expect_nogo "transaction pooler" "postgresql://postgres.zcphxfospbvqplonkvco:x@aws-0-eu-central-1.pooler.supabase.com:6543/postgres"
expect_nogo "unset URL" ""
expect_go "heap direct" "postgresql://postgres:x@db.zcphxfospbvqplonkvco.supabase.co:5432/postgres"
expect_go "heap session pooler" "postgresql://postgres.zcphxfospbvqplonkvco:x@aws-0-eu-central-1.pooler.supabase.com:5432/postgres"

echo "=== creating database $DB ==="
createdb "$DB"
trap 'dropdb --if-exists "$DB"; rm -rf "$DUMP_DIR"' EXIT

psql -d "$DB" -v ON_ERROR_STOP=1 -f "$DIR/fixture-pre-migration.sql" >/dev/null
psql -d "$DB" -v ON_ERROR_STOP=1 -c "
  CREATE SCHEMA IF NOT EXISTS supabase_migrations;
  CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
    version text PRIMARY KEY,
    name text,
    statements text[]
  );
"

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
echo "=== 6. record schema_migrations version 20261024120000 ==="
psql -d "$DB" -v ON_ERROR_STOP=1 -f "$DIR/record-version.sql"
RECORDED="$(psql -d "$DB" -A -t -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20261024120000';" | tr -d '[:space:]')"
if [[ "$RECORDED" != "1" ]]; then
  echo "FAIL: schema_migrations missing 20261024120000 (count=$RECORDED)"
  exit 1
fi
echo "PASS: schema_migrations has 20261024120000"

echo
echo "=== 7. migration idempotency (re-apply SQL; hashes already set so backfill skips) ==="
psql -d "$DB" -v ON_ERROR_STOP=1 -f "$MIGRATION" >/tmp/audit-migration-reapply.log
IDEM_CHECKSUM="$(checksum_sql)"
IDEM_COUNT="$(psql -d "$DB" -A -t -v ON_ERROR_STOP=1 -c 'SELECT count(*) FROM public.audit_logs;' | tr -d '[:space:]')"
# postflight RAISE EXCEPTION on mismatch; ON_ERROR_STOP=1 is the GO/NO-GO.
psql -d "$DB" -v ON_ERROR_STOP=1 -f "$DIR/postflight.sql"
if [[ "$IDEM_COUNT" != "$ORIG_COUNT" || "$IDEM_CHECKSUM" != "$ORIG_CHECKSUM" ]]; then
  echo "FAIL: re-apply changed count/checksum before=$ORIG_COUNT $ORIG_CHECKSUM after=$IDEM_COUNT $IDEM_CHECKSUM"
  exit 1
fi
psql -d "$DB" -v ON_ERROR_STOP=1 -f "$DIR/record-version.sql" >/dev/null
echo "PASS: re-apply left count=$IDEM_COUNT checksum_original=$IDEM_CHECKSUM mismatches=0; record-version idempotent"

echo
echo "=== 8. rollback ==="
t=$(date +%s.%N)
psql -d "$DB" -v ON_ERROR_STOP=1 -f "$DIR/rollback.sql"
T_ROLLBACK="$(elapsed "$t")"
UNRECORDED="$(psql -d "$DB" -A -t -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20261024120000';" | tr -d '[:space:]')"
if [[ "$UNRECORDED" != "0" ]]; then
  echo "FAIL: rollback left schema_migrations version 20261024120000"
  exit 1
fi
echo "rollback_seconds=$T_ROLLBACK unrecorded=t"

echo
echo "=== 9. preflight after rollback (must match original checksum) ==="
psql -d "$DB" -v ON_ERROR_STOP=1 -f "$DIR/preflight.sql"
FINAL_CHECKSUM="$(checksum_sql)"
FINAL_COUNT="$(psql -d "$DB" -A -t -v ON_ERROR_STOP=1 -c 'SELECT count(*) FROM public.audit_logs;' | tr -d '[:space:]')"
if [[ "$FINAL_COUNT" != "$ORIG_COUNT" || "$FINAL_CHECKSUM" != "$ORIG_CHECKSUM" ]]; then
  echo "FAIL: rollback checksum mismatch before=$ORIG_CHECKSUM after=$FINAL_CHECKSUM"
  exit 1
fi
echo "PASS: rollback preflight matches original checksum_original=$FINAL_CHECKSUM count=$FINAL_COUNT"

echo
echo "=== 10. rollback is idempotent ==="
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
echo "PASS: local rehearsal complete"
