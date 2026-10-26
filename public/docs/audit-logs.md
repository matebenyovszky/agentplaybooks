# Audit logs (export, retention, tamper evidence)

The `audit_logs` table is the playbook audit trail: federated MCP calls and
vault operations (`secret.*`) in one place, read at
`GET /api/playbooks/:guid/audit`. A row never holds a secret value, a full
outbound URL, or an API key.

This page covers the compliance controls for EU and self-hosted deployments:
export, optional SIEM forwarding, retention, the per-playbook hash chain, and
the read-only **auditor** role.

## Who can read the trail

| Caller | Audit read / export / verify | Secret values | Writes |
| --- | --- | --- | --- |
| Owner (session or user API key with `playbooks:read` or `audit:read`) | Yes | Yes (existing vault rules) | Yes |
| Auditor collaborator | Yes | No | No |
| Playbook API key with role `auditor` | Yes | No | No |
| Editor collaborator (session) | No | Yes | Content and secrets; key metadata only |
| Viewer/coworker/admin playbook keys | No | Per existing permissions and reveal policy | Per existing permissions |

A playbook API key that performs vault operations still cannot read the record
of them. Invite an auditor from **Sharing**, or mint a playbook key with the
Auditor role (`audit:read` + `playbooks:read` only).

## Export

```http
GET /api/playbooks/:guid/audit?format=jsonl&since=2026-01-01T00:00:00.000Z&until=2026-12-31T23:59:59.000Z&actor=apb_live_abcd&action=secret.
GET /api/playbooks/:guid/audit/export?format=csv
Authorization: Bearer <jwt_or_user_api_key_or_auditor_playbook_key>
```

`format` is `json` (default on `/audit`), `jsonl` (default on `/export`), or
`csv`. Filters: `action` (alias of `operation`), `actor` (`actor_id`),
`actor_type`, `since`, `until`, `secret`, `limit`.

CLI (user API key from `apb login` or `AGENTPLAYBOOKS_API_KEY`):

```bash
apb audit export <guid> --format=jsonl --since=2026-01-01T00:00:00Z --action=secret.
apb audit export --format=csv > trail.csv   # every playbook this key may audit
apb audit verify <guid>
```

## Hash chain

Each row stores `prev_hash` and `hash = sha256(canonical JSON of the row
including prev_hash)`. The first row of a playbook chains from 64 zero hex
digits. `GET /api/playbooks/:guid/audit/verify` and `apb audit verify` recompute
the chain in order and report the first broken link (`prev_hash` or `hash`).

A production database needs migration `20261024120000_audit_logs_compliance.sql`
to add the columns and backfill existing rows. Do not apply it without approval
and a backup. Operator steps (preflight, `pg_dump`, in-DB copy, postflight
hash-chain check, rollback) are in
[`scripts/ops/audit-migration/RUNBOOK.md`](https://github.com/matebenyovszky/agentplaybooks/blob/cursor/audit-logs-compliance-adfd/scripts/ops/audit-migration/RUNBOOK.md).
Apply that migration **before** merging the app change; the previously deployed
app tolerates the additive schema.

## Retention

Unset `AUDIT_RETENTION_DAYS` (or `0` / `forever`) keeps the current behaviour:
logs are kept until the playbook or account is deleted.

Set a positive integer to enable scheduled purge. The purge deletes rows older
than the cutoff, writes an `audit_chain_checkpoints` row with the last purged
hash so the remaining chain still verifies, then inserts
`audit.retention_purge` as a new chain entry.

```bash
# systemd / cron on a self-hosted instance
curl -X POST -H "Authorization: Bearer $AUDIT_CRON_SECRET" \
  https://your-instance/api/cron/audit-purge
```

Owners can also purge one playbook explicitly:

```bash
apb audit purge <guid> --days=365 --yes
```

## Optional forwarding (off by default)

After a successful insert, the API may forward the event without blocking the
caller. Failures retry with backoff and are logged; an unreachable SIEM does
not fail the vault or federated call.

| Variable | Default | Purpose |
| --- | --- | --- |
| `AUDIT_SYSLOG_URL` | unset (off) | `udp://host:514`, `tcp://host:514`, or `tls://host:6514` (RFC 5424) |
| `AUDIT_SYSLOG_HOSTNAME` | `agentplaybooks` | RFC 5424 HOSTNAME |
| `AUDIT_SIEM_WEBHOOK_URL` | unset (off) | HTTPS POST of the export JSON object |
| `AUDIT_SIEM_WEBHOOK_SECRET` | unset | HMAC-SHA256 key for the body. High-entropy random, **≥32 bytes** (`openssl rand -base64 32`), not a human password. Required when the webhook URL is set; a shorter value fails closed. |
| `AUDIT_SIEM_HMAC_HEADER` | `X-Audit-Signature` | Header carrying `sha256=<hex>` |
| `AUDIT_RETENTION_DAYS` | unset (keep forever) | Positive integer for scheduled purge |
| `AUDIT_CRON_SECRET` | unset (endpoint hidden) | Bearer token for `POST /api/cron/audit-purge` (`CRON_SECRET` is also accepted) |

Syslog uses Node sockets (self-hosted Node). The HTTPS webhook works on
Cloudflare Workers as well. Forwarding is best-effort; pull export if you need
a guaranteed copy.

Writing the row itself is best-effort too — an audit outage must not take the
vault down — with one exception: a successful `secret.reveal`. The secrets
reveal endpoint and the runtime loader (`/secrets/resolve`) release plaintext
only after its audit row is written, and answer `503` otherwise.
