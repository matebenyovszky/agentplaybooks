#!/usr/bin/env bash
# Restore drill (NIS2 21(2)(c)): bring up the self-host data plane, seed a
# playbook + vault secret + audit events, backup, destroy volumes, restore onto
# the empty stack, and assert secrets/playbook/audit survive. Prints RTO.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

export COMPOSE_FILE="${SELF_HOST_COMPOSE_FILE}"
export COMPOSE_PROJECT_NAME="${SELF_HOST_PROJECT_NAME}"
export SECRETS_ENCRYPTION_KEY="${SECRETS_ENCRYPTION_KEY:-0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef}"
export BACKUP_ENCRYPTION_PASSPHRASE="${BACKUP_ENCRYPTION_PASSPHRASE:-restore-drill-backup-passphrase}"
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-postgres}"

DRILL_DIR="$(mktemp -d "${TMPDIR:-/tmp}/apb-restore-drill.XXXXXX")"
KEEP_STACK="${KEEP_STACK:-0}"
cleanup() {
  local status=$?
  if [ "${KEEP_STACK}" != "1" ]; then
    compose down -v --remove-orphans >/dev/null 2>&1 || true
  fi
  rm -rf "${DRILL_DIR}"
  exit "${status}"
}
trap cleanup EXIT

require_cmd docker
require_cmd openssl
command -v npx >/dev/null 2>&1 || die "npx is required (run npm ci first)"

log "=== Restore drill: starting self-host data plane ==="
compose down -v --remove-orphans >/dev/null 2>&1 || true
compose up -d --wait --wait-timeout 60
wait_for_db

log "Applying supabase/schema.sql onto the empty database…"
db_exec psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -v ON_ERROR_STOP=1 \
  < "${REPO_ROOT}/supabase/schema.sql"

log "Seeding playbook, vault secret, audit events…"
npx tsx "${SCRIPT_DIR}/seed-drill.ts" 2>"${DRILL_DIR}/seed-meta.json" \
  | db_exec psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -v ON_ERROR_STOP=1

storage_exec sh -c "mkdir -p '${STORAGE_PATH}' && printf 'restore-drill-object\n' > '${STORAGE_PATH}/drill-object.txt'"

log "Taking backup…"
BACKUP_DIR="${DRILL_DIR}/backups" \
  "${SCRIPT_DIR}/backup.sh" --output-dir "${DRILL_DIR}/backups" \
  | tee "${DRILL_DIR}/backup.out"
ARCHIVE="$(awk -F= '/^BACKUP_ARCHIVE=/ {print $2}' "${DRILL_DIR}/backup.out" | tail -n 1)"
[ -n "${ARCHIVE}" ] && [ -f "${ARCHIVE}" ] || die "backup.sh did not report an archive"

log "Tearing down stack (fresh volumes)…"
compose down -v --remove-orphans
# Confirm volumes are gone so restore cannot cheat by reusing data.
if docker volume ls -q --filter "name=${SELF_HOST_PROJECT_NAME}" | grep -q .; then
  die "Compose volumes still present after down -v"
fi

log "Starting empty stack and restoring…"
compose up -d --wait --wait-timeout 60
wait_for_db

# Baseline: the empty database must not already contain the seeded playbook.
EMPTY_COUNT="$(db_exec psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -At -t \
  -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='playbooks'" | tr -d '[:space:]')"
if [ "${EMPTY_COUNT}" = "1" ]; then
  SEEDED="$(db_exec psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -At -t \
    -c "SELECT count(*) FROM public.playbooks" 2>/dev/null | tr -d '[:space:]' || printf 0)"
  if [ "${SEEDED}" != "0" ] && [ -n "${SEEDED}" ]; then
    die "Fresh stack already has playbook rows; volumes were not reset"
  fi
fi

"${SCRIPT_DIR}/restore.sh" --archive "${ARCHIVE}" --no-start \
  | tee "${DRILL_DIR}/restore.out"
RTO_SECONDS="$(awk -F= '/^RTO_SECONDS=/ {print $2}' "${DRILL_DIR}/restore.out" | tail -n 1)"
RTO_MS="$(awk -F= '/^RTO_MS=/ {print $2}' "${DRILL_DIR}/restore.out" | tail -n 1)"

log "Asserting playbook, decrypted secret, audit_logs, storage…"
npx tsx "${SCRIPT_DIR}/verify-restore.ts"

if VERIFY_CMD="$(find_audit_chain_verify)"; then
  log "Running audit hash-chain verifier: ${VERIFY_CMD}"
  export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_PORT:-54322}/${POSTGRES_DB}"
  (
    cd "${REPO_ROOT}"
    # shellcheck disable=SC2086
    eval ${VERIFY_CMD}
  )
else
  NOTICE="Audit hash-chain verify command is not present on this revision; skipping (a parallel PR is adding it)."
  log "notice: ${NOTICE}"
  if [ -n "${GITHUB_ACTIONS:-}" ]; then
    printf '::notice::%s\n' "${NOTICE}"
  fi
fi

log "=== Restore drill passed ==="
printf 'RESTORE_DRILL_OK=1\n'
printf 'RTO_MS=%s\n' "${RTO_MS}"
printf 'RTO_SECONDS=%s\n' "${RTO_SECONDS}"
printf 'BACKUP_ARCHIVE=%s\n' "${ARCHIVE}"
