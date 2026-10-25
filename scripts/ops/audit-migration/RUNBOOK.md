# Audit logs compliance migration runbook

Operator copy-paste for **`supabase/migrations/20261024120000_audit_logs_compliance.sql`**.
Mate approved shipping it, conditional on this backup + verification + rollback.

**Do not run these commands against production from an agent session.** This
document is for a human with dashboard access. This agent has no prod access.

Apply the migration **before** merging PR #202 and deploying the new app.
The currently deployed app tolerates the new schema (additive columns, insert
trigger fills `prev_hash`/`hash`, `playbook_collaborators.role` defaults to
`editor`, `api_keys` check is a superset). The new app **requires** the
migration (hash columns, `purge_audit_logs`, auditor RLS). Do not merge/deploy
first.

Pause writes to `audit_logs` for the window, or run it at night when inserts
are negligible. The backfill disables the hash trigger while it rewrites rows;
a concurrent insert in that window would skip hashing.

---

## 0. Prerequisites

From the **repo root on this branch** (`cursor/audit-logs-compliance-adfd`):

```bash
cd "$(git rev-parse --show-toplevel)"
git fetch origin
git checkout cursor/audit-logs-compliance-adfd
git pull origin cursor/audit-logs-compliance-adfd
ls scripts/ops/audit-migration/preflight.sql \
   supabase/migrations/20261024120000_audit_logs_compliance.sql
```

**psql / pg_dump** major version must be **≥ the server's Postgres major**.
Optional: Supabase CLI (`supabase --version`) — not required; this runbook uses
`psql` and `pg_dump` only.

```bash
psql --version
pg_dump --version
```

### Connection string (prod)

1. Open the project in the [Supabase dashboard](https://supabase.com/dashboard).
2. **Connect** (top bar) **or** **Project Settings → Database**.
3. Copy the **URI** connection string.
4. Use **Direct connection** (`db.<project-ref>.supabase.co` port **5432**) or
   **Session pooler** (`*.pooler.supabase.com` port **5432**).
5. **Do not** use the **Transaction pooler** (port **6543**) for `pg_dump` or
   this backfill.

Set it without printing the secret. `read -s` keeps it out of shell history
better than a literal `export` on the command line:

```bash
# paste the URI, press Enter; nothing is echoed
IFS= read -r -s PROD_DB_URL
export PROD_DB_URL
echo "PROD_DB_URL is set (${#PROD_DB_URL} chars)"
# confirm server major (safe; prints version only)
psql "$PROD_DB_URL" -c "SHOW server_version;"
```

Client major ≥ that server major. Do not `echo "$PROD_DB_URL"`, do not `set -x`.

Estimate duration from live row count (formula in §6):

```bash
psql "$PROD_DB_URL" -c "SELECT count(*) AS n FROM public.audit_logs;"
```

---

## 1. Preflight (read-only)

```bash
psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 -f scripts/ops/audit-migration/preflight.sql
```

**Expected** (values differ per database; this is one local 1000-row fixture run):

```
=== audit_logs preflight summary ===
 row_count |     min_created_at     |     max_created_at     |           checksum_ids           |        checksum_original
-----------+------------------------+------------------------+----------------------------------+----------------------------------
      1000 | 2026-01-01 00:01:00+00 | 2026-01-01 16:40:00+00 | 2edf307105b631aa328804b7ed690f11 | 447ece376ad91df83b052e0b76f8f552

=== audit_logs count by action (operation) ===
   action    |  n
-------------+-----
 mcp.call    | 333
 secret.list | 334
 secret.use  | 333
```

**Pass:** one summary row, `row_count` ≥ 0, both checksums are 32-char hex.
Copy `row_count`, `checksum_ids`, `checksum_original`, and the action counts
onto the record sheet. These must match postflight.

---

## 2. In-DB backup table

```bash
psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 -f scripts/ops/audit-migration/backup.sql
```

**Expected:**

```
NOTICE:  created audit_logs_backup_20261025
 live_row_count | backup_row_count | counts_equal
----------------+------------------+--------------
           1000 |             1000 | t
```

**Pass:** `counts_equal` is `t` and both counts equal preflight `row_count`.
If the table already existed, you get `already exists — leaving it unchanged`
and the counts must still match. Do not drop a good backup.

---

## 3. `pg_dump` file + sha256

```bash
DUMP_FILE="audit_logs_backup_20261025_$(date -u +%Y%m%dT%H%M%SZ).sql"
pg_dump "$PROD_DB_URL" --data-only --table=public.audit_logs -f "$DUMP_FILE"
test -s "$DUMP_FILE"
sha256sum "$DUMP_FILE" | tee "${DUMP_FILE}.sha256"
ls -l "$DUMP_FILE"
```

**Expected:**

```
<64 hex chars>  audit_logs_backup_20261025_20261025T....sql
-rw-r--r-- ... 191789 ... audit_logs_backup_20261025_....sql
```

**Pass:** `test -s` succeeds (file non-empty), sha256 printed and teed to
`${DUMP_FILE}.sha256`. Copy the path and digest onto the record sheet.
Keep the file off the app servers (operator laptop or the backup bucket).

---

## 4. GO / NO-GO before applying the migration

All of the following must be true. **Any miss is NO-GO — do not migrate.**

| Check | Pass |
| --- | --- |
| Backup table row count == live `audit_logs` count | `counts_equal = t` |
| That count == preflight `row_count` | equal |
| Dump file non-empty | `test -s "$DUMP_FILE"` exited 0 |
| sha256 recorded | `${DUMP_FILE}.sha256` exists and is 64 hex chars |

```bash
# re-read counts; stop unless every test prints GO
test -s "$DUMP_FILE" && echo GO dump || echo NO-GO dump
test -s "${DUMP_FILE}.sha256" && echo GO sha256 || echo NO-GO sha256
psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 -c "
SELECT
  (SELECT count(*) FROM public.audit_logs) AS live,
  (SELECT count(*) FROM public.audit_logs_backup_20261025) AS backup,
  (SELECT count(*) FROM public.audit_logs)
    = (SELECT count(*) FROM public.audit_logs_backup_20261025) AS counts_equal;
"
```

---

## 5. Apply the migration

Only after a GO in §4.

```bash
psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261024120000_audit_logs_compliance.sql
```

**Expected:** ends with `CREATE POLICY` / `ALTER TABLE` (auditor policy +
`api_keys` check). First-time apply prints several `does not exist, skipping`
NOTICEs for `DROP … IF EXISTS` — that is normal. **Pass:** exit code 0.
Any ERROR is NO-GO → rollback (§8).

---

## 6. Postflight

```bash
psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 -f scripts/ops/audit-migration/postflight.sql
```

**Expected** (checksums must equal preflight; mismatches must be 0):

```
=== audit_logs postflight summary (original columns) ===
 row_count | ... | checksum_ids | checksum_original
      1000 | ... | 2edf3071...  | 447ece376ad91df83b052e0b76f8f552

 hash_mismatches | chain_mismatches | mismatch_count | first_broken_id
-----------------+------------------+----------------+-----------------
               0 |                0 |              0 |
NOTICE:  GO: hash-chain mismatches = 0
```

**Pass:** `row_count`, `checksum_ids`, and `checksum_original` are **identical**
to preflight; `mismatch_count = 0`; `first_broken_id` is NULL; notice says GO.
Postflight **aborts** (`NO-GO: hash-chain mismatches = …`) if the chain is
broken.

The chain check recomputes `encode(extensions.digest(convert_to(
audit_log_canonical(...), 'UTF8'), 'sha256'), 'hex')` from stored `prev_hash`
plus the canonical fields, matching the migration and `src/lib/audit-chain.ts`.
It also checks that each row's `prev_hash` equals the previous row's `hash`
(or genesis / latest checkpoint).

---

## 7. GO / NO-GO after applying the migration

| Check | Pass |
| --- | --- |
| Row count unchanged | postflight `row_count` == preflight |
| Checksum over original columns unchanged | `checksum_original` equal |
| Id checksum unchanged | `checksum_ids` equal |
| Hash-chain mismatches | `0` |
| First broken id | NULL |

**GO:** merge PR #202 and deploy the new app.

**NO-GO:** any mismatch, a migration ERROR, or app errors after deploy →
rollback (§8). Do not merge.

---

## 8. Rollback

**Trigger:** any NO-GO, a migration error, or app errors after deploy (before
or immediately after merge). Exact commands:

```bash
psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 -f scripts/ops/audit-migration/rollback.sql
psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 -f scripts/ops/audit-migration/preflight.sql
```

**Expected after rollback:**

```
NOTICE:  restored 1000 rows from audit_logs_backup_20261025
 checkpoints_dropped | hash_column_dropped | canonical_dropped | trigger_dropped | collaborator_role_dropped | live_row_count | backup_row_count
 t                   | t                   | t                 | t               | t                         |           1000 |             1000
```

Then preflight `row_count`, `checksum_ids`, and `checksum_original` **match
the original preflight**. Rollback is idempotent (a second run succeeds with
`does not exist, skipping` / `hash column already dropped`).

The backup table is kept. Drop it only after you are sure you will not roll
back again:

```bash
# optional, after a successful GO deploy, not part of rollback
# psql "$PROD_DB_URL" -c "DROP TABLE IF EXISTS public.audit_logs_backup_20261025;"
```

---

## 9. Duration

Local rehearsal (PostgreSQL 16 on this VM, fixture in
`fixture-pre-migration.sql`):

| Step | N = 1,000 | N = 10,000 |
| --- | ---: | ---: |
| Preflight | 0.034 s | 0.089 s |
| In-DB backup table | 0.033 s | 0.049 s |
| `pg_dump` | 0.059 s | 0.066 s |
| Apply migration (backfill) | 0.074 s | 0.324 s |
| Postflight | 0.055 s | 0.224 s |
| Rollback | 0.050 s | 0.119 s |
| **Total (no operator think-time)** | **0.305 s** | **~0.87 s** |

The backfill is one server-side `DO` loop (not one round-trip per row).

**Formula** (local), with `N` = `count(*)` from `audit_logs`:

```
T_migrate  ≈ 0.05s + 0.028s × (N / 1000)
T_post     ≈ 0.04s + 0.019s × (N / 1000)
T_total    ≈ 0.20s + 0.060s × (N / 1000)
```

Hosted I/O / WAL: multiply by **3–5×**, then add a couple of minutes of
operator copy-paste.

| N | Local total | Prod estimate |
| ---: | ---: | --- |
| 1,000 | 0.3 s | ~1 min elapsed (operator) |
| 10,000 | 0.9 s | ~1–2 min |
| 100,000 | ~6 s | ~2–5 min |
| 1,000,000 | ~1 min | ~5–10 min |

Writes to `audit_logs` during the window should be paused or are negligible
at night.

---

## 10. Record sheet

Fill this in as you go. Do not paste `PROD_DB_URL`.

| Field | Value |
| --- | --- |
| Operator | |
| Date (UTC) | |
| Git SHA of this branch | |
| Connection kind (direct / session pooler) | |
| `psql --version` | |
| `pg_dump --version` | |
| `SHOW server_version` | |
| Preflight `row_count` | |
| Preflight `min_created_at` / `max_created_at` | |
| Preflight counts by action | |
| Preflight `checksum_ids` | |
| Preflight `checksum_original` | |
| Backup table | `public.audit_logs_backup_20261025` |
| Backup table count | |
| Dump file path | |
| Dump sha256 | |
| Pre-migrate GO / NO-GO | |
| Migration started / finished (UTC) | |
| Postflight `row_count` | |
| Postflight `checksum_ids` | |
| Postflight `checksum_original` | |
| `mismatch_count` / `first_broken_id` | |
| Post-migrate GO / NO-GO | |
| Rollback run? (yes/no) | |
| Rollback preflight checksum | |
| PR #202 merged after GO? | |

---

## 11. Order vs merge / deploy

1. **This migration** on production (this runbook).
2. Confirm postflight GO.
3. **Merge PR #202** and **deploy** the new app.

Do **not** reverse that order. Old app code tolerates the new schema in
between: new columns are nullable and ignored by existing readers; the insert
trigger hashes rows the old writer omits; collaborator `role` defaults to
`editor`; the `api_keys` check remains a superset of the old roles. New app
code will fail closed without the migration (`purge_audit_logs`, auditor
policies, hash columns on verify/export).

---

## Local rehearsal (not prod)

Requires local PostgreSQL (`psql`, `pg_dump`, superuser to `createdb`). From
repo root:

```bash
./scripts/ops/audit-migration/test-local.sh
```

That runs preflight → backup table → `pg_dump` → migrate → postflight
(`mismatch_count = 0`, counts/checksums equal) → rollback → preflight
matching the original checksum. Expected: `PASS: rollback preflight matches
original checksum_original=… count=1000`.
