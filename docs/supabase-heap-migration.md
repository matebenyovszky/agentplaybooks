# AgentPlaybooks heap migration runbook

Status: preparation only, 2026-10-10. Production remains on project
`bydcjwxfiiolmnddzbpy` in Frankfurt. No production schema, data or application
configuration has been changed by this preparation.

## Support and evidence

A dashboard support request was confirmed sent on 2026-10-10 to the project
owner email. A follow-up email to support@supabase.com included the sanitized
reproduction as a text attachment and the possible prior ticket `SU-484862`.
The prior ticket and any reply have not been verified in the owner mailbox.
The email follow-up received an automated receipt assigning **SU-501809**.
No human response has been observed in the connected mailbox.

The failure occurs when Auth assigns a user to an OAuth authorization whose
nullable UNIQUE authorization_code column is NULL. OrioleDB raises SQLSTATE
22000 (invalid Datum pointer); the same temporary table using heap succeeds.
Upstream issue: https://github.com/orioledb/orioledb/issues/639
Fix: https://github.com/orioledb/orioledb/pull/652
The current postgres role cannot change the managed table's access method.

Prefer support applying the fixed build or converting the managed table when
they can provide a supported remedy promptly; retest the complete OAuth flow.
Do not remove constraints, change ownership, or bypass managed-role protections.

## Current blockers

1. The repository secret `SUPABASE_DB_URL` contains the HTTPS API endpoint,
   not a PostgreSQL connection string. Source validation stopped the backup
   before any database connection. It must be replaced with the source project's
   actual **Session pooler** connection string, using the existing DB password.
   Do not put the password into an issue, commit, PR, log, or chat message.
2. The user created `Agentplaybooks_heap_migration`, ref
   `zcphxfospbvqplonkvco`, in the existing Free org. It is Healthy and runs
   PostgreSQL 17.11 with default access method heap. The region is eu-west-1
   (Ireland), whereas the source is eu-central-1 (Frankfurt); consider this
   region change before cutover. Automatic table exposure was disabled on the
   prepared form. The rollback-only nullable UNIQUE probe returned
   `updated_rows=1`, `user_assignment_ok=true`, `default_access_method=heap`.
   The target is still empty; no application restore or cutover occurred.
3. Access to the owner mailbox is still needed to establish whether support has
   already responded. If there is a supported in-place remedy, reassess the
   full-project migration before production cutover.

The source Connect panel verified the Session pooler host as
`aws-1-eu-central-1.pooler.supabase.com:5432` and login as
`postgres.bydcjwxfiiolmnddzbpy`. Its password is still unavailable. The local
backup directory has a URL template and a private, empty password input file;
these are not working credentials. Do not update the GitHub secret from the
template. Percent-encode the supplied password when assembling the URL.

## Backup and rehearsal

An additional local API export saved 20 exposed tables / 44,011 rows on
2026-10-10. Storage returned zero buckets. The Auth admin export returned HTTP
500. This is a **partial, non-snapshot export**, not a database backup: it lacks
password hashes, managed Auth/OAuth state, database DDL and access controls, and
pagination was not protected from concurrent writes. It must not authorize a
cutover. Its encrypted CMS archive is retained locally in the backup directory;
decryption and per-file SHA-256 checks passed. Temporary plaintext copies were
removed after verification. No production data was changed.

The branch-only workflow `supabase-migration-backup.yml` is read-only and
validates the source endpoint. It obtains a single-snapshot custom pg_dump
archive, role definitions without login passwords, and an inventory of table
counts, owners, access methods, grants, RLS, indexes, triggers and publications.
`--no-table-access-method` permits restoring application tables as heap.
The workflow does not restore or modify a database. It must succeed before
using any result as a backup. SQL and role dumps remain inside an AES-256-GCM
CMS envelope in the uploaded artifact, retained for three days.

The recipient certificate is public; its private key is stored locally under
`~/.codex/backups/agentplaybooks/2026-10-10/backup-private.pem` with private
filesystem permissions. Keep a recoverable secure copy of that key and download
the artifact before expiry. Test decryption, unpacking and SHA256SUMS; then
inspect the archive list and rehearse an actual restore on the fresh target.
The encryption round trip has been tested; a database backup and database
restore have **not** succeeded yet.

Before restoring, classify the archive. Preserve target-managed schemas and
roles; do not blindly restore platform DDL or source platform migration tables.
Restore application schema, grants, RLS, functions and custom managed-schema
triggers/policies according to the Supabase CLI migration guide. Compare Auth
and Storage schema versions and data columns before importing their data.
Use a reviewed, transaction-based restore that stops on the first error.
Exclude source platform migration history from the target's managed migrations;
preserve the application's `supabase_migrations` history separately.

Preserve user IDs, password hashes, identities and references. Do not recreate
users through the admin API: that loses password hashes and relationships.
Inventory encrypted Auth fields, MFA and OAuth client secrets; determine the
supported encryption-key migration before copying them. If Supabase Vault or
column encryption is present, follow the official encryption-root-key steps.
Preserve the application's Cloudflare `SECRETS_ENCRYPTION_KEY`, user UUIDs,
playbook IDs and secret names, which participate in its AES-GCM encryption.
Verify existing encrypted application secrets can be decrypted in rehearsal.

Inventory and copy actual Storage objects separately from DB metadata (the
dashboard currently rounds usage to 0; this is not proof there are no files).
Preserve bucket access rules. Review Edge Functions, their secrets, Auth
providers/SMTP, redirect URLs, OAuth server settings, webhooks, schedules and
Realtime publications; those are not all carried by a SQL dump.

## Verification gates

- Confirm every restored application and OAuth table uses heap.
- Compare exact row counts and deterministic data digests for imported tables;
  verify foreign keys, sequences, grants, RLS, functions and triggers.
- Retest the nullable-UNIQUE update reproduction and real OAuth authorize,
  consent, code exchange, refresh and revocation with the registered client.
- Verify existing-account login, logout, recovery, provider callback and MFA
  where configured; explicitly test separation between two users.
- Verify public playbook reads, private access denial, API-key hashes and
  permissions, MCP initialize/tools/list/tool calls, memory and canvas writes,
  and application-secret decryption. Use disposable rehearsal data.
- Run the repository production schema verification and security advisors.
- Check URLs and rebuild-time public environment values. Update the production
  project reference guard in `scripts/prepare-supabase-deploy.mjs` before the
  first schema deployment against the new production project.

## Cutover and rollback

Only cut over after all gates pass. Build and test the target configuration
before the maintenance window. Record the exact previous deployment and all
source environment settings securely. Expect users to sign in again when JWT
signing keys and project-scoped browser storage change; do not promise preserved
sessions without proving it in rehearsal. Review registered provider callback
URLs and external clients that refer directly to the source project.

During the window, prevent **all** writers, including Auth registration/login,
direct Supabase clients, Storage, jobs and Edge Functions. A Cloudflare UI
maintenance page alone does not freeze the underlying database. Establish and
test a supported write-freeze mechanism before starting the final snapshot.
Take the final snapshot and object sync, restore, then repeat data and access
checks. Switch the app's Supabase URL, publishable/service keys and build-time
variables together; keep its application encryption master key unchanged.
Perform live smoke tests while writes remain blocked; reopen writes only after
passing them. Preserve the source project and backup.

Before reopening writes, rollback is returning to the recorded deployment and
source configuration. After reopening writes on the target, rolling back would
lose new data unless the new writes are reconciled. Freeze again and reconcile
first; never run source and target as competing writable systems. Retain the
source until the verification/observation period is complete; deletion requires
a separate explicit request.

Reference: https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
