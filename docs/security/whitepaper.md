# AgentPlaybooks security whitepaper

**Version:** 2026-10-25 · **Source:** the `main` branch as of that date. Parallel PRs are **Folyamatban / In progress** and do not count as shipped until they merge.  
**Language of record for the assessment:** Hungarian ([whitepaper.hu.md](./whitepaper.hu.md)).

> **jogi ellenőrzés szükséges.** Notes below on legal scope, NIS2, the MK decree, GDPR, and manufacturer status are not legal advice. The customer's counsel and IBF must approve them before production use.

## 1. Purpose and scope

This document supports a supplier assessment and EIR security classification. Requested focus:

| Reference | What this pack supplies | Note |
|-----------|-------------------------|------|
| NIS2 Art. 21(2)(a) | Material for risk-analysis and information-system security policy: architecture, data flows, control mapping | The policy is the customer's; we provide input — **jogi ellenőrzés szükséges** |
| NIS2 Art. 21(2)(d) | Supply chain: component list, SDLC, provenance, documented gaps | We are a product supplier to the customer — **jogi ellenőrzés szükséges** |
| NIS2 Art. 21(2)(g) | Documentation of hygiene practices (secrets, RBAC, audit); training is the customer's | “Training” in the directive is not a software feature — **jogi ellenőrzés szükséges** |
| 7/2024. (VI. 24.) MK rendelet | Template mapped to NIST SP 800-53 rev. 5 families | Exact MK control IDs are **not** invented; see [risk-assessment.md](./risk-assessment.md) |

Further letters of Art. 21(2) appear in the template because MK-decree families overlap them. That is not a claim that the product satisfies those letters on its own — **jogi ellenőrzés szükséges**.

**Deployment assumption:** the customer runs the product **on their infrastructure** (`docker-compose.yml` plus self-hosted Supabase). Public SaaS (`agentplaybooks.ai` / Cloudflare) is a different controller/processor picture — **jogi ellenőrzés szükséges**.

## 2. Product, briefly

AgentPlaybooks is MIT-licensed, portable AI-agent configuration: playbooks, personas, skills, MCP/OpenAPI tools, memory, canvas, secrets vault. The web app is Next.js; APIs are Hono under the App Router; data and auth are Supabase (PostgreSQL + GoTrue).

Sources: [`public/docs/architecture.md`](../../public/docs/architecture.md), [`README.md`](../../README.md).

## 3. Architecture and trust boundaries

```
Customer agents / CLI / Python loader / browser
        │  HTTPS (customer TLS termination; compose itself is HTTP :3000)
        ▼
┌───────────────────────────────────────────┐
│  TB-1  Next.js app (Docker `app`)         │  SECRETS_ENCRYPTION_KEY
│  UI, REST, MCP, OpenAPI                   │  SUPABASE_SERVICE_ROLE_KEY
│  AES-256-GCM decrypt on the proxy path    │  process can see plaintext
└────────────────────┬──────────────────────┘
                     │ JWT / service_role Data API
                     ▼
┌───────────────────────────────────────────┐
│  TB-2  Supabase (customer stack)          │  Auth JWT, Postgres,
│  Auth, PostgREST, Kong, DB volume         │  ciphertext, audit_logs
└───────────────────────────────────────────┘
                     │
        TB-3 intentional egress: use_secret / federated MCP
        constrained by allowed_hosts + SSRF filters
```

| Boundary | Inside | Trust |
|----------|--------|-------|
| TB-1 App process | Next.js as non-root `nextjs` in `Dockerfile`, port 3000 | Holds the master key and service-role key; compromise means vault plaintext |
| TB-2 Supabase | Auth + Postgres + Data API on the customer network | App calls with service_role; RLS protects browser/anon paths, **not** service_role |
| TB-3 Outbound proxy | `use_secret` and federated tools | The agent never sees the secret but chooses the destination; `allowed_hosts` + private-IP deny |
| TB-4 Cloudflare mTLS (hosted only) | `cf.tlsClientAuth` | **Fails closed** on self-hosted Node/Next; see gaps |

Compose **does not** start a database. `docker-compose.yml` says so; bare Postgres is not enough because every route uses the Supabase Data API and Auth. See [`public/docs/self-hosting.md`](../../public/docs/self-hosting.md), [`docker-compose.yml`](../../docker-compose.yml).

The service role bypasses RLS. Authorization lives in application code: [`src/app/api/_shared/guards.ts`](../../src/app/api/_shared/guards.ts), [`supabase/README.md`](../../supabase/README.md).

## 4. Data flows and data classes

| Class | Where | Protection | Who |
|-------|-------|------------|-----|
| Secret plaintext | Memory only, during proxy/reveal | Never at rest | App process |
| Secret ciphertext | `secrets` table | AES-256-GCM, per-user HKDF | Owner (API); RLS owner + service_role |
| Master key | Process env `SECRETS_ENCRYPTION_KEY` | 32-byte hex; no KMS | Operator |
| Playbook content | Postgres | Transport TLS is the customer's | owner / editor / API-key role |
| Audit | `audit_logs` | No hash chain; no secret values | Playbook owner |
| API key | SHA-256 hash + prefix | Plaintext shown once | Owner |
| Invite token | SHA-256 hash, 72 h | [`src/lib/utils.ts`](../../src/lib/utils.ts) | — |
| mTLS client | SHA-256 fingerprint, secret names | Private key stays on the client | Owner |
| Portable snapshot | `playbook_snapshots` | SHA-256 digest; **not** vault values | Management API |
| Auth PII | Supabase Auth | Customer's Auth operations | — |

**Intentional egress (secret use):** agent → `POST /api/playbooks/:guid/secrets/proxy` or MCP `use_secret` → server-side decrypt → inject header → HTTP to the caller-supplied URL → **response only** back. The log stores the destination **hostname**, not the full URL. Sources: [`src/app/api/playbooks/[guid]/secrets/app.ts`](../../src/app/api/playbooks/[guid]/secrets/app.ts), [`src/app/api/_shared/audit.ts`](../../src/app/api/_shared/audit.ts).

## 5. Cryptography

**Claims the code supports.**

| Property | Implementation | Source |
|----------|----------------|--------|
| Algorithm | Web Crypto `AES-GCM`, 256-bit key, 12-byte IV, 128-bit tag | [`src/lib/crypto.ts`](../../src/lib/crypto.ts) |
| Per-user key | HKDF-SHA-256, salt = `userId`, info = `agentplaybooks-secrets-v1` | `deriveUserKey()` in the same file |
| Master key | `SECRETS_ENCRYPTION_KEY`, exactly 64 hex chars | `getMasterKeyHex()` |
| v2 ciphertext | AAD: `userId`, `playbookId`, `secretName`; prefix `v2:` | `encodeAdditionalData` |
| v1 compatibility | Legacy ciphertext still decrypts | [`src/lib/crypto.test.ts`](../../src/lib/crypto.test.ts) |
| API keys at rest | SHA-256 | [`src/lib/utils.ts`](../../src/lib/utils.ts) `hashApiKey` |
| TLS (hosted) | Cloudflare edge | [`public/docs/architecture.md`](../../public/docs/architecture.md) |
| mTLS (hosted) | `cf.tlsClientAuth` only; HTTP cert headers are **not** trusted; `certRevoked !== "0"` rejected | [`src/lib/mtls.ts`](../../src/lib/mtls.ts) |
| mTLS registry | `secret_clients.certificate_sha256`, `is_active`, `expires_at`, named secrets | [`supabase/migrations/20261010081252_secret_clients.sql`](../../supabase/migrations/20261010081252_secret_clients.sql) |

The Docker image on `main` **does not** terminate mTLS. The Python loader fails closed on self-hosted Node/Next. **Folyamatban / In progress** (trusted proxy adapter): [#201](https://github.com/matebenyovszky/agentplaybooks/pull/201). Current behaviour: [`packages/python-secrets/README.md`](../../packages/python-secrets/README.md).

**We do not claim:** KMS, HSM, key wrapping, or master-key rotation with re-encryption. The compose comment: rotating `SECRETS_ENCRYPTION_KEY` makes existing secrets undecryptable.

Tests: [`src/lib/crypto.test.ts`](../../src/lib/crypto.test.ts), [`src/lib/mtls.test.ts`](../../src/lib/mtls.test.ts), [`tests/api/secret-runtime.test.ts`](../../tests/api/secret-runtime.test.ts).

## 6. Authentication and authorization

**AuthN.** Supabase Auth. The session is a JWT in `Authorization`; cookies are deliberately not used as the session ([`src/app/api/_shared/auth.ts`](../../src/app/api/_shared/auth.ts)).

The login page shows providers reported by GoTrue `/auth/v1/settings` ([`src/lib/auth-providers.ts`](../../src/lib/auth-providers.ts)):

- email/password, if enabled;
- OAuth: Microsoft (`azure` / Entra ID), Google, GitHub, LinkedIn OIDC.

Self-host Entra: `GOTRUE_EXTERNAL_AZURE_*` on the GoTrue container, documented in [`public/docs/self-hosting.md`](../../public/docs/self-hosting.md).

There is **no** app-level MFA (TOTP/WebAuthn). MFA can be enforced at the IdP (Entra) — a customer control. There is **no** SAML; ROADMAP lists it in Phase 4.

**Human RBAC.** `PlaybookAccessRole = "owner" | "editor"` — [`src/app/api/_shared/guards.ts`](../../src/app/api/_shared/guards.ts). Editors cannot access secrets, API keys, visibility, or deletion ([`permissions.md`](../../permissions.md)).

**Auditor role: not in the codebase.** Until it lands on `main`, audit-log read is owner (or a user API key with `playbooks:read`) — no editor and no distinct auditor role. This pack **does not** claim the auditor role already exists. **Folyamatban / In progress:** [#202](https://github.com/matebenyovszky/agentplaybooks/pull/202).

**API-key roles.** `viewer`, `coworker`, `proposer`, `admin` ([`src/app/api/[[...route]]/route.ts`](../../src/app/api/[[...route]]/route.ts) `API_KEY_ROLES`, [`src/components/playbook/ApiKeyManager.tsx`](../../src/components/playbook/ApiKeyManager.tsx)). Permission strings: [`src/app/api/_shared/permissions.ts`](../../src/app/api/_shared/permissions.ts) `grantsPermission`.

Expired or inactive keys are rejected at lookup ([`src/app/api/_shared/auth.ts`](../../src/app/api/_shared/auth.ts)).

## 7. Audit logging

One table: `audit_logs` (renamed from `mcp_proxy_audit_logs`) — [`supabase/migrations/20260819_audit_logs_secrets.sql`](../../supabase/migrations/20260819_audit_logs_secrets.sql).

Vault operations: `secret.create`, `secret.rotate`, `secret.update`, `secret.delete`, `secret.reveal`, `secret.use`, `secret.list`, `secret.client_create`, `secret.client_revoke`, `secret.oauth_exchange` — [`src/lib/supabase/types.ts`](../../src/lib/supabase/types.ts) `SECRET_AUDIT_OPERATIONS`. Status: `success` \| `denied` \| `error`. A refusal is an event.

Rule: no secret value, no full URL, no API key in the row. A write failure does not fail the vault operation ([`src/app/api/_shared/audit.ts`](../../src/app/api/_shared/audit.ts)).

Read: `GET /api/playbooks/:guid/audit` (legacy `GET /api/mcp/audit/:guid`), limit ≤ 500, filters `operation`, `secret.` prefix, `secret=` name — [`src/app/api/playbooks/[guid]/audit/app.ts`](../../src/app/api/playbooks/[guid]/audit/app.ts). Deliberately not readable with a playbook API key.

**Missing on `main`:** SIEM / syslog export, retention job, hash chain. Skills / memory / canvas writes are not logged. **Folyamatban / In progress** (export, syslog/SIEM, retention, hash chain, auditor read): [#202](https://github.com/matebenyovszky/agentplaybooks/pull/202).

## 8. Secret expiry and revocation

| Mechanism | Behaviour | Source |
|-----------|-----------|--------|
| Secret `expires_at` | Proxy, federation, API-key reveal: rejected. Owner can still read in the dashboard to replace it | [`src/lib/secret-expiry.ts`](../../src/lib/secret-expiry.ts) |
| Timezone | `expires_at` without a timezone is rejected | `expiresAtInput()` |
| mTLS client | `is_active=false` (revoke), own `expires_at` | [`src/app/api/playbooks/[guid]/secret-clients/app.ts`](../../src/app/api/playbooks/[guid]/secret-clients/app.ts) |
| API key | `is_active` + `expires_at` at lookup | [`src/app/api/_shared/auth.ts`](../../src/app/api/_shared/auth.ts) |
| Destination | `allowed_hosts`; `SECRETS_REQUIRE_ALLOWED_HOSTS=true` makes pinning mandatory | [`src/lib/secret-destinations.ts`](../../src/lib/secret-destinations.ts) |
| SSRF | Private/link-local/metadata hosts denied on proxy and federation | [`src/app/api/playbooks/[guid]/secrets/app.ts`](../../src/app/api/playbooks/[guid]/secrets/app.ts), [`src/lib/mcp/federation.ts`](../../src/lib/mcp/federation.ts) `assertSafeRemoteUrl` |

Tests: [`tests/api/secrets-expiry.test.ts`](../../tests/api/secrets-expiry.test.ts). No background job purges expired rows.

## 9. Self-host and no-egress

**What we can claim.** The [`Dockerfile`](../../Dockerfile) is multi-stage, non-root, `NEXT_TELEMETRY_DISABLED=1`, healthcheck on `:3000`. [`docker-compose.yml`](../../docker-compose.yml) starts one `app` service (`${APP_PORT:-3000}:3000`). Legal copy states no analytics/advertising/tracking cookies ([`src/lib/legal-copy.ts`](../../src/lib/legal-copy.ts)).

**What we cannot claim as an “air-gapped / no-egress” product.**

1. Compose does not include the Supabase stack.
2. Build: `next/font/google` Geist / Geist Mono — [`src/app/layout.tsx`](../../src/app/layout.tsx). Next self-hosts the font after the build, but **the build needs egress** unless the font is pre-cached. There is no offline font pack on `main`. **Folyamatban / In progress:** [#200](https://github.com/matebenyovszky/agentplaybooks/pull/200) (`next/font/local`).
3. There is no isolated-network E2E test on `main` proving zero outbound packets. **Folyamatban / In progress:** [#204](https://github.com/matebenyovszky/agentplaybooks/pull/204).
4. CSP Report-Only `connect-src` includes `https://*.supabase.co` ([`src/lib/security-headers.ts`](../../src/lib/security-headers.ts)); that does not cover a custom Auth host and is not enforcing.
5. `use_secret` / federation **intentionally** make outbound HTTP to customer-chosen destinations.
6. mTLS fails closed on plain Docker/Node self-host. **Folyamatban / In progress** (trusted proxy, `MTLS_MODE=proxy`): [#201](https://github.com/matebenyovszky/agentplaybooks/pull/201).

A customer no-egress goal is their network isolation, font cache, `SECRETS_REQUIRE_ALLOWED_HOSTS=true`, and disabling the outbound proxy if the vault is unused. The product does not measure this.

HTTP headers (HSTS, `X-Frame-Options: DENY`, nosniff, Permissions-Policy): [`src/lib/security-headers.ts`](../../src/lib/security-headers.ts), [`next.config.ts`](../../next.config.ts). CSP is currently Report-Only.

## 10. SDLC and supply chain

| Control | Present? | Where |
|---------|----------|-------|
| Dependabot (npm root + CLI, weekly, Europe/Budapest; Actions monthly) | Yes | [`.github/dependabot.yml`](../../.github/dependabot.yml) |
| `npm audit --omit=dev --audit-level=high` in CI | Yes | [`scripts/audit-production.mjs`](../../scripts/audit-production.mjs), [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) |
| CI: lint, tests, `tsc`, worker build, wrangler dry-run | Yes | same workflow |
| CLI npm trusted publishing / OIDC provenance | Yes | [`.github/workflows/publish-cli.yml`](../../.github/workflows/publish-cli.yml) (`id-token: write`; `--provenance` is intentionally omitted, npm attests automatically) |
| SAST (CodeQL / Semgrep) | Not on `main` | **Folyamatban / In progress** (separate PR being opened; no link yet) |
| CycloneDX / SPDX SBOM | Not on `main` | **Folyamatban / In progress** (separate PR being opened; no link yet) |
| Container signing (cosign) | Not on `main` | **Folyamatban / In progress** (separate PR being opened; no link yet) |
| `SECURITY.md`, PSIRT, incident runbook | Not on `main` | **Folyamatban / In progress** (separate PR being opened; no link yet) |
| Automated encrypted DB backup / DR runbook | Not on `main` (one-liner `supabase db dump`) | **Folyamatban / In progress** (separate PR being opened; no link yet)

Lockfiles (`package-lock.json`, `packages/cli/package-lock.json`) are the reproducible-install input.

## 11. Known gaps

Honest list for the supplier assessment. Status follows `main` as of 2026-10-25. **Folyamatban / In progress** rows are open PRs; flip them after merge.

1. **No KMS / HSM.** The master key is a process environment variable.
2. **No key rotation with re-encryption.** Changing the master key is vault data loss.
3. **No application-level MFA.** MFA is IdP-only (e.g. Entra conditional access).
4. **No auditor role in code.** Human RBAC: owner \| editor. Audit read is owner-level. **Folyamatban / In progress:** [#202](https://github.com/matebenyovszky/agentplaybooks/pull/202).
5. **No SAML SSO.** OIDC/OAuth via GoTrue if the customer enables it.
6. **Audit: no export, retention, or hash chain on `main`.** Skills / memory / canvas writes are not logged. **Folyamatban / In progress** (export, syslog/SIEM, retention, hash chain): [#202](https://github.com/matebenyovszky/agentplaybooks/pull/202).
7. **No `SECURITY.md`, PSIRT, 24/72h / 1-month incident runbook.** NKI notification (418/2024. § 77) is the customer's process — **jogi ellenőrzés szükséges**. **Folyamatban / In progress:** a separate PR is being opened; no link yet.
8. **No backup and DR runbook.** `supabase db dump`; playbook snapshots do not include secret values. **Folyamatban / In progress:** a separate PR is being opened; no link yet.
9. **No SAST, SBOM, or image signing.** Dependabot + production npm audit + CLI provenance exist. **Folyamatban / In progress:** a separate PR is being opened; no link yet.
10. **mTLS only on Cloudflare on `main`.** Self-host Node/Next: fail-closed. **Folyamatban / In progress** (trusted proxy): [#201](https://github.com/matebenyovszky/agentplaybooks/pull/201).
11. **No no-egress evidence on `main`.** Build-time Google Fonts; compose is not self-contained. **Folyamatban / In progress:** fonts [#200](https://github.com/matebenyovszky/agentplaybooks/pull/200); isolated CI [#204](https://github.com/matebenyovszky/agentplaybooks/pull/204).
12. **No rate limiting** (ROADMAP).
13. **No external pentest** in this pack.
14. **CSP Report-Only**, `connect-src` hardcoded to `*.supabase.co`.
15. **RLS is not the primary control for service_role**; authz is in the API layer.

## 12. Responsibility split (short)

| Area | Product | Customer |
|------|---------|----------|
| Code, crypto, RBAC, vault, audit API | Yes | — |
| Classification, risk analysis, MK control selection | Template | IBF — **jogi ellenőrzés szükséges** |
| Entra SSO + MFA, network, TLS termination, physical protection | Config hooks | Operations |
| Log retention, SIEM, NKI incident reporting | API for extracts | 24 / 72 h / 1 month process |
| Backup, RPO/RTO | `db dump` + snapshots | Restore drill |
| GDPR controller / processor | On self-host the customer is generally the controller — **jogi ellenőrzés szükséges** | DPIA if required |

Detailed mapping: [risk-assessment.md](./risk-assessment.md).

## 13. Source index

| Topic | Files |
|-------|-------|
| Crypto | `src/lib/crypto.ts`, `src/lib/crypto.test.ts` |
| mTLS | `src/lib/mtls.ts`, `src/lib/mtls.test.ts`, `supabase/migrations/20261010081252_secret_clients.sql` |
| Authz | `src/app/api/_shared/guards.ts`, `src/app/api/_shared/permissions.ts`, `src/app/api/_shared/auth.ts`, `permissions.md` |
| Audit | `src/app/api/_shared/audit.ts`, `src/app/api/playbooks/[guid]/audit/app.ts`, `supabase/migrations/20260819_audit_logs_secrets.sql` |
| Expiry / SSRF | `src/lib/secret-expiry.ts`, `src/lib/secret-destinations.ts`, `src/lib/mcp/federation.ts` |
| Self-host | `docker-compose.yml`, `Dockerfile`, `public/docs/self-hosting.md` |
| SDLC | `.github/dependabot.yml`, `.github/workflows/ci.yml`, `.github/workflows/publish-cli.yml`, `scripts/audit-production.mjs` |
| Live inventory | `scripts/list-self-host-stack.mjs` |
