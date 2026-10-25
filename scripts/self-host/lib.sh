# Shared helpers for self-host backup, restore, and the restore drill.
# shellcheck shell=bash

SELF_HOST_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SELF_HOST_LIB_DIR}/../.." && pwd)"

SELF_HOST_COMPOSE_FILE="${COMPOSE_FILE:-${SELF_HOST_LIB_DIR}/compose.yml}"
SELF_HOST_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-agentplaybooks-selfhost}"
DB_SERVICE="${DB_SERVICE:-db}"
STORAGE_SERVICE="${STORAGE_SERVICE:-storage}"
STORAGE_PATH="${STORAGE_PATH:-/var/lib/storage}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-postgres}"
BACKUP_DIR="${BACKUP_DIR:-${REPO_ROOT}/backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-90}"
BACKUP_KEEP_COUNT="${BACKUP_KEEP_COUNT:-14}"

# SECRETS_ENCRYPTION_KEY and every other environment value stay outside config inventories.

log() { printf '%s\n' "$*"; }
err() { printf 'error: %s\n' "$*" >&2; }
die() { err "$*"; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

compose() {
  docker compose -f "${SELF_HOST_COMPOSE_FILE}" --project-name "${SELF_HOST_PROJECT_NAME}" "$@"
}

db_exec() {
  compose exec -T "${DB_SERVICE}" "$@"
}

storage_exec() {
  compose exec -T "${STORAGE_SERVICE}" "$@"
}

wait_for_db() {
  local i
  for i in $(seq 1 60); do
    if db_exec pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  die "Postgres in service '${DB_SERVICE}' did not become ready"
}

iso_utc_now() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

backup_stamp() {
  date -u +"%Y%m%dT%H%M%SZ"
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

redact_env_file() {
  local src="$1" dest="$2"
  if [ ! -f "$src" ]; then
    return 0
  fi
  umask 077
  python3 "${SELF_HOST_LIB_DIR}/archive.py" inventory "$src" "$dest"
}

git_commit_short() {
  git -C "${REPO_ROOT}" rev-parse --short HEAD 2>/dev/null || printf 'unknown'
}

# Drop and recreate the target database so restore lands on a truly empty
# catalog (initdb stubs live in the old database and would collide).
recreate_database() {
  wait_for_db
  [ "${POSTGRES_DB}" != template0 ] && [ "${POSTGRES_DB}" != template1 ] || die "Cannot replace a template database"
  db_exec psql -U "${POSTGRES_USER}" -d template1 -v ON_ERROR_STOP=1 \
    -v db="${POSTGRES_DB}" -v owner="${POSTGRES_USER}" <<'SQL'
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = :'db' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS :"db";
CREATE DATABASE :"db" OWNER :"owner";
SQL
}

validate_storage_path() {
  [[ "${STORAGE_PATH}" =~ ^/[a-zA-Z0-9_./-]+$ ]] || die "Unsafe STORAGE_PATH"
  [[ ! "${STORAGE_PATH}" =~ (^|/)\.\.(/|$) ]] || die "Unsafe STORAGE_PATH"
  [ "${STORAGE_PATH//\//}" != "" ] && [ "${STORAGE_PATH//\//}" != . ] || die "Storage path cannot be root"
}

# Locate an audit hash-chain verifier if a parallel change has landed it.
# Prints the command on stdout; returns 1 when nothing is present.
find_audit_chain_verify() {
  local pkg
  pkg="$(cd "${REPO_ROOT}" && npm pkg get scripts.audit:chain 2>/dev/null || true)"
  if [ -n "$pkg" ] && [ "$pkg" != "undefined" ] && [ "$pkg" != "{}" ]; then
    printf '%s\n' "npm run audit:chain"
    return 0
  fi

  local candidate
  for candidate in \
    "${REPO_ROOT}/scripts/verify-audit-chain.sh" \
    "${REPO_ROOT}/scripts/verify-audit-hash-chain.sh" \
    "${REPO_ROOT}/scripts/self-host/verify-audit-chain.sh" \
    "${REPO_ROOT}/scripts/verify-audit-chain.ts" \
    "${REPO_ROOT}/scripts/verify-audit-hash-chain.ts" \
    "${REPO_ROOT}/scripts/self-host/verify-audit-hash-chain.ts" \
    "${REPO_ROOT}/src/lib/audit-chain.ts"
  do
    if [ -f "$candidate" ]; then
      case "$candidate" in
        *.sh) printf '%s\n' "bash ${candidate}" ;;
        *.ts) printf '%s\n' "npx tsx ${candidate}" ;;
        *) printf '%s\n' "${candidate}" ;;
      esac
      return 0
    fi
  done
  return 1
}
