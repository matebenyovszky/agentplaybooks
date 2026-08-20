# Self-Hosting Guide

Deploy AgentPlaybooks on your own infrastructure.

> ## Current limitations — read this first
>
> *Last verified: 2026-08-01.*
>
> **1. Start a new project from `supabase/schema.sql`, not from
> `supabase/migrations/`.** The migrations folder is incremental only — it has
> no `CREATE TABLE` for the core tables and never did, so applying it to an
> empty database fails on the first statement. `supabase/schema.sql` is a
> snapshot of the whole current schema and is all a new project needs; the
> migrations are the forward history from that snapshot onward.
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
3. Run the database migration:

```bash
# Option A: Use Supabase CLI
supabase db push

# Option B: Copy from migrations folder and run in SQL editor
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
2. (Optional) Configure Google OAuth
3. (Optional) Configure GitHub OAuth

Set redirect URLs to `https://your-domain.pages.dev/*`

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

Run the migration in `supabase/migrations/` or use Supabase CLI:

```bash
# Install Supabase CLI
npm install -g supabase

# Link to your project
supabase link --project-ref YOUR_PROJECT_REF

# Push migrations
supabase db push
```

### Manual Migration

Copy the SQL from `supabase/migrations/initial_schema.sql` and run in Supabase SQL Editor.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon (public) key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (secret) |
| `MCP_SECRET_ENCRYPTION_KEY` | Yes for federated tools | Random value (32+ characters; 64-char hex preferred, used as raw key material) for upstream MCP/OpenAPI credentials. A key is then derived per server via HKDF |
| `SECRETS_ENCRYPTION_KEY` | Yes for the secrets vault | 64 hexadecimal characters. Rotating it makes existing secrets undecryptable — there is no re-encryption tooling yet. |
| `ALLOWED_ORIGINS` | No | Comma-separated origins allowed to make credentialed cross-origin API calls. Setting it **replaces** the default list, which is what a self-hosted instance wants — otherwise the project's own domains stay trusted. Unset keeps the previous behaviour. |
| `SECRETS_REQUIRE_ALLOWED_HOSTS` | No | Set to `true` to refuse outbound use of any secret that has not declared `allowed_hosts`. Off by default. |

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
`SECRETS_REQUIRE_ALLOWED_HOSTS=true` to make pinning mandatory on your instance.

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

### Database

```bash
# Using Supabase CLI
supabase db dump > backup.sql

# Or use Supabase Dashboard > Database > Backups
```

## Troubleshooting

### Build Fails

1. Check Node.js version (need 20+)
2. Clear node_modules and reinstall
3. Check environment variables are set

### Auth Not Working

1. Verify Supabase URL and keys
2. Check redirect URLs in Supabase Auth settings
3. Ensure RLS policies are applied

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
