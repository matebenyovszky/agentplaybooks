#!/usr/bin/env bash
# Restore a self-hosted AgentPlaybooks backup onto a running (or started)
# data-plane compose stack. Intended for an empty machine / fresh volumes.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

ARCHIVE=""
START_STACK=1

usage() {
  cat <<'EOF'
Usage: restore.sh --archive FILE [--compose-file FILE] [--no-start]

Restores Postgres and object storage from a backup.sh archive onto the
self-host compose stack. Fresh volumes are assumed (the target database is
dropped and recreated).

SECRETS_ENCRYPTION_KEY is not in the archive. It must already be in the
environment of the application (and of any post-restore verification).
Without it, vault ciphertext restores but cannot be decrypted.

Measure wall-clock time around this script for RTO.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --archive) ARCHIVE="$2"; shift 2 ;;
    --compose-file) SELF_HOST_COMPOSE_FILE="$2"; shift 2 ;;
    --no-start) START_STACK=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown option: $1" ;;
  esac
done

[ -n "${ARCHIVE}" ] || die "--archive is required"
[ -f "${ARCHIVE}" ] || die "Archive not found: ${ARCHIVE}"

require_cmd docker
require_cmd tar
require_cmd openssl

RESTORE_START_NS="$(date +%s%N)"

if [ "${START_STACK}" -eq 1 ]; then
  log "Starting data-plane stack…"
  compose up -d
fi
wait_for_db

WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT
chmod 700 "${WORK}"

EXTRACT="${WORK}/bundle"
mkdir -p "${EXTRACT}"

case "${ARCHIVE}" in
  *.enc)
    [ -n "${BACKUP_ENCRYPTION_PASSPHRASE:-}" ] || die "BACKUP_ENCRYPTION_PASSPHRASE is required to decrypt ${ARCHIVE}"
    openssl enc -d -aes-256-cbc -pbkdf2 -iter 310000 \
      -in "${ARCHIVE}" \
      -out "${WORK}/bundle.tar.gz" \
      -pass env:BACKUP_ENCRYPTION_PASSPHRASE
    tar -C "${EXTRACT}" -xzf "${WORK}/bundle.tar.gz"
    ;;
  *.tar.gz)
    tar -C "${EXTRACT}" -xzf "${ARCHIVE}"
    ;;
  *)
    die "Unrecognized archive type (expected .tar.gz or .tar.gz.enc): ${ARCHIVE}"
    ;;
esac

[ -f "${EXTRACT}/db/postgres.dump" ] || die "Archive is missing db/postgres.dump"
[ -f "${EXTRACT}/manifest.json" ] || die "Archive is missing manifest.json"

if command -v python3 >/dev/null 2>&1; then
  python3 - "${EXTRACT}" <<'PY'
import json, sys, pathlib
root = pathlib.Path(sys.argv[1])
manifest = json.loads((root / "manifest.json").read_text())
if manifest.get("encryption_master_key_included"):
    sys.exit("Refusing archive that claims to contain the vault master key")
print("manifest ok, created_at=", manifest.get("created_at"))
PY
fi

log "Recreating empty database '${POSTGRES_DB}'…"
recreate_database

log "Restoring Postgres dump…"
# pg_restore exits 1 when it emits notices for objects the dump could not
# recreate (e.g. comments). Fail on real errors via a log scan of "error:".
set +e
db_exec pg_restore -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
  --clean --if-exists --no-owner --no-acl \
  --exit-on-error \
  < "${EXTRACT}/db/postgres.dump"
RESTORE_STATUS=$?
set -e
if [ "${RESTORE_STATUS}" -ne 0 ]; then
  die "pg_restore failed with status ${RESTORE_STATUS}"
fi

if [ -f "${EXTRACT}/storage/files.tar" ]; then
  log "Restoring object storage…"
  if compose ps --status running --services 2>/dev/null | grep -qx "${STORAGE_SERVICE}"; then
    storage_exec sh -c "mkdir -p '${STORAGE_PATH}' && rm -rf '${STORAGE_PATH:?}/'* '${STORAGE_PATH}'/.[!.]* 2>/dev/null; tar -C '${STORAGE_PATH}' -xf -" \
      < "${EXTRACT}/storage/files.tar"
  else
    log "Storage service '${STORAGE_SERVICE}' is not running; skipped file restore."
  fi
fi

if [ -z "${SECRETS_ENCRYPTION_KEY:-}" ]; then
  err "WARNING: SECRETS_ENCRYPTION_KEY is not set. The database is restored but vault values cannot be decrypted until the original master key is provided to the app."
fi

RESTORE_END_NS="$(date +%s%N)"
RESTORE_MS=$(( (RESTORE_END_NS - RESTORE_START_NS) / 1000000 ))
RESTORE_SECONDS=$(( RESTORE_MS / 1000 ))
log "Restore finished."
printf 'RTO_MS=%s\n' "${RESTORE_MS}"
printf 'RTO_SECONDS=%s\n' "${RESTORE_SECONDS}"
printf 'RTO_HUMAN=%sm %ss\n' "$((RESTORE_SECONDS / 60))" "$((RESTORE_SECONDS % 60))"
