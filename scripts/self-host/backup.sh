#!/usr/bin/env bash
# Backup a self-hosted AgentPlaybooks instance: Postgres (incl. vault tables),
# object storage, and redacted config. The vault master key is never included.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

ENCRYPT=1
OUTPUT_DIR=""
SKIP_STORAGE=0
umask 077

usage() {
  cat <<'EOF'
Usage: backup.sh [--output-dir DIR] [--no-encrypt] [--compose-file FILE] [--skip-storage]

Creates an archive of:
  - Postgres (all schemas: public/secrets, public/audit_logs, auth, storage, …)
  - Object-storage volume
  - Environment variable names only (all values redacted); repository revision

The vault master key (SECRETS_ENCRYPTION_KEY) is intentionally omitted.
Store it separately. Encrypt the archive with BACKUP_ENCRYPTION_PASSPHRASE
(a different secret). See docs/self-host/backup-restore.md.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --output-dir) OUTPUT_DIR="$2"; shift 2 ;;
    --no-encrypt) ENCRYPT=0; shift ;;
    --skip-storage) SKIP_STORAGE=1; shift ;;
    --compose-file) SELF_HOST_COMPOSE_FILE="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown option: $1" ;;
  esac
done

require_cmd docker
require_cmd tar
require_cmd openssl
require_cmd python3
validate_storage_path
if [ "${SKIP_STORAGE}" -eq 0 ]; then
  compose ps --status running --services | grep -qx "${STORAGE_SERVICE}" || die "Storage is unavailable; use --skip-storage only for an intentional database-only backup"
fi

if [ "${ENCRYPT}" -eq 1 ]; then
  [ -n "${BACKUP_ENCRYPTION_PASSPHRASE:-}" ] || die "BACKUP_ENCRYPTION_PASSPHRASE is required (or pass --no-encrypt)"
fi

OUTPUT_DIR="${OUTPUT_DIR:-${BACKUP_DIR}}"
mkdir -p "${OUTPUT_DIR}"
chmod 700 "${OUTPUT_DIR}"

STAMP="$(backup_stamp)"
STAGE="$(mktemp -d "${OUTPUT_DIR}/.stage.${STAMP}.XXXXXX")"
STAMP="${STAMP}-${STAGE##*.}"
trap 'rm -rf "${STAGE}"' EXIT
chmod 700 "${STAGE}"

BUNDLE="${STAGE}/bundle"
mkdir -p "${BUNDLE}/db" "${BUNDLE}/storage" "${BUNDLE}/config"

log "Dumping Postgres from service '${DB_SERVICE}'…"
wait_for_db
db_exec pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
  --format=custom --compress=6 --no-owner \
  --exclude-schema=pg_catalog --exclude-schema=information_schema \
  > "${BUNDLE}/db/postgres.dump"
[ -s "${BUNDLE}/db/postgres.dump" ] || die "pg_dump produced an empty file"

log "Archiving object storage from '${STORAGE_SERVICE}:${STORAGE_PATH}'…"
if [ "${SKIP_STORAGE}" -eq 0 ]; then
  storage_exec sh -c 'test -d "$1" && tar -C "$1" -cf - .' sh "${STORAGE_PATH}" \
    > "${BUNDLE}/storage/files.tar"
else
  log "Database-only backup requested; storage is excluded."
fi

log "Copying redacted configuration…"
# Live YAML/TOML can contain inline credentials. Preserve no raw configuration.
# Operators must retain their deployment config and role definitions separately.
printf '%s\n' "Repository revision: $(git_commit_short)" > "${BUNDLE}/config/README.txt"
for envfile in "${REPO_ROOT}/.env" "${REPO_ROOT}/.env.local" "${SELF_HOST_LIB_DIR}/.env"; do
  if [ -f "$envfile" ]; then
    redact_env_file "$envfile" "${BUNDLE}/config/$(printf '%s' "$envfile" | sha256sum | cut -c1-12)-$(basename "$envfile").redacted"
  fi
done

cat > "${BUNDLE}/KEY-SEPARATION.txt" <<'EOF'
This archive does NOT contain SECRETS_ENCRYPTION_KEY.

Vault ciphertext in Postgres is AES-256-GCM under a per-user HKDF of that
master key. Restoring the database without the original key leaves every
secret unreadable. There is no re-encryption / key-recovery path.

Keep the master key in a separate secret store (HSM, sealed envelope,
password manager) with its own access control and offsite copy.
The backup-archive passphrase (BACKUP_ENCRYPTION_PASSPHRASE) must also
be distinct from the vault master key.
EOF

DB_SHA="$(sha256_file "${BUNDLE}/db/postgres.dump")"
STORAGE_SHA=""
COMPONENTS='"postgres", "config"'
if [ "${SKIP_STORAGE}" -eq 0 ]; then
  STORAGE_SHA="$(sha256_file "${BUNDLE}/storage/files.tar")"
  COMPONENTS='"postgres", "storage", "config"'
fi
cat > "${BUNDLE}/manifest.json" <<EOF
{
  "version": 1,
  "created_at": "$(iso_utc_now)",
  "git_commit": "$(git_commit_short)",
  "hostname": "$(hostname 2>/dev/null || printf unknown)",
  "postgres_dump_sha256": "${DB_SHA}",
  "storage_tar_sha256": "${STORAGE_SHA}",
  "encryption_master_key_included": false,
  "components": [${COMPONENTS}]
}
EOF
python3 "${SCRIPT_DIR}/archive.py" validate "${BUNDLE}"

PLAIN_ARCHIVE="${OUTPUT_DIR}/agentplaybooks-backup-${STAMP}.tar.gz"
tar -C "${BUNDLE}" -czf "${PLAIN_ARCHIVE}" .
chmod 600 "${PLAIN_ARCHIVE}"

FINAL_ARCHIVE="${PLAIN_ARCHIVE}"
if [ "${ENCRYPT}" -eq 1 ]; then
  FINAL_ARCHIVE="${PLAIN_ARCHIVE}.enc"
  openssl enc -aes-256-cbc -pbkdf2 -iter 310000 -salt \
    -in "${PLAIN_ARCHIVE}" \
    -out "${FINAL_ARCHIVE}" \
    -pass env:BACKUP_ENCRYPTION_PASSPHRASE
  chmod 600 "${FINAL_ARCHIVE}"
  rm -f "${PLAIN_ARCHIVE}"
fi

log "Wrote ${FINAL_ARCHIVE}"

if [ -n "${BACKUP_OFFSITE_RSYNC:-}" ]; then
  require_cmd rsync
  log "Copying offsite to ${BACKUP_OFFSITE_RSYNC}…"
  rsync -a --chmod=600 "${FINAL_ARCHIVE}" "${BACKUP_OFFSITE_RSYNC}"
fi

# Retention: drop files older than N days, then keep only the newest M.
if [ "${BACKUP_RETENTION_DAYS}" -gt 0 ] 2>/dev/null; then
  find "${OUTPUT_DIR}" -maxdepth 1 \( -name 'agentplaybooks-backup-*.tar.gz' -o -name 'agentplaybooks-backup-*.tar.gz.enc' \) \
    -type f -mtime "+${BACKUP_RETENTION_DAYS}" -delete
fi
if [ "${BACKUP_KEEP_COUNT}" -gt 0 ] 2>/dev/null; then
  shopt -s nullglob
  KEEP_CANDIDATES=("${OUTPUT_DIR}"/agentplaybooks-backup-*.tar.gz*)
  shopt -u nullglob
  if [ "${#KEEP_CANDIDATES[@]}" -gt "${BACKUP_KEEP_COUNT}" ]; then
    # Newest first; drop the tail.
    IFS=$'\n' KEEP_SORTED=($(ls -1t "${KEEP_CANDIDATES[@]}"))
    unset IFS
    for stale in "${KEEP_SORTED[@]:${BACKUP_KEEP_COUNT}}"; do
      rm -f "${stale}"
    done
  fi
fi

printf 'BACKUP_ARCHIVE=%s\n' "${FINAL_ARCHIVE}"
