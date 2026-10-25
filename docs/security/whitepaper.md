# AgentPlaybooks security whitepaper

**Version:** 2026-10-25 · **Source:** the `main` branch as of that date (includes merged [#200](https://github.com/matebenyovszky/agentplaybooks/pull/200), [#201](https://github.com/matebenyovszky/agentplaybooks/pull/201), [#203](https://github.com/matebenyovszky/agentplaybooks/pull/203), [#204](https://github.com/matebenyovszky/agentplaybooks/pull/204), [#205](https://github.com/matebenyovszky/agentplaybooks/pull/205), [#207](https://github.com/matebenyovszky/agentplaybooks/pull/207)). Remaining parallel PRs are **Folyamatban / In progress** and do not count as shipped until they merge.  
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
| TB-4 mTLS | Hosted: `cf.tlsClientAuth`. Self-host: `MTLS_MODE=proxy` behind a trusted terminator | Node does not terminate TLS. Default without a terminator is fail-closed. **Done on `main`:** [#201](https://github.com/matebenyovszky/agentplaybooks/pull/201) |

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
| mTLS (hosted) | `cf.tlsClientAuth`; HTTP cert headers are **not** trusted; `certRevoked !== "0"` rejected | [`src/lib/mtls.ts`](../../src/lib/mtls.ts) |
| mTLS (self-host) | `MTLS_MODE=cloudflare\|proxy\|off`; `proxy` trusts a terminator in `MTLS_TRUSTED_PROXIES` | [`src/lib/mtls.ts`](../../src/lib/mtls.ts), [`public/docs/self-hosted-mtls.md`](../../public/docs/self-hosted-mtls.md). **Done on `main`:** [#201](https://github.com/matebenyovszky/agentplaybooks/pull/201) |
| mTLS registry | `secret_clients.certificate_sha256`, `is_active`, `expires_at`, named secrets | [`supabase/migrations/20261010081252_secret_clients.sql`](../../supabase/migrations/20261010081252_secret_clients.sql) |

The Docker `app` image on `main` **does not** terminate TLS. Certificate clients on self-host need a terminator (nginx/Caddy/Traefik) and `MTLS_MODE=proxy`. Without that, the Python loader stays fail-closed (`MTLS_MODE=cloudflare`). **Done on `main`:** [#201](https://github.com/matebenyovszky/agentplaybooks/pull/201). Operator guide: [`public/docs/self-hosted-mtls.md`](../../public/docs/self-hosted-mtls.md), [`packages/python-secrets/README.md`](../../packages/python-secrets/README.md).

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

**What we can claim.** The [`Dockerfile`](../../Dockerfile) is multi-stage, non-root, `NEXT_TELEMETRY_DISABLED=1`, healthcheck on `:3000`. [`docker-compose.yml`](../../docker-compose.yml) starts one `app` service (`${APP_PORT:-3000}:3000`). Legal copy states no analytics/advertising/tracking cookies ([`src/lib/legal-copy.ts`](../../src/lib/legal-copy.ts)). Isolated no-egress CI runs the secrets flow on an `internal: true` Docker network with a DNS sink and fails on any outbound packet — [`.github/workflows/no-egress.yml`](../../.github/workflows/no-egress.yml), [`deploy/airgap/`](../../deploy/airgap/). **Done on `main`:** [#204](https://github.com/matebenyovszky/agentplaybooks/pull/204). `NO_EGRESS=true` disables optional MCP-registry search unless `MCP_REGISTRY_URL` is an internal mirror.

**What we cannot claim as a default “air-gapped / no-egress” product.**

1. Production [`docker-compose.yml`](../../docker-compose.yml) still does not include the Supabase stack. The no-egress proof uses a separate [`deploy/airgap/docker-compose.yml`](../../deploy/airgap/docker-compose.yml).
2. Build fonts: `next/font/local` Geist / Geist Mono woff2 — [`src/app/layout.tsx`](../../src/app/layout.tsx), [`src/app/fonts/Geist-Variable.woff2`](../../src/app/fonts/Geist-Variable.woff2). **Done on `main`:** [#200](https://github.com/matebenyovszky/agentplaybooks/pull/200). The build no longer fetches Google Fonts. `npm ci` and base-image pulls still happen **before** the no-egress job isolates the network.
3. Isolated-network E2E proving zero outbound packets at **runtime** is on `main`. **Done on `main`:** [#204](https://github.com/matebenyovszky/agentplaybooks/pull/204).
4. CSP Report-Only `connect-src` includes `https://*.supabase.co` ([`src/lib/security-headers.ts`](../../src/lib/security-headers.ts)); that does not cover a custom Auth host and is not enforcing.
5. `use_secret` / federation **intentionally** make outbound HTTP to customer-chosen destinations unless `allowed_hosts` / `SECRETS_REQUIRE_ALLOWED_HOSTS=true` pin them (the air-gap job uses an in-network echo host).
6. mTLS on plain Docker/Node without a terminator stays fail-closed. Trusted-proxy mode (`MTLS_MODE=proxy`) is on `main`. **Done on `main`:** [#201](https://github.com/matebenyovszky/agentplaybooks/pull/201).

A customer production no-egress goal is still their network isolation plus `NO_EGRESS=true` and `SECRETS_REQUIRE_ALLOWED_HOSTS=true`. The **No egress** workflow measures the air-gap fixture, not every operator compose.

HTTP headers (HSTS, `X-Frame-Options: DENY`, nosniff, Permissions-Policy): [`src/lib/security-headers.ts`](../../src/lib/security-headers.ts), [`next.config.ts`](../../next.config.ts). CSP is currently Report-Only.

## 10. SDLC and supply chain

| Control | Present? | Where |
|---------|----------|-------|
| Dependabot (npm root + CLI, weekly, Europe/Budapest; Actions monthly) | Yes | [`.github/dependabot.yml`](../../.github/dependabot.yml) |
| `npm audit --omit=dev --audit-level=high` in CI | Yes | [`scripts/audit-production.mjs`](../../scripts/audit-production.mjs), [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) |
| CI: lint, tests, `tsc`, worker build, wrangler dry-run | Yes | same workflow |
| Isolated no-egress secrets-flow CI | Yes on `main` | [`.github/workflows/no-egress.yml`](../../.github/workflows/no-egress.yml), [`deploy/airgap/`](../../deploy/airgap/). **Done on `main`:** [#204](https://github.com/matebenyovszky/agentplaybooks/pull/204) |
| CLI npm trusted publishing / OIDC provenance | Yes | [`.github/workflows/publish-cli.yml`](../../.github/workflows/publish-cli.yml) (`id-token: write`; `--provenance` is intentionally omitted, npm attests automatically) |
| SAST (CodeQL) | Yes on `main` | [`.github/workflows/codeql.yml`](../../.github/workflows/codeql.yml). **Done on `main`:** [#205](https://github.com/matebenyovszky/agentplaybooks/pull/205). No Semgrep |
| CycloneDX SBOM | Yes on `main` | [`.github/workflows/sbom.yml`](../../.github/workflows/sbom.yml), [`docs/security/supply-chain.md`](./supply-chain.md). **Done on `main`:** [#205](https://github.com/matebenyovszky/agentplaybooks/pull/205) |
| Cosign of SBOM blobs on `cli-v*` tags | Yes on `main` | [`docs/security/supply-chain.md`](./supply-chain.md). No signed container **registry** publish |
| `SECURITY.md`, incident runbook | Yes on `main` | [`SECURITY.md`](../../SECURITY.md), [`docs/security/incident-runbook.md`](./incident-runbook.md). **Done on `main`:** [#205](https://github.com/matebenyovszky/agentplaybooks/pull/205) (runbook), [#207](https://github.com/matebenyovszky/agentplaybooks/pull/207) (GitHub private vulnerability reporting is the only contact; there is no security email). Maintainer review is best-effort; 24/72h clocks are operator duties, not reporter SLAs |
| Encrypted on-prem backup / restore + empty-machine drill | Yes on `main` | [`docs/self-host/backup-restore.md`](../self-host/backup-restore.md), [`scripts/self-host/backup.sh`](../../scripts/self-host/backup.sh), [`.github/workflows/self-host-restore-drill.yml`](../../.github/workflows/self-host-restore-drill.yml). **Done on `main`:** [#203](https://github.com/matebenyovszky/agentplaybooks/pull/203). Master key is still stored separately; hash-chain verify in the drill is conditional until [#202](https://github.com/matebenyovszky/agentplaybooks/pull/202) |

Lockfiles (`package-lock.json`, `packages/cli/package-lock.json`) are the reproducible-install input.

## 11. Known gaps

Honest list for the supplier assessment. Status follows `main` as of 2026-10-25. **Folyamatban / In progress** rows are still-open PRs; **Done on `main`** rows keep the merged PR link.

1. **No KMS / HSM.** The master key is a process environment variable.
2. **No key rotation with re-encryption.** Changing the master key is vault data loss.
3. **No application-level MFA.** MFA is IdP-only (e.g. Entra conditional access).
4. **No auditor role in code.** Human RBAC: owner \| editor. Audit read is owner-level. **Folyamatban / In progress:** [#202](https://github.com/matebenyovszky/agentplaybooks/pull/202).
5. **No SAML SSO.** OIDC/OAuth via GoTrue if the customer enables it.
6. **Audit: no export, retention, or hash chain on `main`.** Skills / memory / canvas writes are not logged. **Folyamatban / In progress** (export, syslog/SIEM, retention, hash chain): [#202](https://github.com/matebenyovszky/agentplaybooks/pull/202).
7. **`SECURITY.md` and 24/72h / 1-month incident runbook are on `main`.** **Done on `main`:** [#205](https://github.com/matebenyovszky/agentplaybooks/pull/205) — [`SECURITY.md`](../../SECURITY.md), [`docs/security/incident-runbook.md`](./incident-runbook.md). GitHub private vulnerability reporting is the only security contact (**Done on `main`:** [#207](https://github.com/matebenyovszky/agentplaybooks/pull/207)); there is no security email. Maintainer review is best-effort. The 24/72h / 1-month clocks remain operator duties under 418/2024. § 77, not a reporter SLA. NKI notification remains the customer's process — **jogi ellenőrzés szükséges**.
8. **On-prem backup / restore runbook and empty-machine drill are on `main`.** **Done on `main`:** [#203](https://github.com/matebenyovszky/agentplaybooks/pull/203) — [`docs/self-host/backup-restore.md`](../self-host/backup-restore.md), [`scripts/self-host/backup.sh`](../../scripts/self-host/backup.sh), [`scripts/self-host/restore-drill.sh`](../../scripts/self-host/restore-drill.sh), [`.github/workflows/self-host-restore-drill.yml`](../../.github/workflows/self-host-restore-drill.yml). Archives are AES-256-CBC; `SECRETS_ENCRYPTION_KEY` is never in the archive. Playbook snapshots still do not include vault values. Hash-chain verify in the drill stays optional until [#202](https://github.com/matebenyovszky/agentplaybooks/pull/202).
9. **CodeQL, CycloneDX SBOMs, and cosign of SBOM blobs are on `main`.** **Done on `main`:** [#205](https://github.com/matebenyovszky/agentplaybooks/pull/205) — [`.github/workflows/codeql.yml`](../../.github/workflows/codeql.yml), [`.github/workflows/sbom.yml`](../../.github/workflows/sbom.yml), [`docs/security/supply-chain.md`](./supply-chain.md). Dependabot + production npm audit + CLI provenance remain. There is still no signed container **registry** publish.
10. **Self-host mTLS via trusted proxy is on `main`.** **Done on `main`:** [#201](https://github.com/matebenyovszky/agentplaybooks/pull/201) — `MTLS_MODE=proxy`, [`public/docs/self-hosted-mtls.md`](../../public/docs/self-hosted-mtls.md), [`deploy/self-host/docker-compose.mtls.yml`](../../deploy/self-host/docker-compose.mtls.yml). Node still does not terminate TLS; without a terminator the default stays fail-closed.
11. **Isolated no-egress CI evidence is on `main`.** **Done on `main`:** fonts [#200](https://github.com/matebenyovszky/agentplaybooks/pull/200) (`next/font/local`); secrets-flow CI [#204](https://github.com/matebenyovszky/agentplaybooks/pull/204) — [`.github/workflows/no-egress.yml`](../../.github/workflows/no-egress.yml), [`deploy/airgap/`](../../deploy/airgap/). Production compose is still app-only. `npm ci` and base-image pulls happen before isolation. `use_secret` still leaves the network unless destinations are pinned.
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
| Log retention, SIEM, NKI incident reporting | Audit API + [`docs/security/incident-runbook.md`](./incident-runbook.md) | 24 / 72 h / 1 month process |
| Backup, RPO/RTO | [`docs/self-host/backup-restore.md`](../self-host/backup-restore.md) + encrypted archives + CI drill | Schedule, offsite copy, master-key custody, measured RTO |
| GDPR controller / processor | On self-host the customer is generally the controller — **jogi ellenőrzés szükséges** | DPIA if required |

Detailed mapping: [risk-assessment.md](./risk-assessment.md).

## 13. Source index

| Topic | Files |
|-------|-------|
| Crypto | `src/lib/crypto.ts`, `src/lib/crypto.test.ts` |
| mTLS | `src/lib/mtls.ts`, `src/lib/mtls.test.ts`, `supabase/migrations/20261010081252_secret_clients.sql`, `public/docs/self-hosted-mtls.md`, `deploy/self-host/docker-compose.mtls.yml` |
| Authz | `src/app/api/_shared/guards.ts`, `src/app/api/_shared/permissions.ts`, `src/app/api/_shared/auth.ts`, `permissions.md` |
| Audit | `src/app/api/_shared/audit.ts`, `src/app/api/playbooks/[guid]/audit/app.ts`, `supabase/migrations/20260819_audit_logs_secrets.sql` |
| Expiry / SSRF | `src/lib/secret-expiry.ts`, `src/lib/secret-destinations.ts`, `src/lib/mcp/federation.ts` |
| Self-host | `docker-compose.yml`, `Dockerfile`, `public/docs/self-hosting.md`, `src/app/fonts/Geist-Variable.woff2`, `deploy/airgap/`, `.github/workflows/no-egress.yml`, `docs/self-host/backup-restore.md`, `scripts/self-host/backup.sh`, `.github/workflows/self-host-restore-drill.yml` |
| SDLC | `.github/dependabot.yml`, `.github/workflows/ci.yml`, `.github/workflows/publish-cli.yml`, `.github/workflows/codeql.yml`, `.github/workflows/sbom.yml`, `.github/workflows/no-egress.yml`, `scripts/audit-production.mjs`, `SECURITY.md`, `docs/security/incident-runbook.md`, `docs/security/supply-chain.md` |
| Live inventory | `scripts/list-self-host-stack.mjs` |
