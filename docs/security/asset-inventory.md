# Asset inventory

**Verified:** 2026-10-24 from source. For a live instance, run `scripts/list-self-host-stack.mjs` and attach the output to this document.

> **jogi ellenőrzés szükséges.** Where the “EIR asset” boundary sits (the AgentPlaybooks instance alone, or the whole AI-agent environment) is part of the customer’s classification.

This inventory is for **self-host**. Public SaaS (Cloudflare + hosted Supabase) is a different asset boundary.

Hungarian: [asset-inventory.hu.md](./asset-inventory.hu.md). Whitepaper: [whitepaper.md](./whitepaper.md).

## 1. Application component (this repository)

| Component | Type | Where | Port / volume | Notes |
|-----------|------|-------|---------------|-------|
| `app` | Docker service | [`docker-compose.yml`](../../docker-compose.yml) | `${APP_PORT:-3000}:3000` | The only compose service |
| Next.js 16 + React 19 | Runtime | [`package.json`](../../package.json), [`Dockerfile`](../../Dockerfile) | 3000/tcp in the container | `output: "standalone"` — [`next.config.ts`](../../next.config.ts) |
| Hono API | Same process | `src/app/api/` | — | REST / MCP / OpenAPI |
| Non-root user | Image | `Dockerfile` `nextjs` uid 1001 | — | `NEXT_TELEMETRY_DISABLED=1`, healthcheck `wget` `:3000` |
| Static docs | Image layer | `public/` | — | Worker builds pack this differently (Cloudflare) |
| On-prem backup / restore | Scripts + runbook | [`scripts/self-host/`](../../scripts/self-host/), [`docs/self-host/backup-restore.md`](../self-host/backup-restore.md) | Encrypted archive in `BACKUP_DIR` | **Done on `main`:** [#203](https://github.com/matebenyovszky/agentplaybooks/pull/203). Master key is never in the archive |

The script always prints declared compose; without Docker use `--declared-only`.

```bash
npm run inventory:self-host
node scripts/list-self-host-stack.mjs --declared-only --json
node scripts/list-self-host-stack.mjs --compose-file /opt/supabase/docker/docker-compose.yml
```

Source: [`scripts/list-self-host-stack.mjs`](../../scripts/list-self-host-stack.mjs).

## 2. Supabase / Postgres services (customer stack, not in this compose file)

The self-hosting guide requires a **full Supabase stack**, not bare Postgres: [`public/docs/self-hosting.md`](../../public/docs/self-hosting.md), [`supabase/README.md`](../../supabase/README.md). Names below are typical of the official [Supabase Docker self-host](https://supabase.com/docs/guides/self-hosting/docker) guide; **actual** ports come from the customer compose file and the script output.

| Service | Typical ports | Role for this product |
|---------|---------------|------------------------|
| Kong | 8000 HTTP, 8443 HTTPS | API gateway: Auth, REST, Storage, Realtime, Studio |
| db / postgres | 5432 | Data: ciphertext, `audit_logs`, RLS, volume |
| supavisor / pooler | 5432 session, 6543 transaction | Connection pooling |
| auth / gotrue | 9999 (internal) | JWT, email, Entra/OAuth |
| rest / postgrest | 3000 (internal) | Data API for every application route |
| studio | 3000 (internal, behind Kong) | Admin UI — network lock-down is the customer's |
| meta | 8080 (internal) | Postgres meta |
| realtime, storage, imgproxy, analytics, vector, functions, inbucket | see script | Not required by this app |

**Volumes (customer):** Postgres data directory, Auth keys, Kong TLS, GoTrue env. This repository does not define a `volumes:` block in `docker-compose.yml`.

Schema: [`supabase/schema.sql`](../../supabase/schema.sql) (new project), [`supabase/migrations/`](../../supabase/migrations/) (forward history).

## 3. Keys and secrets

| Name | Where | Classification | Rotation / revocation |
|------|-------|----------------|------------------------|
| `SECRETS_ENCRYPTION_KEY` | App env, 64 hex | Vault master key; no KMS; **never in the backup archive** | Rotation without re-encryption = data loss |
| `BACKUP_ENCRYPTION_PASSPHRASE` | Operator env for `backup.sh` | Archive encryption; must not equal the vault master key | Rotate independently of `SECRETS_ENCRYPTION_KEY` |
| `SUPABASE_SERVICE_ROLE_KEY` | App env | Bypasses RLS; never to the client | Customer Auth/JWT secret rotation |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Build + runtime | Public anon key; the browser sees it | Rebuild required (Next inlines `NEXT_PUBLIC_*`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Build + runtime | Browser-reachable URL | Rebuild |
| `NEXT_PUBLIC_APP_URL` | Build + runtime | Own origin; unset falls back to the hosted domain | Rebuild |
| `ALLOWED_ORIGINS` | Runtime, optional | Replaces the CORS allow-list | Restart |
| `SECRETS_REQUIRE_ALLOWED_HOSTS` | Runtime, optional | `true` = mandatory `allowed_hosts` | Restart |
| `NO_EGRESS` | Runtime, optional | `true` disables optional outbound calls (MCP registry search) unless `MCP_REGISTRY_URL` is an internal mirror. **Done on `main`:** [#204](https://github.com/matebenyovszky/agentplaybooks/pull/204) | Restart |
| `MCP_REGISTRY_URL` | Runtime, optional | Override / disable official MCP registry search | Restart |
| `MTLS_MODE` | Runtime, optional | `cloudflare` (default), `proxy`, or `off`. Unknown values fail closed. **Done on `main`:** [#201](https://github.com/matebenyovszky/agentplaybooks/pull/201) | Restart |
| `MTLS_PROXY_FINGERPRINT_HEADER` | Runtime, with `proxy` | Header the terminator sets after verifying the client cert | Restart |
| `MTLS_TRUSTED_PROXIES` | Runtime, with `proxy` | IPs/CIDRs of the TLS terminator | Restart |
| `GOTRUE_EXTERNAL_AZURE_*` | GoTrue env | Entra SSO | GoTrue restart |
| Playbook API keys | `api_keys.key_hash` | SHA-256; plaintext once | `is_active` / `expires_at` |
| User API keys | `user_api_keys` | Same | Same |
| Vault secrets | `secrets` ciphertext | AES-256-GCM | `expires_at`, rotate API, owner reveal |
| mTLS fingerprints | `secret_clients` | No private key on the server | `is_active=false` |

There is no root `.env.example`; the canonical list is compose plus the self-hosting table.

## 4. Network interfaces

| Interface | Default | Who publishes it |
|-----------|---------|------------------|
| App HTTP | 3000 | `docker-compose.yml` |
| App HTTPS | not in compose | Customer reverse proxy / TLS |
| mTLS | Node does not terminate TLS; `MTLS_MODE=proxy` behind a terminator | Cloudflare (hosted) or trusted proxy. **Done on `main`:** [#201](https://github.com/matebenyovszky/agentplaybooks/pull/201) — [`public/docs/self-hosted-mtls.md`](../../public/docs/self-hosted-mtls.md) |
| Supabase Kong | 8000 / 8443 | Customer Supabase compose |
| Postgres | 5432 — **must not be on the internet** | Customer |

## 5. External dependencies

### Build / CI (not runtime on the self-host app)

| Dependency | Why | Egress? |
|------------|-----|---------|
| npm registry | `npm ci` | Yes, at build |
| `next/font/local` Geist / Geist Mono woff2 | [`src/app/layout.tsx`](../../src/app/layout.tsx), [`src/app/fonts/Geist-Variable.woff2`](../../src/app/fonts/Geist-Variable.woff2) | No Google Fonts fetch at build. **Done on `main`:** [#200](https://github.com/matebenyovszky/agentplaybooks/pull/200) |
| GitHub Actions | CI, Dependabot, CLI publish | SaaS CI, not the on-prem instance |
| npm trusted publishing | `@agentplaybooks/cli` provenance | At release, not on the instance |

### Runtime, self-host

| Dependency | Required? | Notes |
|------------|-----------|-------|
| Self-hosted Supabase | Yes | Data API + Auth |
| Entra / Google / GitHub / LinkedIn | No | Only if the customer enables OAuth |
| Agent-chosen HTTPS destinations | When the vault proxy is used | `allowed_hosts` + SSRF |
| Cloudflare | Not on self-host | Hosted path; self-host mTLS uses a local terminator |

Production npm audit: [`scripts/audit-production.mjs`](../../scripts/audit-production.mjs). Lockfiles: [`package-lock.json`](../../package-lock.json), [`packages/cli/package-lock.json`](../../packages/cli/package-lock.json).

CycloneDX SBOMs and cosign of SBOM blobs on `cli-v*` tags are on `main`. **Done on `main`:** [#205](https://github.com/matebenyovszky/agentplaybooks/pull/205) — [`docs/security/supply-chain.md`](./supply-chain.md), [`.github/workflows/sbom.yml`](../../.github/workflows/sbom.yml). Lockfiles remain the reproducible-install input. There is still no signed container registry publish. Isolated no-egress CI for the secrets flow is on `main` (**Done on `main`:** [#204](https://github.com/matebenyovszky/agentplaybooks/pull/204) — [`.github/workflows/no-egress.yml`](../../.github/workflows/no-egress.yml), [`deploy/airgap/`](../../deploy/airgap/)). `npm ci` and base-image pulls still happen before that job isolates the network.

## 6. Data stores (logical assets)

Main tables: `playbooks`, `secrets`, `audit_logs`, `api_keys`, `user_api_keys`, `secret_clients`, `playbook_collaborators`, `playbook_snapshots`, `skills`, `memories`, `canvas`, `mcp_servers`, `profiles` — see the [`README.md`](../../README.md) schema section and [`supabase/schema.sql`](../../supabase/schema.sql).

## 7. Keeping the inventory current

1. After a deploy or compose change: `npm run inventory:self-host` (and Supabase `--compose-file`).
2. Attach the markdown/JSON output to the customer EIR file.
3. `docs:check` verifies relative links and cited source paths, not running containers.

The customer half of CM (Configuration Management): version that output and diff it against the static tables above — see [risk-assessment.md](./risk-assessment.md).

`MTLS_PROXY_SHARED_SECRET`: private proxy channel token, required in proxy mode; same random value in app and terminator. Rotate both together. Forwarded IP headers alone are not trusted.
