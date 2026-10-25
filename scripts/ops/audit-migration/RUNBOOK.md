# Audit logs compliance migration runbook

Operator copy-paste for **`supabase/migrations/20261024120000_audit_logs_compliance.sql`**.
Mate approved shipping it, conditional on this backup + verification + rollback.

**Do not run these commands against production from an agent session.** This
document is for a human with dashboard access. This agent has no prod access.

**Production database is the heap project `zcphxfospbvqplonkvco`** (PR #208,
merge `e5a70e64`). The retired project `bydcjwxfiiolmnddzbpy` is forbidden.
Every step below must abort if the connection string is not that heap project.

Apply the migration **manually on the heap project first**, record
`20261024120000` in `supabase_migrations.schema_migrations`, **then** merge
PR #202. See §11 for why: merging first would make the Deploy Supabase
workflow auto-apply this file to prod without this backup window.

The currently deployed app tolerates the new schema (additive columns, insert
trigger fills `prev_hash`/`hash`, `playbook_collaborators.role` defaults to
`editor`, `api_keys` check is a superset). The new app **requires** the
migration (hash columns, `purge_audit_logs`, auditor RLS). Do not merge/deploy
first.

Pause audit-producing application writes until postflight and version recording finish. The migration also holds an exclusive writer lock inside one transaction while triggers are disabled; any error rolls back trigger and data changes together. Night-time traffic is not a substitute for a maintenance window.

The migration filename/timestamp is **`20261024120000`**. Do not rename it.
#208's staging cutoff is `20260919075416`; its only version alias is
`20261002120000` → `20261009220418` (`review_proposals`). `20261024120000` is
later than both, is not aliased, and is copied into the deploy workdir as a
normal forward file. Changing the timestamp would either hide it from
`prepare-supabase-deploy.mjs` or collide with history; leave it.

---

## 0. Prerequisites

From the **repo root**, check out **one git SHA** and use only the files at
that SHA. Do not mix with another checkout. Older pins **`4b1f34f`**,
**`d54be78`**, and **`c20b1da`** are stale: they do not contain the chain-tip
trigger in `20261024120000_audit_logs_compliance.sql`.

```bash
cd "$(git rev-parse --show-toplevel)"
git fetch origin
# SHA from the pinned blob URL on PR #202 (not 4b1f34f, d54be78, or c20b1da)
PINNED_SHA=   # paste
git checkout --detach "$PINNED_SHA"
test "$(git rev-parse HEAD)" = "$PINNED_SHA"
ls scripts/ops/audit-migration/preflight.sql \
   scripts/ops/audit-migration/check-project.sh \
   supabase/migrations/20261024120000_audit_logs_compliance.sql
```

Copy `PINNED_SHA` onto the record sheet. The runbook at that commit is:

`https://github.com/matebenyovszky/agentplaybooks/blob/<PINNED_SHA>/scripts/ops/audit-migration/RUNBOOK.md`

**psql / pg_dump** major version must be **≥ the server's Postgres major**.
Optional: Supabase CLI (`supabase --version`) — not required; this runbook uses
`psql` and `pg_dump` only. Recording the version is a SQL `INSERT` into
`supabase_migrations.schema_migrations`, not `supabase db push`.

```bash
psql --version
pg_dump --version
```

### Connection string (heap project `zcphxfospbvqplonkvco` only)

1. Open the heap project:
   [https://supabase.com/dashboard/project/zcphxfospbvqplonkvco](https://supabase.com/dashboard/project/zcphxfospbvqplonkvco)
2. **Connect** (top bar) **or** **Project Settings → Database**.
3. Copy the **URI** connection string.
4. Use **Direct connection** (`db.zcphxfospbvqplonkvco.supabase.co` port **5432**)
   or **Session pooler** (`*.pooler.supabase.com` port **5432**, user
   `postgres.zcphxfospbvqplonkvco`).
5. **Do not** use the **Transaction pooler** (port **6543**) for `pg_dump` or
   this backfill.
6. The same project is what GitHub Actions secret `SUPABASE_DB_URL` must
   already point at (Deploy Supabase, PR #208). Copy from the dashboard, not
   from the repo. Do not commit the URI.

Set it without printing the secret. `read -s` keeps it out of shell history
better than a literal `export` on the command line:

```bash
# paste the URI, press Enter; nothing is echoed
IFS= read -r -s PROD_DB_URL
export PROD_DB_URL
echo "PROD_DB_URL is set (${#PROD_DB_URL} chars)"

# MUST pass. Aborts on the retired project, localhost, or a non-heap URL.
chmod +x scripts/ops/audit-migration/check-project.sh
./scripts/ops/audit-migration/check-project.sh

# confirm server major (safe; prints version only)
psql "$PROD_DB_URL" -c "SHOW server_version;"
```

**Expected from `check-project.sh`:**

```
GO: target is heap project zcphxfospbvqplonkvco (direct, host=db.zcphxfospbvqplonkvco.supabase.co, port=5432)
```

or `(session-pooler, host=….pooler.supabase.com, port=5432)`.

**NO-GO examples (do not continue):**

```
NO-GO: connection string identifies retired project bydcjwxfiiolmnddzbpy. Production is heap project zcphxfospbvqplonkvco.
NO-GO: transaction pooler (port 6543) is forbidden …
NO-GO: PROD_DB_URL does not identify heap project zcphxfospbvqplonkvco …
```

Client major ≥ that server major. Do not `echo "$PROD_DB_URL"`, do not `set -x`.
Re-run `check-project.sh` if you change `PROD_DB_URL`. The SQL scripts also
abort if the session identity contains the retired project ref.

Estimate duration from live row count (formula in §9):

```bash
./scripts/ops/audit-migration/check-project.sh
psql "$PROD_DB_URL" -c "SELECT count(*) AS n FROM public.audit_logs;"
```

---

## 1. Preflight (read-only)

```bash
./scripts/ops/audit-migration/check-project.sh
psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 -f scripts/ops/audit-migration/preflight.sql
```

**Expected** (values differ per database; this is one local 1000-row fixture run):

```
NOTICE:  Target production project is zcphxfospbvqplonkvco. ...
=== audit_logs preflight summary ===
 row_count |     min_created_at     |     max_created_at     |           checksum_ids           |        checksum_original
-----------+------------------------+------------------------+----------------------------------+----------------------------------
      1000 | 2026-01-01 00:01:00+00 | 2026-01-01 16:40:00+00 | (32 hex chars)                    | (32 hex chars)

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
./scripts/ops/audit-migration/check-project.sh
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
./scripts/ops/audit-migration/check-project.sh
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

The postflight joins the computed reachable chain once to the audit table. A
correlated scan of the recursive result for every row becomes quadratic on a
large production chain. The recursive `UNION` also stops revisiting a corrupt
cycle; hash recomputation and unreachable-row checks remain mandatory.

All of the following must be true. **Any miss is NO-GO — do not migrate.**

| Check | Pass |
| --- | --- |
| `check-project.sh` printed GO for `zcphxfospbvqplonkvco` | GO |
| Backup table row count == live `audit_logs` count | `counts_equal = t` |
| That count == preflight `row_count` | equal |
| Dump file non-empty | `test -s "$DUMP_FILE"` exited 0 |
| sha256 recorded | `${DUMP_FILE}.sha256` exists and is 64 hex chars |

```bash
./scripts/ops/audit-migration/check-project.sh
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

Only after a GO in §4. This is `psql -f` of the SQL file. It does **not**
insert `supabase_migrations.schema_migrations`. That is a separate required
step after postflight GO (§7b).

```bash
./scripts/ops/audit-migration/check-project.sh
psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261024120000_audit_logs_compliance.sql
```

**Expected:** ends with `CREATE POLICY` / `ALTER TABLE` (auditor policy +
`api_keys` check). First-time apply prints several `does not exist, skipping`
NOTICEs for `DROP … IF EXISTS` — that is normal. **Pass:** exit code 0.
Any ERROR is NO-GO → rollback (§8).

Do **not** run `supabase db push` for this step. `db push` is what the Deploy
Supabase workflow will do on merge; it must see the version as already
applied (after §7b), not apply it for the first time.

---

## 6. Postflight

```bash
./scripts/ops/audit-migration/check-project.sh
psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 -f scripts/ops/audit-migration/postflight.sql
```

**Expected** (checksums must equal preflight; mismatches must be 0):

```
=== audit_logs postflight summary (original columns) ===
 row_count | ... | checksum_ids | checksum_original
      1000 | ... | (same as preflight) | (same as preflight)

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
It walks **`prev_hash` pointers** from genesis / latest checkpoint (not
`ORDER BY created_at, id`). Several inserts in one transaction share `now()`,
and UUID `id` is not insertion order; timestamp order would report false
breaks. Backfill of existing rows still uses `created_at, id` (those rows
already have distinct timestamps). Rollback removes the added hash objects and preserves all original columns and all live rows, including events written after the backup.

---

## 7. GO / NO-GO after applying the migration

| Check | Pass |
| --- | --- |
| Row count unchanged | postflight `row_count` == preflight |
| Checksum over original columns unchanged | `checksum_original` equal |
| Id checksum unchanged | `checksum_ids` equal |
| Hash-chain mismatches | `0` |
| First broken id | NULL |

**NO-GO:** any mismatch or a migration ERROR → rollback (§8). Do not merge.
Do not record the version.

**GO:** continue to §7b (record the version), **then** merge PR #202.

### 7b. Record `schema_migrations` (required before merge)

`psql -f` of the migration file does **not** write
`supabase_migrations.schema_migrations`. The Deploy Supabase workflow on
push to `main` runs `scripts/prepare-supabase-deploy.mjs` then
`supabase db push --db-url "$SUPABASE_DB_URL"`. That CLI applies every
forward file whose version is **not** already in `schema_migrations`.

`20261024120000` is after the #208 cutoff `20260919075416` and is **not** in
the alias map, so the workdir **will** include
`20261024120000_audit_logs_compliance.sql`. If the row is missing, `db push`
executes the file again on prod.

```bash
./scripts/ops/audit-migration/check-project.sh
psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 -f scripts/ops/audit-migration/record-version.sql
```

**Expected:**

```
NOTICE:  recorded supabase_migrations.schema_migrations version 20261024120000
    version
---------------
 20261024120000
```

**Pass:** one row `20261024120000`. The INSERT is `ON CONFLICT DO NOTHING`
(idempotent). Rollback (§8) deletes this row so a rolled-back database is
not treated as already migrated.

After this row exists, merge of #202 makes Deploy Supabase see the version
as **already applied**. `db push --dry-run` / `db push` skip that file
(no second backfill). Other pending forward files (if any) still apply.
`scripts/verify-production-schema.sql` then runs; it does not currently
assert the audit columns.

---

## 8. Rollback

**Trigger:** any NO-GO, a migration error, or app errors after deploy (before
or immediately after merge). Exact commands:

```bash
./scripts/ops/audit-migration/check-project.sh
psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 -f scripts/ops/audit-migration/rollback.sql
psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 -f scripts/ops/audit-migration/preflight.sql
```

**Expected after rollback:**

```
NOTICE:  removed schema_migrations version 20261024120000
 checkpoints_dropped | hash_column_dropped | canonical_dropped | trigger_dropped | collaborator_role_dropped | live_row_count | backup_row_count | schema_migrations_row
 t                   | t                   | t                 | t               | t                         |           1000 |             1000 |                     0
```

Rollback preserves all live rows. With writes paused, preflight checksums and counts match the original. If new events arrived, their rows remain: compare original fields for IDs in the private backup, and record the additional event count. Never replace the live audit table with the older copy. Rollback is idempotent.

The backup table is kept with RLS enabled and API-role grants revoked. Drop it only after you are sure you will not roll
back again:

```bash
# optional, after a successful GO deploy, not part of rollback
# psql "$PROD_DB_URL" -c "DROP TABLE IF EXISTS public.audit_logs_backup_20261025;"
```

---

## 9. Duration

Local rehearsal (PostgreSQL 16 on this VM, fixture in
`fixture-pre-migration.sql`), including three sequential INSERTs in one
transaction after migrate (postflight still 0 mismatches; rollback preserves
them):

| Step | N = 1,000 |
| --- | ---: |
| Preflight | 0.035 s |
| In-DB backup table | 0.037 s |
| `pg_dump` | 0.065 s |
| Apply migration (backfill) | 0.079 s |
| Postflight | 0.110 s |
| Rollback | 0.055 s |
| **Total (no operator think-time)** | **0.381 s** |

The backfill is one server-side `DO` loop (not one round-trip per row).
Postflight walks `prev_hash` pointers (recursive CTE), not `created_at, id`.

**Formula** (local), with `N` = `count(*)` from `audit_logs`:

```
T_migrate  ≈ 0.05s + 0.029s × (N / 1000)
T_post     ≈ 0.04s + 0.070s × (N / 1000)
T_total    ≈ 0.22s + 0.160s × (N / 1000)
```

Hosted I/O / WAL: multiply by **3–5×**, then add a couple of minutes of
operator copy-paste.

| N | Local total | Prod estimate |
| ---: | ---: | --- |
| 1,000 | 0.4 s | ~1 min elapsed (operator) |
| 10,000 | ~2 s | ~1–2 min |
| 100,000 | ~16 s | ~2–5 min |
| 1,000,000 | ~3 min | ~8–15 min |

Writes to `audit_logs` must remain paused through postflight and version recording.

---

## 10. Record sheet

Fill this in as you go. Do not paste `PROD_DB_URL`.

| Field | Value |
| --- | --- |
| Operator | |
| Date (UTC) | |
| Git SHA of this runbook (must match `git rev-parse HEAD`) | |
| Production project | `zcphxfospbvqplonkvco` (heap) |
| `check-project.sh` | GO / NO-GO |
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
| `schema_migrations` has `20261024120000`? | |
| Rollback run? (yes/no) | |
| Rollback preflight checksum | |
| PR #202 merged after GO + recorded version? | |

---

## 11. Order vs merge / Deploy Supabase

**Would merging #202 to `main` auto-apply this migration to prod?**

**Yes, unless `schema_migrations` already contains `20261024120000`.**

The [Deploy Supabase workflow](../../../.github/workflows/deploy-supabase.yml)
runs on push to `main` when `supabase/migrations/**` (or the prepare script,
baseline, verify SQL, or the workflow file) changes. It:

1. Checks out the merge commit.
2. Requires GitHub Actions secret `SUPABASE_DB_URL`.
3. Runs `npm ci`, `prebuild`, `test:all`.
4. Runs `node scripts/prepare-supabase-deploy.mjs`, which:
   - Aborts unless `SUPABASE_DB_URL` is the heap project `zcphxfospbvqplonkvco`
     (direct `db.zcphxfospbvqplonkvco.supabase.co` or pooler user
     `postgres.zcphxfospbvqplonkvco`).
   - Stages no-op placeholders for baseline versions through `20260919075416`.
   - Copies forward files newer than that cutoff. The `review_proposals` file
     `20261002120000` is copied as `20261009220418` (already on prod).
     **`20261024120000_audit_logs_compliance.sql` is copied as-is** — it is
     not aliased and is after the cutoff.
5. `supabase db push --db-url "$SUPABASE_DB_URL" --dry-run`
6. `supabase db push --db-url "$SUPABASE_DB_URL"` (`--yes`)
7. `psql … -f scripts/verify-production-schema.sql`

`supabase db push` applies a staged file only when its version is **absent**
from `supabase_migrations.schema_migrations`. Manual `psql -f` never inserts
that row. So:

| Prod state at merge | What the workflow does |
| --- | --- |
| Manual runbook done **and** §7b recorded `20261024120000` | `db push` sees that version already applied; it does **not** re-execute the SQL. Dry-run / apply report up to date for this file (other pending versions, if any, still run). No second backfill, no conflict with the existing unique `(playbook_id, prev_hash)` index or the deny-UPDATE trigger. |
| Manual `psql -f` done **without** recording the version | Deployment fails at the staged manual-migration guard. Complete postflight and record the version before retrying. |
| Merge **without** the manual runbook | Deployment fails before this migration's DDL. The source has `-- @manual-production-migration`; staging replaces it with a same-version exception guard. Do not merge early: application deployment also depends on the completed schema. |

Required order:

1. This runbook on heap project `zcphxfospbvqplonkvco` (preflight → backup →
   dump → migrate → postflight GO).
2. Record `20261024120000` in `schema_migrations` (§7b).
3. **Then** merge PR #202. Deploy Supabase runs, sees the version, skips the
   file, verify-schema continues.
4. Deploy the new app.

Do **not** reverse that order. Old app code tolerates the new schema in
between: new columns are nullable and ignored by existing readers; the insert
trigger hashes rows the old writer omits; collaborator `role` defaults to
`editor`; the `api_keys` check remains a superset of the old roles. New app
code will fail closed without the migration (`purge_audit_logs`, auditor
policies, hash columns on verify/export).

If you roll back after recording the version, `rollback.sql` deletes
`20261024120000` from `schema_migrations` so a later merge cannot skip a
reverted database.

---

## Local rehearsal (not prod)

Requires local PostgreSQL (`psql`, `pg_dump`, superuser to `createdb`). From
repo root:

```bash
./scripts/ops/audit-migration/test-local.sh
```

That runs:

- offline URI checks (`check-project.sh` accepts heap `zcphxfospbvqplonkvco`,
  aborts retired `bydcjwxfiiolmnddzbpy` / localhost / port 6543)
- preflight → backup table → `pg_dump` → migrate → postflight
  (`mismatch_count = 0`, counts/checksums equal)
- record `schema_migrations` version `20261024120000`
- re-apply the migration SQL (idempotent; backfill skips hashed rows)
- three sequential INSERTs in one transaction (shared `now()`); postflight
  still `mismatch_count = 0`
- rollback (unrecords the version; extra rows preserved)
  → original backup rows unchanged and all later events retained
- second rollback (idempotent)

Expected: `PASS: local rehearsal complete` with
`PASS: rollback retains new events and matches original checksum_original=… count=1003`.


## Audit corrections (2026-10-25)

The backup is private even when Supabase inherits public-table API grants. Auditor membership is checked through a fixed-search-path, authenticated-only helper in the unexposed audit_private schema; the full playbooks row is not exposed to auditors. Retention walks a true chain prefix and orders checkpoints by an identity sequence, including same-timestamp transactions. Apply/backfill is transactional under a writer lock. Rollback keeps subsequent audit events. Re-run the expanded migration tests and local rehearsal before production use; historical timing figures above predate these corrections.
