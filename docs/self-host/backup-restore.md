# On-prem backup and restore

Backup, business continuity, and disaster recovery for a self-hosted AgentPlaybooks instance. This runbook supports **NIS2 Article 21(2)(c)** (backup management and disaster recovery) for operators who run the product on their own infrastructure.

This is an operational guide, **not legal advice**. Confirm retention, classification, and reporting duties with your IBF (information-security officer) and counsel before production use.

The restore drill required by the test plan — restore from backup onto an empty machine, confirm secrets are readable, confirm the audit trail, record RTO — is automated as `scripts/self-host/restore-drill.sh` and `.github/workflows/self-host-restore-drill.yml`.

Related: [Self-Hosting](../../public/docs/self-hosting.md) (deployment), [Cross-platform Agent Backups](../../public/docs/portable-agent-backups.md) (`apb push` / `apb pull` of playbook files — **not** a vault or database backup).

## What to back up

A self-hosted instance has a stateless application container (`docker-compose.yml` at the repository root) and a stateful data plane (self-hosted Supabase, or `scripts/self-host/compose.yml` for the Postgres + object-storage half used by this runbook).

| Component | Why | How this repo backs it up |
| --- | --- | --- |
| **Postgres / Supabase database** | Playbooks, vault ciphertext (`public.secrets`), `public.audit_logs`, auth users, memory, snapshots | `pg_dump` custom format of the whole database (all non-catalog schemas) |
| **Vault tables** | AES-256-GCM ciphertext, IV, auth tag. Useless without the master key | Included in the database dump |
| **Object storage** | Supabase Storage buckets / uploaded files | tar of the storage volume |
| **Config** | Compose files, `supabase/config.toml` | Repository revision only; live deployment files must be stored separately |
| **Environment / secrets** | Connection URLs, JWT, service-role key | **Redacted** copy only (values replaced with `<redacted>`) |
| **Encryption master key** (`SECRETS_ENCRYPTION_KEY`) | HKDF input for every vault secret | **Never in the archive.** Store separately (HSM, sealed envelope, password manager) with its own offsite copy |

The application image is rebuilt from this repository. Do not treat container layers as the backup of record.

`apb push` portable snapshots store skills and MCP **references**, not vault values. They do not replace this runbook.

## Key-loss warning

**If `SECRETS_ENCRYPTION_KEY` is lost, every stored secret is gone.**

The vault derives a per-user AES-256-GCM key with HKDF from that 64-character hex master key, the owner’s user id, and (for v2 ciphertext) the playbook id and secret name. The database holds only ciphertext. There is no re-encryption tooling and no key-escrow path in the product.

- Generate the key once: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- Store it **outside** the backup archive, under a different access-control list than `BACKUP_ENCRYPTION_PASSPHRASE`
- Rotating it without a re-encrypt procedure makes existing rows undecryptable
- A successful database restore with the wrong key still looks healthy: playbooks and audit rows return, and `secret.encrypted_value` is present — decryption fails only when a caller reads a secret

Treat a missing master key as a reportable incident under your organisation’s process, not as a restore retry.

## Scheduling

| Trigger | Recommendation |
| --- | --- |
| Steady state | At least daily full dump; hourly if the security class or RPO requires it |
| After schema migrations | Take an extra full backup before and after applying `supabase/migrations/` |
| After key-ceremony changes | Backup of **config and database only** — still keep the new master key separate |
| After a restore drill | Keep the drill archive until the next successful drill |

Cron example (host that can see the compose project):

```bash
# /etc/cron.d/agentplaybooks-backup
SHELL=/bin/bash
# 02:15 local, every day
15 2 * * *  root  set -a; . /etc/agentplaybooks/backup.env; set +a; /opt/agentplaybooks/scripts/self-host/backup.sh >>/var/log/apb-backup.log 2>&1
```

Load `scripts/self-host/backup.env.example` into `/etc/agentplaybooks/backup.env` (mode `0600`).

## Encryption of backups

Archives are encrypted at rest with **AES-256-CBC, PBKDF2, 310 000 iterations**, via OpenSSL, using `BACKUP_ENCRYPTION_PASSPHRASE`.

- This passphrase **must not** be `SECRETS_ENCRYPTION_KEY`
- Backup files are written mode `0600` into `BACKUP_DIR` (default `./backups`, mode `0700`)
- `--no-encrypt` exists only for isolated lab debugging; do not use it in production
- Optionally copy the `.tar.gz.enc` file to an offsite location you control (`BACKUP_OFFSITE_RSYNC`)

Ciphertext of vault secrets is encrypted *again* inside the archive. That is defence in depth, not a substitute for the master key.

## Retention

`backup.sh` deletes archives older than `BACKUP_RETENTION_DAYS` (default 90) and then keeps only the newest `BACKUP_KEEP_COUNT` (default 14).

Pick numbers that match your classification under 7/2024 (VI. 24.) MK rendelet / organisational policy. A starting point many operators use:

- 14 daily copies on-site
- 4 weekly copies offsite
- 6 monthly copies offsite

The script implements a simple day/count cap so a full GFS calendar can live in your backup product (Veeam, Borg, restic) wrapping these archives. Do not lower retention in order to pass a disk-usage check.

## Offsite copy

Set `BACKUP_OFFSITE_RSYNC` to a second machine or cluster (example: `backup@dr.example.org:/var/backups/agentplaybooks/`). `backup.sh` runs `rsync -a` after a successful encrypt.

Follow a 3-2-1 pattern: three copies, two media, one offsite. The compose volumes on the primary host are **not** an offsite copy.

## RPO / RTO guidance

These are starting targets for an on-prem instance. Tighten them if your security class, IBF, or contract says so.

| Metric | Meaning | How this repo helps |
| --- | --- | --- |
| **RPO** (recovery point objective) | Maximum acceptable data loss | Equal to the backup interval. Daily backups ⇒ RPO ≤ 24 h. Hourly ⇒ RPO ≤ 1 h |
| **RTO** (recovery time objective) | Maximum acceptable downtime | Wall-clock of `restore.sh` on an empty machine, printed as `RTO_SECONDS` |

Record every restore drill’s `RTO_SECONDS` (CI logs and your BCP folder). If the measured RTO exceeds the target, the fix is operational (faster disks, warm standby, smaller database) — not a change that weakens audit or tests.

A reasonable first target for a significant-class on-prem instance: **RPO ≤ 24 h, RTO ≤ 4 h**. High class typically needs a tighter pair and a documented warm standby.

## Restore procedure (empty machine)

1. Install Docker and clone this repository (or copy the compose files and scripts).
2. Restore **`SECRETS_ENCRYPTION_KEY`** from the separate secret store into the application environment. Do not skip this step.
3. Restore **`BACKUP_ENCRYPTION_PASSPHRASE`** so the archive can be decrypted.
4. Copy the newest `.tar.gz.enc` from offsite to the machine.
5. Start an empty data plane:

   ```bash
   docker compose -f scripts/self-host/compose.yml down -v
   docker compose -f scripts/self-host/compose.yml up -d
   ```

   For official self-hosted Supabase, start that stack with **fresh volumes** instead, and point `COMPOSE_FILE` / `DB_SERVICE` / `STORAGE_SERVICE` at it.

6. Restore:

   ```bash
   export BACKUP_ENCRYPTION_PASSPHRASE=…
   export SECRETS_ENCRYPTION_KEY=…
   ./scripts/self-host/restore.sh --archive backups/agentplaybooks-backup-YYYYMMDDTHHMMSSZ.tar.gz.enc
   ```

7. Start (or rebuild) the application from the root `docker-compose.yml`, with the same `NEXT_PUBLIC_SUPABASE_*` values the browser can reach and with `SECRETS_ENCRYPTION_KEY` set.
8. Verify:
   - A playbook that existed before the incident still loads
   - A vault secret decrypts (reveal or `use_secret` with a known test value)
   - `audit_logs` row count is at least the pre-incident count
   - If the audit hash-chain verify command exists on this revision, run it
9. Write the printed `RTO_SECONDS` into the drill record.

`restore.sh` **drops and recreates** the target database. Do not point it at a live instance you still need.

## Scripts

| Script | Purpose |
| --- | --- |
| `scripts/self-host/backup.sh` | Dump Postgres + storage + redacted config; encrypt; retain; optional offsite rsync |
| `scripts/self-host/restore.sh` | Decrypt, recreate the database, restore dump and storage; print RTO |
| `scripts/self-host/restore-drill.sh` | Empty-machine drill used in CI |
| `scripts/self-host/compose.yml` | Postgres 17 + storage volume used when you are not running the full Supabase Docker stack |
| `scripts/self-host/backup.env.example` | Environment template (never commit a filled copy) |

```bash
# Backup (from the repository root)
set -a; . /etc/agentplaybooks/backup.env; set +a
./scripts/self-host/backup.sh

# Restore onto empty volumes
./scripts/self-host/restore.sh --archive backups/agentplaybooks-backup-….tar.gz.enc

# Automated drill (also run by CI)
./scripts/self-host/restore-drill.sh
```

Point the same scripts at an official Supabase compose project:

```bash
export COMPOSE_FILE=/opt/supabase/docker/docker-compose.yml
export COMPOSE_PROJECT_NAME=supabase
export DB_SERVICE=db
export STORAGE_SERVICE=storage
export STORAGE_PATH=/var/lib/storage
```

## Restore drill

The drill:

1. Starts `scripts/self-host/compose.yml`
2. Applies `supabase/schema.sql`
3. Seeds one playbook, one AES-256-GCM secret, three `audit_logs` rows, and a storage object
4. Runs `backup.sh`
5. `docker compose down -v` (volumes must disappear)
6. Starts a fresh stack and runs `restore.sh`
7. Asserts: secret decrypts to the same plaintext, playbook name/GUID match, `audit_logs` count is unchanged, storage object matches
8. If an audit hash-chain verify command exists (`npm run audit:chain`, `scripts/verify-audit-chain.sh`, or `scripts/verify-audit-hash-chain.ts`), runs it; otherwise prints a notice and continues
9. Prints `RTO_SECONDS`

CI: `.github/workflows/self-host-restore-drill.yml` (pull request and `main` when these files change, plus a weekly schedule).


## Audited restore safeguards (2026-10-25)

Requires Python 3.12+ on the backup/restore host. Before any database replacement,
restore validates the manifest, component checksums and archive member paths.
Checksums detect corruption; they do not authenticate an archive from an untrusted
source. Keep encrypted archives in access-controlled storage.

Database grants are restored (no `--no-acl`). Provision all referenced PostgreSQL
roles on the destination cluster first; cluster role definitions are not part of
pg_dump. The drill verifies a private playbook as service_role after restore.

Unavailable object storage fails backup/restore. `backup.sh --skip-storage` is an
explicit database-only backup and records storage as excluded. It cannot recover
objects. Pause application and storage writes during a full backup to obtain a
consistent database/object snapshot; the two components are not atomically captured.

Config inventories contain environment variable names only; every value, comment
and continuation is omitted. Live Compose/TOML files may contain inline credentials
and are never copied. Preserve deployment configuration, cluster roles, the master
key and other credentials separately in the operator's protected configuration store.
