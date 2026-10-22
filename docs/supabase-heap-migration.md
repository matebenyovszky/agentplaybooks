# AgentPlaybooks heap migration runbook

Status: verified rehearsal completed on 2026-10-22. **Production still uses
`bydcjwxfiiolmnddzbpy` (Frankfurt, PostgreSQL 17.6 / OrioleDB 1.5).**
The restored target is `zcphxfospbvqplonkvco` (Ireland, PostgreSQL 17.11 / heap).
Do not merge this draft or activate the target until the remaining cutover gates
below have passed. No source application data was changed during rehearsal.

## Verified results

- Source and target Session-pooler connections work with `sslmode=verify-full`
  and Supabase's published CA. Credentials are stored privately outside Git.
- A full custom-format source database dump and password-free role inventory
  were captured. An exported repeatable-read snapshot was shared by `pg_dump`
  and the row-count/deterministic-digest inventory. AES-256-GCM CMS encryption,
  decryption and every archived file's SHA-256 checksum were verified.
- The target restore succeeded atomically. All 51 imported table counts and
  sorted JSONB COPY digests matched the snapshot, including application
  migration history. All application/Auth/Storage tables use heap.
- All 59 foreign keys were checked for orphaned references. Two existing users
  could read their own private playbook but not the other's; anonymous users
  could read neither. Exposed tables have RLS.
- OAuth server and dynamic client registration are enabled on the target,
  with the source site URL, redirect allowlist and `/oauth/consent` path.
  Actual dynamic registration, authorize, user assignment, consent, PKCE code
  exchange, userinfo, refresh, revoke, and rejected revoked refresh all passed.
  This includes the original nullable-UNIQUE update that fails on OrioleDB.
- MCP account discovery returned 50 tools. Disposable-account tests passed for
  playbooks, skills, memory, runs, canvas and secret storage, with bearer-token
  and API-key authentication.
- A target Worker build passed. A version override at **0% ordinary traffic**
  verified OAuth discovery, login/explore pages and authenticated MCP against
  the target. All 28 original application ciphertexts decrypted with the
  **unchanged production `SECRETS_ENCRYPTION_KEY`**. Only aggregate pass/fail
  counts left the Worker; plaintext secrets were neither returned nor logged.
- The temporary 0% version was removed using the supported Wrangler rollback
  flow. The original Worker remains at 100%. Public workers.dev and version
  URLs remain disabled. The final candidate was uploaded, not activated.
- The write-freeze rehearsal on the target denied both a Data API write (503)
  and Auth login (500), while a new administrator connection was read-only.
  Original CONNECT privileges/defaults were then restored.
- The final data-replacement procedure was also rehearsed: 50 application,
  Auth and Storage tables matched the original snapshot exactly; the three
  forward migrations and their history were preserved. Disposable test data
  was removed by this replacement. FK and RLS verification passed again.
- Application tests: 726 passed. CLI tests: 222 passed after building their
  bundled Hermes assets, using Node 24 and a normal terminal setting. The
  local execution tool's `TERM=dumb` disables readline editing and explains
  the initial CLI prompt-test failure; no prompt implementation was changed.

Private artifacts are under `~/.codex/backups/agentplaybooks/2026-10-22/`.
The encrypted snapshot is `source-snapshot-043855Z.cms`; SHA-256:
`eab9f757f897e64d7557eec98928cd369af6c23e8e1c74c2200075ba082423e2`.
The recipient private key remains outside Git, under the private 2026-10-10
backup directory. Retain an independently recoverable secure copy.

## Restore boundaries and schema reconciliation

Preserve target-managed schemas, roles and platform migration histories.
The reviewed restore includes application DDL/data/ACLs, application migration
history, Auth data, Storage metadata and the custom `auth.users` signup trigger.
It excludes managed platform DDL, `auth.schema_migrations`, `storage.migrations`,
Vault data and the empty managed vector-storage tables. Do not bypass ownership
or change managed Auth table access methods directly.

Use `pg_restore --no-owner --no-table-access-method`; the latter is required at
restore time too. Strip exactly the two source-only
`WITH (index_bridging='true')` table options from application pre-data. Import
with `session_replication_role=replica` in one transaction with
`ON_ERROR_STOP=1`, then check foreign keys explicitly. Retain IDs, password
hashes, ciphertexts and encryption-context IDs.

Source Vault, MFA factors, custom OAuth-provider records, SSO/SAML, WebAuthn,
SCIM, Storage buckets/objects, deployed Edge Functions and Realtime
publications were empty. Recheck these during the final snapshot. Do not assume
zero dashboard-rounded Storage usage proves absence of objects.

The source has 38 actual application migration records, ending at
`20261009220418` (`review_proposals`). That SQL matches the repository's older
`20261002120000_review_proposals.sql`; do not apply it twice. The deployment
baseline now records the actual 38 historical versions. The target additionally
has these three reviewed migrations, applied and recorded with their real SQL:

- `20261010081252_secret_clients.sql`
- `20261010115900_playbook_delete_trigger.sql`
- `20261010120000_delete_account.sql`

The target's default table privileges were restricted, and unwanted target
`anon`/`authenticated` grants on `memory_entries`, `memory_history` and
`playbook_snapshots` were removed to match the source. The production schema
verification passes. Refreshing data must retain target forward DDL and its
41-record history; do not replace that history with the older source history.

The GitHub `SUPABASE_DB_URL` secret has been repaired to a verified source
PostgreSQL Session-pooler URL. It still deliberately points to the source.
The deployment project guard still identifies the source. **Do not merge the
baseline/workflow changes before coordinating the target secret and guard:**
merging early would apply forward migrations to the old production database.
Both CI and database deployment now build the CLI assets before running tests.

## Remaining cutover gates

1. GitHub, Google and LinkedIn OIDC configuration and existing credentials were
   copied to target Auth using a reviewed CLI config diff/push. Register
   `https://zcphxfospbvqplonkvco.supabase.co/auth/v1/callback` at each provider.
   GitHub and Google forms are prepared but not saved, awaiting browser-action
   confirmation. LinkedIn developer login is required. Preserve the old
   callback during the rollback period. Verify the provider round trips.
2. Cloudflare's connected production build still contains the source public
   URL/key and a source service-key build secret. Update build-time configuration
   together with runtime configuration at cutover; otherwise a subsequent
   build would reintroduce the source URL into browser JavaScript. The logged-in
   dashboard can access these settings; the Wrangler OAuth token cannot access
   the Builds API. Do not rotate the application encryption master key.
3. Coordinate concurrent repository/build activity, prepare the maintenance
   Worker and rollback commands, then take a **new** final frozen snapshot.
   The rehearsal snapshot is not current production data.
4. Complete the source-freeze, final refresh, checks, production activation,
   deployment-secret/project-guard update and post-cutover tests described below.

## Write freeze, final refresh and activation

A maintenance page or `default_transaction_read_only` alone is insufficient:
PostgREST can explicitly start read-write transactions, and existing connections
retain their old defaults. This was checked against the
[Supabase freeze guidance](https://supabase.com/kb/troubleshooting/putting-a-project-in-read-only-mode-or-freezing-writes-during-a-migration).

The tested database component is:

1. Keep an administrative recovery connection and a separate lock-holder.
   Save database CONNECT ACLs and the database's explicit read-only default.
   Acquire SHARE locks on the application/Auth/Storage tables with a bounded
   lock timeout. Abort and release everything if acquisition fails.
2. In the recovery connection, revoke only PUBLIC's CONNECT permission and
   set the database default to read-only. Preserve the explicit postgres and
   dashboard recovery access. Confirm Auth, PostgREST and Storage service roles
   no longer have CONNECT, including inherited grants.
3. Terminate only the known application service connections; do not terminate
   Supabase superuser/platform processes. Check remaining application writers,
   jobs and in-flight transactions. Verify new admin sessions are read-only and
   actual REST/Auth write attempts fail. An existing admin can explicitly
   override read-only; prevent concurrent operator or CI writes too.
4. Hold the source table locks while making the final consistent encrypted
   backup and refreshing target data. Target refresh truncates only the
   reviewed application/Auth/Storage data set in a single transaction,
   imports the matching source data and sequence state, and checks counts
   before commit. Preserve target platform and application migration history.
5. Compare deterministic digests for all 50 refreshed tables. Recheck RLS,
   FK integrity, heap access methods, schema contract, sequences and absent
   external data/jobs. Never activate a mismatching target.
6. Update Cloudflare build settings, runtime target keys, and build-time public
   settings together. Activate only the clean production candidate; keep the
   encryption master binding. Update GitHub's database URL and the project-ref
   guard to the heap project before merging/deploying database changes.
7. Verify live OAuth, public/private access, API keys, MCP reads/writes and
   encryption. Keep the source frozen until it is paused and rollback evidence
   has been retained. Do not run two writable copies.

The source-freeze procedure has been rehearsed on the target; it has **not**
been applied to production. Do not release the source lock-holder into a
writable old project during an interrupted cutover. Recovery must restore the
recorded CONNECT/default settings deliberately, using the retained administrator
connection or an explicit read-write transaction on a fresh postgres connection.

## Rollback and version records

Recorded original Worker version:
`7e31c92f-6c9d-44de-821a-f3af7a0b13d2`.
Prepared clean target candidate:
`ff0d52fe-f5f3-4b91-951d-85974580bfbf` (tag `heap-ready`, not activated).
The temporary diagnostic version `aa177655-9886-4eaf-a255-e5fb122aafa5` is a
rehearsal artifact; **never activate it for production traffic**.

Before target writes are opened, restore the recorded source permissions,
source build settings and original Worker. Use `wrangler rollback` rather than
an ordinary `versions deploy` when restoring a version whose service-key secret
has changed; the rollback command supports the explicit secret-change check.
The rollback was exercised after the 0% rehearsal. Keep logging enabled in
both the Worker config and remote script settings.

After target writes are opened, rollback requires freezing and reconciling new
writes first. Switching back without reconciliation loses data. Keep the old
project and verified encrypted backups. Project deletion requires a separate
explicit user request.

## Original fault and support

The source Auth user-assignment update fails with SQLSTATE 22000,
`invalid Datum pointer`, when a nullable UNIQUE OAuth authorization code is NULL.
The rollback-only heap reproduction and the real target OAuth flow succeed.
Upstream: [OrioleDB issue 639](https://github.com/orioledb/orioledb/issues/639),
[fix 652](https://github.com/orioledb/orioledb/pull/652).

The support follow-up received automated receipt **SU-501809**. **SU-484862**
was supplied as a possible earlier ticket. A human response has not been verified
in the project-owner mailbox; do not claim support has not replied.

Restore reference:
[Supabase backup/restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).
