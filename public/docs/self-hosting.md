# Self-Hosting Guide

Deploy AgentPlaybooks on your own infrastructure.

> ## Current limitations — read this first
>
> *Last verified: 2026-10-01.*
>
> **1. Start a new project from `supabase/schema.sql`, not from
> `supabase/migrations/`.** The migrations folder is incremental only — it has
> no `CREATE TABLE` for the core tables and never did, so applying it to an
> empty database fails on the first statement. `supabase/schema.sql` is a
> snapshot of the whole current schema and is all a new project needs; the
> migrations are the forward history from that snapshot onward.
>
> Databases initialized from a `schema.sql` older than October 2026 lack the
> memory history objects (`memory_entries`, `memory_history`, `memory_at`,
> `is_archived`), and memory search fails on them. Apply
> `20260911042912_memory_time_and_history.sql`, then
> `20260913173449_harden_public_functions.sql`, if
> `select to_regclass('public.memory_entries')` returns null.
>
> **2. "Self-hosted" means running your own Supabase, not just your own
> Postgres.** Every API route queries the Supabase Data API and authentication
> is Supabase Auth, so a bare PostgreSQL server is not enough. For an
> on-premise deployment, run the
> [self-hosted Supabase stack](https://supabase.com/docs/guides/self-hosting/docker)
> and point `NEXT_PUBLIC_SUPABASE_URL` at it. The application needs no changes.
>
> **3. A bare PostgreSQL container will not do.** `docker-compose.yml` used to
> ship one; it was removed because the application never queried it, and its
> init step fed Supabase migrations calling `auth.uid()` into a vanilla
> `postgres:16-alpine`, which errors out. Run the full Supabase stack instead.

## Prerequisites

- Node.js 20+
- A Supabase project (free tier works)
- Cloudflare account (free tier works)
- Git

## Option 1: Cloudflare Pages (Recommended)

The easiest way to self-host AgentPlaybooks.

### Step 1: Fork the Repository

Fork [github.com/matebenyovszky/agentplaybooks](https://github.com/matebenyovszky/agentplaybooks) to your account.

### Step 2: Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note your project URL and anon key from Settings > API
3. Initialize a new database from `supabase/schema.sql`. For an existing
   deployment, apply only migrations newer than its current schema. The
   portable-backup API requires
   `20260922213700_portable_playbook_snapshots.sql` before the new CLI is
   published or used for `push`:

```bash
# Fresh Supabase project: run supabase/schema.sql in the SQL editor.
# Existing project: apply the pending forward migration(s), then deploy the API.
```

### Step 3: Connect to Cloudflare Pages

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to **Workers & Pages**
3. Click **Create application** > **Pages** > **Connect to Git**
4. Select your forked repository
5. Configure build settings:

| Setting | Value |
|---------|-------|
| Framework preset | Next.js |
| Build command | `npm run build:worker` |
| Build output directory | `.open-next` |

6. Add environment variables:

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service role key |

7. Deploy!

### Step 4: Configure Auth Providers

In Supabase Dashboard > Authentication > Providers:

1. Enable Email/Password
2. (Optional) Configure Google, GitHub, LinkedIn (OIDC) or Microsoft (Azure) OAuth

Set redirect URLs to `https://your-domain.pages.dev/*`

The login page asks Supabase Auth which providers are enabled (`/auth/v1/settings`) and shows only those. An instance with only email login shows only the email form; one with only Microsoft shows only the Microsoft button. Turning off email login hides the email form, and turning off sign-ups hides the sign-up link.

#### Microsoft Entra ID (self-hosted Supabase)

Register a web application in Microsoft Entra ID with the redirect URI `https://<your-supabase-auth-host>/auth/v1/callback`, create a client secret, then set these on the Supabase Auth (GoTrue) container and restart it:

```bash
GOTRUE_EXTERNAL_AZURE_ENABLED=true
GOTRUE_EXTERNAL_AZURE_CLIENT_ID=<application (client) id>
GOTRUE_EXTERNAL_AZURE_SECRET=<client secret value>
GOTRUE_EXTERNAL_AZURE_URL=https://login.microsoftonline.com/<tenant id>
GOTRUE_EXTERNAL_AZURE_REDIRECT_URI=https://<your-supabase-auth-host>/auth/v1/callback
```

Setting the tenant in `GOTRUE_EXTERNAL_AZURE_URL` limits sign-in to your organisation. Entra ID requires an HTTPS redirect URI for anything but localhost, so the Supabase Auth endpoint needs a certificate. Add your app's URL to `GOTRUE_URI_ALLOW_LIST` so the login can return to it.

## Option 2: Docker

For running on your own servers.

### Microsoft SQL Server

SQL Server is **not supported**. An experimental Drizzle/SQL Server layer used
to live here. It was removed because only two functions ever queried through
it, so `DB_DIALECT=mssql` produced a split-brain deployment — the playbook list
read from SQL Server while everything else, including all authorization checks,
still read from Supabase — and it started without error.

The schemas, migration and Compose stack remain in git history; the last commit
before removal is `08cb203`, so `git checkout 08cb203 -- src/lib/db drizzle`
brings them back.

Supporting SQL Server properly means migrating every remaining Supabase Data
API call and replacing Supabase Auth, since GoTrue has no SQL Server
equivalent. If you need an on-premise database today, run the
[self-hosted Supabase stack](https://supabase.com/docs/guides/self-hosting/docker)
instead — the application works against it unchanged.

### docker-compose.yml and Dockerfile

Both live in the repository root; this guide does not duplicate them, so they
cannot drift out of date here.

`docker-compose.yml` runs the application only. It deliberately does **not**
ship a PostgreSQL service: the app talks to the Supabase Data API and Auth, not
to a database directly, so a bare Postgres container would not serve it. Point
`NEXT_PUBLIC_SUPABASE_URL` at either a hosted project or your own self-hosted
Supabase stack.

Note that `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are
build arguments as well as runtime variables — Next.js bakes them into the
client bundle. They must be the values the *browser* can reach, and changing
them requires a rebuild rather than a restart.

Set `NEXT_PUBLIC_APP_URL` to the instance's own origin (for example
`https://agents.example.org`) before building, for the same reason. Without it
the image advertises `https://agentplaybooks.ai` as the MCP OAuth resource in
`/.well-known/oauth-protected-resource`, and in generated links.

### Intranet instance without TLS

The Hermes memory provider and `apb memory setup` refuse plain HTTP except on
localhost, because the playbook key travels with every request. For an
internal test instance that has no certificate yet, opt in explicitly per
Hermes profile:

```bash
apb memory setup <guid> --target=hermes --url=http://agents.intranet:8007 --allow-insecure-http --apply
```

This records `"allow_insecure_http": true` in the profile's
`agentplaybooks/config.json`. Put the instance behind HTTPS before production
use.

### Client-certificate (mTLS) secret loading

API keys work against the Node/Docker origin unchanged. Certificate clients do
not: the origin only trusts Cloudflare's TLS context by default, so mTLS fails
closed until a terminator verifies client certs and `MTLS_MODE=proxy` is set.

The [self-hosted mTLS guide](./self-hosted-mtls.md) covers nginx, Caddy, and
Traefik, a `deploy/self-host/docker-compose.mtls.yml` example, and openssl
commands for a test CA. Hungarian: [Önhosztolt mTLS](./self-hosted-mtls.hu.md).

### Run

```bash
docker compose up -d --build
```

## Option 3: Vercel

While optimized for Cloudflare, the app works on Vercel too.

1. Import your forked repo to Vercel
2. Set environment variables
3. Deploy

**Note:** Some Cloudflare-specific features won't work on Vercel.

## Database Migrations

### Initial Setup

Run `supabase/schema.sql` once on the empty database, in the Supabase SQL
editor or with `psql`:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f supabase/schema.sql
```

### Upgrades

Apply, in filename order, each file in `supabase/migrations/` that is newer than
the schema the database was built from. Do not run `supabase db push` against
an empty database: the incremental history cannot create the core tables.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon (public) key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (secret) |
| `NEXT_PUBLIC_APP_URL` | Yes for self-hosting | This instance's own origin. Baked in at build time; unset, OAuth metadata and generated links point at `https://agentplaybooks.ai`. |
| `SECRETS_ENCRYPTION_KEY` | Yes for the secrets vault | 64 hexadecimal characters. Rotating it makes existing secrets undecryptable — there is no re-encryption tooling yet. |
| `ALLOWED_ORIGINS` | No | Comma-separated origins allowed to make credentialed cross-origin API calls. Setting it **replaces** the default list, which is what a self-hosted instance wants — otherwise the project's own domains stay trusted. Unset keeps the previous behaviour. |
| `SECRETS_REQUIRE_ALLOWED_HOSTS` | No | `true` refuses outbound use of any secret that has not declared `allowed_hosts`. The bundled `docker-compose.yml` defaults it to `true`; the hosted service leaves it off. |
| `OUTBOUND_DNS_CHECK` | No | On by default in a Node process: before a credential is sent, the destination's name is resolved and refused if any address is internal. Set `false` only when egress is enforced at the network layer instead. |
| `AUDIT_RETENTION_DAYS` | No | Positive integer of days to keep `audit_logs`. Unset, `0`, or `forever` keeps every row. Deleting a playbook, server or account does not remove its trail. Requires a scheduler hitting `POST /api/cron/audit-purge`. |
| `AUDIT_CRON_SECRET` | No | Bearer token for the instance purge endpoint. Unset hides the endpoint. `CRON_SECRET` is also accepted. |
| `AUDIT_SYSLOG_URL` | No | Optional RFC 5424 forwarder: `udp://host:514`, `tcp://host:514`, or `tls://host:6514`. Off by default. |
| `AUDIT_SIEM_WEBHOOK_URL` | No | Optional HTTPS POST of each audit event. Off by default. Requires `AUDIT_SIEM_WEBHOOK_SECRET` (≥32 random bytes, not a password) for an HMAC `X-Audit-Signature` header. |
| `NO_EGRESS` | No | Set to `true` on an air-gapped instance to disable optional outbound calls (today: MCP registry search) unless `MCP_REGISTRY_URL` points at an internal mirror. Unset keeps the hosted default. |
| `MCP_REGISTRY_URL` | No | Override for `GET /api/mcp-registry/search`. Unset uses the official registry. Empty disables it. An internal URL is used even when `NO_EGRESS=true`. |
| `MTLS_MODE` | No | Secret-client certificate auth. Default `cloudflare` (hosted production). Set `proxy` behind a TLS terminator that verifies client certs; `off` disables certificate auth. Unknown values fail closed. See [Self-hosted mTLS](./self-hosted-mtls.md). |
| `MTLS_PROXY_FINGERPRINT_HEADER` | No | Required when `MTLS_MODE=proxy`. Header the terminator sets after verifying the client cert (hex SHA-256 or PEM). |
| `MTLS_PROXY_VERIFY_HEADER` | No | Required in proxy mode. That header must equal `SUCCESS` or mTLS is rejected. |
| `MTLS_TRUSTED_PROXIES` | No | Required when `MTLS_MODE=proxy`. Comma-separated IPs/CIDRs of the terminator. The authenticated X-APB-Proxy-Address must match; also requires MTLS_PROXY_SHARED_SECRET. |

Existing databases need `20261024120000_audit_logs_compliance.sql` (hash chain backfill, auditor role, retention checkpoints). That migration rewrites every `audit_logs` row and **must not be applied to production without approval and a backup**. Follow [`scripts/ops/audit-migration/RUNBOOK.md`](https://github.com/matebenyovszky/agentplaybooks/blob/main/scripts/ops/audit-migration/RUNBOOK.md). Apply it **before** merging/deploying the app change; the previously deployed app tolerates the additive schema. See [Audit Logs](./audit-logs.md).

Three later migrations rewrite no rows and apply in the normal way:

- `20261025124500_audit_logs_tamper_resistance.sql` — the trail no longer has foreign keys, so deleting a playbook, MCP server or account keeps its rows and its hash chain; DELETE and TRUNCATE are refused except by the retention function; checkpoints are immutable.
- `20261025130000_audit_config_changes.sql` — changes to playbooks (including visibility), skills, MCP servers, API keys and collaborators are recorded by triggers, whichever API path made them, with the actor the application authenticated.
- `20261025140000_private_instance.sql` — the private-instance switch below.

### Private instance

An instance for one organisation usually has nothing to publish. Turn on the
private-instance switch and no playbook can be public or unlisted, so the
public listings, a public playbook's MCP endpoint, and reading an unlisted
playbook by its GUID have nothing to serve without a sign-in. Setting a
database parameter needs a superuser; on the official self-hosted Supabase
image that is `supabase_admin`, not `postgres`:

```bash
docker exec -i supabase-db psql -U supabase_admin -d postgres <<'SQL'
ALTER DATABASE postgres SET agentplaybooks.private_instance = 'on';
UPDATE public.playbooks SET visibility = 'private' WHERE visibility <> 'private';
SQL
docker restart supabase-rest
```

The restart makes the Data API's pooled connections pick up the setting; until
then, connections opened before it do not enforce it. Independently of the switch, a playbook-scoped API key — an
agent's credential — cannot make a playbook public or unlisted.

### Air-gapped / no-egress

A local or government deploy should not open a path out of the operator's
network. The production Dockerfile already sets `NEXT_TELEMETRY_DISABLED=1`.
Set `NO_EGRESS=true` (and `SECRETS_REQUIRE_ALLOWED_HOSTS=true` if agents must
not pick arbitrary `use_secret` destinations). The **No egress** GitHub Actions
workflow (`deploy/airgap/`) is the automated proof: the stack runs on a Docker
network with `internal: true`, a DNS sink allow-lists only compose service
names, and the job fails if any external lookup or outbound packet is
attempted.

| Call | When | Disable / pin |
| --- | --- | --- |
| Geist fonts (`next/font/local`) | **Build time.** Committed variable fonts in `src/app/fonts/` (merged in #200). `next build` does not fetch Google Fonts. | Nothing to disable. `npm ci` still needs a registry (or an offline cache). |
| Next.js telemetry | Disabled in the production image (`NEXT_TELEMETRY_DISABLED=1`). | Keep that env set. |
| Official MCP registry (`registry.modelcontextprotocol.io`) | `GET /api/mcp-registry/search` only, when someone uses the dashboard search. | `NO_EGRESS=true`, or `MCP_REGISTRY_URL=` to disable, or `MCP_REGISTRY_URL=http://…` for an internal mirror. |
| `use_secret` / secrets proxy | Whenever an agent or API client names a URL. That is the feature. | Pin each secret with `allowed_hosts`; set `SECRETS_REQUIRE_ALLOWED_HOSTS=true` so unpinned secrets cannot leave. |
| OAuth token exchange (Google, Microsoft, LinkedIn, X) | Only if you configure those providers and complete a consent flow. | Leave the providers disabled (the self-hosted default). |
| Entra ID / other SSO | Login redirects to the IdP. | Do not enable external IdPs on an air-gapped instance; use email auth against local GoTrue, or an internal IdP. |
| Seed / import scripts | Manual tooling (`scripts/seed-data.ts` talks to GitHub). | Do not run them on the air-gapped host. |
| Hosted product URLs in generated text (`agentplaybooks.ai` in OAuth metadata, plugin export, docs links) | String construction, not a network call. | Set `NEXT_PUBLIC_APP_URL` to this instance at **build** time. |

The air-gap CI job still builds and pulls images **before** isolating the
network (`npm ci` and base-image pulls need it). Fonts no longer do. Runtime of
that image, with `NO_EGRESS=true`, is what the observer measures.

### Pinning a secret to specific destinations

`use_secret` and `POST /api/playbooks/:guid/secrets/proxy` inject a decrypted
credential into a request whose URL the caller supplies. The agent never sees
the plaintext, but it does choose the destination — so a caller holding a
`secrets:read` key, including an agent following instructions injected into its
context, can name any host.

A secret can therefore pin itself:

```bash
curl -X PUT 'https://your-domain.com/api/playbooks/GUID/secrets/GITHUB_TOKEN' \
  -H "Authorization: Bearer apb_your_key" \
  -H "Content-Type: application/json" \
  -d '{"allowed_hosts": ["api.github.com", "*.githubusercontent.com"]}'
```

Entries are case-insensitive hostnames. A leading `*.` matches subdomains but
not the bare domain, so list both if you need both. An unset or empty list means
any destination, which keeps existing secrets working unchanged; set
`SECRETS_REQUIRE_ALLOWED_HOSTS=true` to make pinning mandatory on your instance
(the bundled `docker-compose.yml` does).

An API key may narrow a secret's list but not widen or clear it, and cannot
turn on API-key reveal: those are the owner's decisions. Pointing an MCP server
configuration at vault secrets likewise needs the owner or a key with
`secrets:read`, because the configuration decides where they are sent.

Destinations are refused when they are internal: loopback, private,
link-local and carrier-grade NAT addresses in any IPv4 or IPv6 spelling,
single-label names such as a Docker service, and `*.local` / `*.internal`
names. The name is also resolved, and refused if any address it resolves to
is internal. A name whose DNS answer changes between that check and the
connection is not covered; run the application container without a route to
internal networks it does not need, so egress policy covers it too.

### Offboarding a user

When someone leaves, disable the account and revoke what it stands behind in
one step:

```bash
SUPABASE_URL=https://supabase.example.org SUPABASE_SERVICE_ROLE_KEY=...   python3 scripts/self-host/offboard-user.py person@example.org
```

It bans the account in Supabase Auth and deactivates the account's user API
keys and the API keys and certificate clients of the playbooks it owns. The API
also refuses a banned or deleted account's remaining credentials and unexpired
session tokens from their next request on, so banning in the Auth dashboard
alone already stops them; the script makes the revocation durable and visible
in the audit trail (`api_key.revoke`). Playbooks and the audit trail stay;
reassign or delete the playbooks separately. With an external IdP (Entra ID),
also remove the person there.

A user who lost a device can revoke their own credentials with
`POST /api/user/credentials/revoke-all` from a signed-in session.

## Custom Domain

### Cloudflare Pages

1. Go to your Pages project > Custom domains
2. Add your domain
3. Configure DNS (Cloudflare or external)

### SSL

Cloudflare Pages automatically provides SSL certificates.

## Updating

### Cloudflare Pages

Push to your main branch. Cloudflare will automatically rebuild and deploy.

### Docker

```bash
git pull
docker-compose build
docker-compose up -d
```

## Monitoring

### Cloudflare Analytics

Built-in analytics available in Cloudflare Dashboard.

### Supabase Dashboard

Monitor database usage, auth events, and API calls.

## Backup

On-prem backup of the database (including vault tables), object storage, and
config — with the encryption master key stored separately — is documented in
[On-prem backup and restore](./backup-restore.md). That runbook covers
scheduling, archive encryption, retention, offsite copy, RPO/RTO, the empty-machine
restore procedure, and the automated restore drill (`scripts/self-host/backup.sh`,
`restore.sh`, `restore-drill.sh`).

Hosted Supabase projects can still use the dashboard or CLI as a complement:

```bash
# Using Supabase CLI (hosted project)
supabase db dump > backup.sql

# Or use Supabase Dashboard > Database > Backups
```

A `supabase db dump` of SQL is not a substitute for the encrypted, offsite
archive in the runbook, and it does not include `SECRETS_ENCRYPTION_KEY`.

## Troubleshooting

### Build Fails

1. Check Node.js version (need 20+)
2. Clear node_modules and reinstall
3. Check environment variables are set

### Auth Not Working

1. Verify Supabase URL and keys
2. Check redirect URLs in Supabase Auth settings
3. Ensure RLS policies are applied
4. A provider button is missing: the login page shows only providers that `/auth/v1/settings` reports as enabled. If that endpoint cannot be reached, only the email form is shown.

### API Returns 500

1. Check Supabase service role key
2. Verify database migrations ran successfully
3. Check Cloudflare Worker logs

## Security Checklist

- [ ] Environment variables are set as secrets (not in code)
- [ ] SUPABASE_SERVICE_ROLE_KEY is never exposed to client
- [ ] RLS is enabled on all tables
- [ ] Auth providers configured with correct redirect URLs
- [ ] Custom domain uses HTTPS
- [ ] Encrypted database and storage backups run on a schedule, with an offsite copy
- [ ] `SECRETS_ENCRYPTION_KEY` is stored separately from the backup archive
- [ ] Empty-machine restore drill has been run and RTO recorded
- [ ] Vulnerability reports follow [SECURITY.md](https://github.com/matebenyovszky/agentplaybooks/blob/main/SECURITY.md); incident filing uses the [incident runbook](https://github.com/matebenyovszky/agentplaybooks/blob/main/docs/security/incident-runbook.md) (the operator is the reporting entity)
- [ ] Release SBOMs are verified with [`cosign verify-blob`](https://github.com/matebenyovszky/agentplaybooks/blob/main/docs/security/supply-chain.md) before production deploy

The supplier-assessment pack (architecture, crypto claims, asset inventory, 7/2024 MK r. / NIST risk template, known gaps) is in [`docs/security/`](../../docs/security/README.md). Hungarian is the language of record (`*.hu.md`). After a compose change, refresh the live inventory with `npm run inventory:self-host`. Short website summary: [Security documentation pack](./security.md).
