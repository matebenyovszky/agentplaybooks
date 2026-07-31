# Self-Hosting Guide

Deploy AgentPlaybooks on your own infrastructure.

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

### Microsoft SQL Server database

The repository contains a dedicated SQL Server 2022 Compose stack and a
separate Drizzle migration history. Copy the example environment first:

```bash
cp .env.mssql.example .env
```

Set a strong `MSSQL_SA_PASSWORD` and a 64-character hexadecimal
`SECRETS_ENCRYPTION_KEY`, then start the stack:

```bash
docker compose -f docker-compose.mssql.yml up --build
```

The stack performs three ordered operations:

1. starts SQL Server and waits for its health check;
2. creates the configured database if it does not exist;
3. applies pending migrations before starting AgentPlaybooks.

For a database outside Docker, use:

```bash
export DB_DIALECT=mssql
export DATABASE_URL='Server=sql.example.internal,1433;Database=agentplaybooks;User Id=agentplaybooks;Password=...;Encrypt=true;TrustServerCertificate=false;'
npm run db:migrate:mssql:runtime
npm run db:smoke:mssql
```

Schema changes are generated independently for each supported database:

```bash
npm run db:generate:postgres
npm run db:generate:mssql
```

> **Current limitation:** the SQL Server schema, connection, migration and
> smoke-test layer are available, but the ongoing Supabase Data API migration
> must be completed before every application endpoint can use SQL Server.
> Authentication is intentionally unchanged in this phase and still uses
> Supabase Auth.

### docker-compose.yml

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL}
      - NEXT_PUBLIC_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
    restart: unless-stopped
```

### Dockerfile

```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV production

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
```

### Run

```bash
docker-compose up -d
```

## Option 3: Vercel

While optimized for Cloudflare, the app works on Vercel too.

1. Import your forked repo to Vercel
2. Set environment variables
3. Deploy

**Note:** Some Cloudflare-specific features won't work on Vercel.

## Database Migrations

### Microsoft SQL Server

Committed SQL Server migrations live under `drizzle/mssql`. Production
deployments should run `npm run db:migrate:mssql:runtime`; do not use
`drizzle-kit push` against production databases.

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
| `MCP_SECRET_ENCRYPTION_KEY` | Yes for federated tools | Random value (32+ characters) used to encrypt upstream MCP/OpenAPI credentials |

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
