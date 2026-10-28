# AgentPlaybooks security whitepaper

**Version:** 2026-10-28 · **Source:** the `main` branch as of that date (includes merged [#200](https://github.com/matebenyovszky/agentplaybooks/pull/200), [#201](https://github.com/matebenyovszky/agentplaybooks/pull/201), [#202](https://github.com/matebenyovszky/agentplaybooks/pull/202), [#203](https://github.com/matebenyovszky/agentplaybooks/pull/203), [#204](https://github.com/matebenyovszky/agentplaybooks/pull/204), [#205](https://github.com/matebenyovszky/agentplaybooks/pull/205), [#207](https://github.com/matebenyovszky/agentplaybooks/pull/207), [#216](https://github.com/matebenyovszky/agentplaybooks/pull/216), [#220](https://github.com/matebenyovszky/agentplaybooks/pull/220)). Status convention: an item from a PR that is still open is marked **Folyamatban / In progress** and does not count as shipped until it merges; only merged security changes are counted.
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
| TB-3 Outbound proxy | `use_secret` and federated tools | The agent never sees the secret but chooses the destination; `allowed_hosts` + internal-address deny. One shared check with DNS resolution: **Done on `main`** ([#216](https://github.com/matebenyovszky/agentplaybooks/pull/216), [`src/lib/outbound-destination.ts`](../../src/lib/outbound-destination.ts)) |
| TB-4 mTLS | Hosted: `cf.tlsClientAuth`. Self-host: `MTLS_MODE=proxy` behind a trusted terminator | Node does not terminate TLS. Default without a terminator is fail-closed. **Done on `main`:** [#201](https://github.com/matebenyovszky/agentplaybooks/pull/201) |

Compose **does not** start a database. `docker-compose.yml` says so; bare Postgres is not enough because every route uses the Supabase Data API and Auth. See [`public/docs/self-hosting.md`](../../public/docs/self-hosting.md), [`docker-compose.yml`](../../docker-compose.yml).

The service role bypasses RLS. Authorization lives in application code: [`src/app/api/_shared/guards.ts`](../../src/app/api/_shared/guards.ts), [`supabase/README.md`](../../supabase/README.md).

## 4. Data flows and data classes

| Class | Where | Protection | Who |
|-------|-------|------------|-----|
| Secret plaintext | Memory only, during proxy/reveal | Never at rest | App process |
| Secret ciphertext | `secrets` table | AES-256-GCM, per-user HKDF | Owner/editor through the authorized API; direct RLS owner + service_role |
| Master key | Process env `SECRETS_ENCRYPTION_KEY` | 32-byte hex; no KMS | Operator |
| Playbook content | Postgres | Transport TLS is the customer's | owner / editor / API-key role |
| Audit | `audit_logs`, `audit_chain_checkpoints` | Per-playbook SHA-256 hash chain (unkeyed); no secret values | Playbook owner, auditor |
| API key | SHA-256 hash + prefix | Plaintext shown once | Owner |
| Invite token | SHA-256 hash, 72 h | [`src/lib/utils.ts`](../../src/lib/utils.ts) | — |
| mTLS client | SHA-256 fingerprint, secret names | Private key stays on the client | Owner |
| Portable snapshot | `playbook_snapshots` | SHA-256 digest; **not** vault values | Management API |
| Auth PII | Supabase Auth | Customer's Auth operations | — |

**Intentional egress (secret use):** agent → `POST /api/playbooks/:guid/secrets/proxy` or MCP `use_secret` → server-side decrypt → inject header → HTTP to the caller-supplied URL → **response only** back. The log stores the destination **hostname**, not the full URL. Since [#216](https://github.com/matebenyovszky/agentplaybooks/pull/216) (**Done on `main`**) the destination name is also resolved before sending and refused if any address is internal ([`src/lib/outbound-destination.ts`](../../src/lib/outbound-destination.ts)). Sources: [`src/app/api/playbooks/[guid]/secrets/app.ts`](../../src/app/api/playbooks/[guid]/secrets/app.ts), [`src/app/api/_shared/audit.ts`](../../src/app/api/_shared/audit.ts).

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

There is **no** app-level MFA (TOTP/WebAuthn): the app does not check the session's `aal`. MFA can be enforced at the IdP (Entra Conditional Access) — a customer control. There is **no** SAML; ROADMAP lists it in Phase 4.

**Human RBAC.** The central role model is `owner | editor | auditor` ([`src/lib/audit-access.ts`](../../src/lib/audit-access.ts), [`src/app/api/_shared/guards.ts`](../../src/app/api/_shared/guards.ts)). Editors can edit content, manage secrets and inspect API-key metadata. Key mutation, visibility, sharing and deletion remain owner-only. Auditors read audit evidence and playbook metadata without accessing secrets or copying content ([`permissions.md`](../../permissions.md)).

**Auditor role: done on `main`** ([#202](https://github.com/matebenyovszky/agentplaybooks/pull/202)). A collaborator can be invited as `auditor`, and a playbook API key can have role `auditor` (default permissions `audit:read`, `playbooks:read`). An auditor reads and exports the audit trail and sees playbook metadata only (name, description, visibility, dates, tags); no persona, skills, servers, or secrets, and no writes ([`src/lib/audit-access.ts`](../../src/lib/audit-access.ts), [`supabase/migrations/20261024120000_audit_logs_compliance.sql`](../../supabase/migrations/20261024120000_audit_logs_compliance.sql)). Tests: [`tests/api/audit-role.test.ts`](../../tests/api/audit-role.test.ts).

**API-key roles.** `viewer`, `coworker`, `proposer`, `admin`, `auditor` ([`src/app/api/[[...route]]/route.ts`](../../src/app/api/[[...route]]/route.ts) `API_KEY_ROLES`, [`src/components/playbook/ApiKeyManager.tsx`](../../src/components/playbook/ApiKeyManager.tsx)). Permission strings: [`src/app/api/_shared/permissions.ts`](../../src/app/api/_shared/permissions.ts) `grantsPermission`. The role is validated on creation; the `permissions` array is stored as sent, without checking it against known strings. `expires_at` is optional.

Expired or inactive keys are rejected at lookup. Since [#227](https://github.com/matebenyovszky/agentplaybooks/pull/227), each authenticated request checks account activity: a banned or deleted account's API keys, sessions and mTLS access are refused, including when the check fails. Operators can revoke credentials with the service-role `revoke_account_credentials` function; there is no instance-admin UI ([`src/app/api/_shared/account-status.ts`](../../src/app/api/_shared/account-status.ts), [`scripts/self-host/offboard-user.py`](../../scripts/self-host/offboard-user.py)).

`/api/mcp/manage` treats any valid Supabase session JWT as permission `full`; OAuth scopes are not checked ([`src/app/api/mcp/manage/route.ts`](../../src/app/api/mcp/manage/route.ts)).

**Done on `main` ([#216](https://github.com/matebenyovszky/agentplaybooks/pull/216)) — who may route or expose secrets:**

- Only an owner or editor session may enable `allow_api_key_reveal` or widen a secret's `allowed_hosts`. An API key cannot enable reveal, and may only narrow `allowed_hosts`, never widen or clear it (REST and MCP `store_secret`) — [`src/app/api/playbooks/[guid]/secrets/app.ts`](../../src/app/api/playbooks/[guid]/secrets/app.ts), [`src/lib/secret-destinations.ts`](../../src/lib/secret-destinations.ts) `narrowsAllowedHosts`.
- Writing an MCP server config that references vault secrets needs the playbook owner or a key with `secrets:read` (REST catch-all, MCP `create_mcp_server` / `update_mcp_server`, `/api/mcp/config/:id`) — [`src/app/api/_shared/federation-secrets.ts`](../../src/app/api/_shared/federation-secrets.ts) `configReferencesSecrets`, `userMayRouteSecrets`.
- A server marked `access: "public"` that references vault secrets is no longer callable anonymously (`anonymousMayCall`).
- Public MCP listings withhold header values and URL query strings ([`src/lib/mcp/public-transport-config.ts`](../../src/lib/mcp/public-transport-config.ts)).
- A playbook-scoped API key cannot make a playbook public or unlisted (MCP `update_playbook`, [`src/app/api/mcp/[guid]/route.ts`](../../src/app/api/mcp/[guid]/route.ts)).
- Private-instance switch: `ALTER DATABASE postgres SET agentplaybooks.private_instance = 'on'` makes a trigger refuse any visibility other than `private`, so nothing is readable without signing in. On the official self-hosted Supabase image the `postgres` role cannot set this parameter: run the statement as `supabase_admin` (`psql -U supabase_admin`), then restart PostgREST so its pooled connections pick it up. Existing public playbooks must be set private by hand ([`supabase/migrations/20261025140000_private_instance.sql`](../../supabase/migrations/20261025140000_private_instance.sql), [`public/docs/self-hosting.md`](../../public/docs/self-hosting.md)).

## 7. Audit logging

One table: `audit_logs` (renamed from `mcp_proxy_audit_logs`) — [`supabase/migrations/20260819_audit_logs_secrets.sql`](../../supabase/migrations/20260819_audit_logs_secrets.sql). Operator guide: [`public/docs/audit-logs.md`](../../public/docs/audit-logs.md).

**Recorded on `main`.** Vault operations: `secret.create`, `secret.rotate`, `secret.update`, `secret.delete`, `secret.reveal`, `secret.use`, `secret.list`, `secret.client_create`, `secret.client_revoke`, `secret.oauth_exchange` — [`src/lib/supabase/types.ts`](../../src/lib/supabase/types.ts) `SECRET_AUDIT_OPERATIONS`. Federated MCP calls. `audit.retention_purge`. Status: `success` \| `denied` \| `error`. A refusal is an event.

Rule: no secret value, full URL or API key in the row. Since [#227](https://github.com/matebenyovszky/agentplaybooks/pull/227), plaintext reveal/resolve requires a successful audit write; an audit failure withholds the value. Other audit writes remain fail-open; SIEM forwarding is a separate best-effort operation ([`src/app/api/_shared/audit.ts`](../../src/app/api/_shared/audit.ts)).

**Hash chain — Done on `main`** ([#202](https://github.com/matebenyovszky/agentplaybooks/pull/202)). A database trigger gives each row `prev_hash` and `hash` (SHA-256 of the row's canonical JSON), one chain per playbook. UPDATE is refused. Retention writes a checkpoint to `audit_chain_checkpoints`, so the remaining chain still verifies. Check it with `GET /api/playbooks/:guid/audit/verify` or [`scripts/verify-audit-hash-chain.ts`](../../scripts/verify-audit-hash-chain.ts) — [`supabase/migrations/20261024120000_audit_logs_compliance.sql`](../../supabase/migrations/20261024120000_audit_logs_compliance.sql), [`src/lib/audit-chain.ts`](../../src/lib/audit-chain.ts). The chain is **unkeyed** SHA-256: anyone with write access to the database can edit a row and recompute every later hash. It shows edits made by someone without that access, or edits that differ from a copy held elsewhere (syslog / SIEM). It is not a signature.

**Read and export — Done on `main`** ([#202](https://github.com/matebenyovszky/agentplaybooks/pull/202)). `GET /api/playbooks/:guid/audit` (legacy `GET /api/mcp/audit/:guid`), JSON limit ≤ 500; `GET /api/playbooks/:guid/audit/export?format=json|jsonl|csv`, up to 10 000 rows; filters `operation` (or `secret.` prefix) and `secret=` name — [`src/app/api/playbooks/[guid]/audit/app.ts`](../../src/app/api/playbooks/[guid]/audit/app.ts). Owner or auditor. A playbook API key reads only with role `auditor`; a user API key needs `audit:read` or `playbooks:read`.

**Forwarding — Done on `main`, off by default** ([#202](https://github.com/matebenyovszky/agentplaybooks/pull/202)). `AUDIT_SYSLOG_URL`: RFC 5424 over `udp://`, `tcp://` or `tls://`. `AUDIT_SIEM_WEBHOOK_URL`: HTTPS POST signed with HMAC-SHA256 (`AUDIT_SIEM_WEBHOOK_SECRET`, at least 32 random bytes). Three attempts with backoff, then the forwarded copy is dropped and the failure goes to the server log. There is no outbox: a SIEM outage longer than the retries loses forwarded copies (the database row stays) — [`src/app/api/_shared/audit-forward.ts`](../../src/app/api/_shared/audit-forward.ts). Only rows written by the application are forwarded.

**Retention — Done on `main`** ([#202](https://github.com/matebenyovszky/agentplaybooks/pull/202)). Default: keep forever. `AUDIT_RETENTION_DAYS` plus `POST /api/cron/audit-purge` (Bearer `AUDIT_CRON_SECRET` or `CRON_SECRET`) — the operator must schedule the call ([`src/app/api/cron/audit-purge/route.ts`](../../src/app/api/cron/audit-purge/route.ts)). The owner can also purge one playbook with `POST /api/playbooks/:guid/audit/purge` and `{ days }`. A purge removes a chain prefix, writes a checkpoint and an `audit.retention_purge` row.

**Tamper resistance — Done on `main`** ([#216](https://github.com/matebenyovszky/agentplaybooks/pull/216), [`supabase/migrations/20261025124500_audit_logs_tamper_resistance.sql`](../../supabase/migrations/20261025124500_audit_logs_tamper_resistance.sql)):

- `audit_logs` and `audit_chain_checkpoints` have no foreign keys. Before, `ON DELETE CASCADE` erased the trail of a deleted playbook (and of a deleted account, through its playbooks), and deleting an MCP server erased the rows of its calls and broke the chain.
- DELETE on `audit_logs` is refused except inside `purge_audit_logs` (a transaction-local flag). TRUNCATE is refused on both tables. Checkpoints cannot be updated or deleted.
- `anon`, `authenticated` and `service_role` lose UPDATE, DELETE and TRUNCATE on both tables.
- A database superuser can still disable triggers. External syslog / SIEM forwarding is the control that makes such an edit detectable.

Tests: [`tests/audit-tamper-resistance-db.test.ts`](../../tests/audit-tamper-resistance-db.test.ts).

**Configuration changes — Done on `main`** ([#216](https://github.com/matebenyovszky/agentplaybooks/pull/216), [`supabase/migrations/20261025130000_audit_config_changes.sql`](../../supabase/migrations/20261025130000_audit_config_changes.sql)). Triggers record `playbook.create` / `update` / `visibility` / `delete`, `skill.create` / `update` / `delete`, `mcp_server.create` / `update` / `delete`, `api_key.create` / `update` / `rotate` / `revoke` / `delete`, `collaborator.invite` / `accept` / `update` / `remove`. Being triggers, they cover every write path, including direct Data API writes. `target` names the object and the changed columns. Values are recorded only for access-control columns (`visibility`, `role`, `permissions`, `is_active`, `expires_at`, and a server's `transport_type`); instructions, skill bodies, key hashes and invite hashes are not copied. The actor comes from the `x-apb-actor` header, set by the app after it authenticated the caller ([`src/lib/audit-context.ts`](../../src/lib/audit-context.ts), [`src/app/api/_shared/auth.ts`](../../src/app/api/_shared/auth.ts)) and trusted only on `service_role` requests; otherwise the JWT `sub`; otherwise `system` and the database role. Tests: [`tests/audit-config-changes-db.test.ts`](../../tests/audit-config-changes-db.test.ts), [`tests/lib/audit-context.test.ts`](../../tests/lib/audit-context.test.ts).

**Still open:**

- Skill, memory and canvas writes are recorded by database triggers ([#216](https://github.com/matebenyovszky/agentplaybooks/pull/216), [#222](https://github.com/matebenyovszky/agentplaybooks/pull/222)). `memory_history` remains separate version history. Account-level user API keys, sign-ins and audit reads/exports are not covered.
- Rows written by the triggers are not forwarded to syslog / SIEM; the forwarder only sends rows the application writes.
- No source IP or user-agent column.
- Plaintext reveal/resolve fails closed on audit failure; other application audit writes remain fail-open.

## 8. Secret expiry and revocation

| Mechanism | Behaviour | Source |
|-----------|-----------|--------|
| Secret `expires_at` | Proxy, federation, API-key reveal: rejected. Owner can still read in the dashboard to replace it | [`src/lib/secret-expiry.ts`](../../src/lib/secret-expiry.ts) |
| Timezone | `expires_at` without a timezone is rejected | `expiresAtInput()` |
| mTLS client | `is_active=false` (revoke), own `expires_at` | [`src/app/api/playbooks/[guid]/secret-clients/app.ts`](../../src/app/api/playbooks/[guid]/secret-clients/app.ts) |
| API key | `is_active` + `expires_at` at lookup | [`src/app/api/_shared/auth.ts`](../../src/app/api/_shared/auth.ts) |
| Destination | `allowed_hosts`; `SECRETS_REQUIRE_ALLOWED_HOSTS=true` makes pinning mandatory. **Done on `main`** ([#216](https://github.com/matebenyovszky/agentplaybooks/pull/216)): the bundled [`docker-compose.yml`](../../docker-compose.yml) defaults it to `true` | [`src/lib/secret-destinations.ts`](../../src/lib/secret-destinations.ts) |
| SSRF (before #216) | Private/link-local/metadata hosts denied on proxy and federation | [`src/app/api/playbooks/[guid]/secrets/app.ts`](../../src/app/api/playbooks/[guid]/secrets/app.ts), [`src/lib/mcp/federation.ts`](../../src/lib/mcp/federation.ts) `assertSafeRemoteUrl` |
| SSRF (**Done on `main`**, [#216](https://github.com/matebenyovszky/agentplaybooks/pull/216)) | One check for `use_secret`, the secrets proxy and federation: every internal IPv4/IPv6 range, including `::ffff:` hex forms, NAT64, 6to4 and CGNAT, plus single-label and internal names. In Node the name is resolved before sending and refused if any address is internal (`OUTBOUND_DNS_CHECK`, default on); on Cloudflare the runtime's `global_fetch_strictly_public` does this. Residual: DNS rebinding between check and connect — use a network egress policy | [`src/lib/outbound-destination.ts`](../../src/lib/outbound-destination.ts), [`tests/lib/outbound-destination.test.ts`](../../tests/lib/outbound-destination.test.ts) |
| Redirects (**Done on `main`**, [#216](https://github.com/matebenyovszky/agentplaybooks/pull/216)) | Federation fetches with `redirect: "manual"`; a 3xx is refused (`UPSTREAM_REDIRECT`) | [`src/lib/mcp/federation.ts`](../../src/lib/mcp/federation.ts) `timedFetch` |
| Federation pinning (**Done on `main`**, [#216](https://github.com/matebenyovszky/agentplaybooks/pull/216)) | `allowed_hosts` is also checked against `auth.token_url` and OpenAPI `servers`; a spec whose base URL is unknown blocks pinned secrets | [`src/app/api/_shared/federation-secrets.ts`](../../src/app/api/_shared/federation-secrets.ts) `serverDestinations` |

Tests: [`tests/api/secrets-expiry.test.ts`](../../tests/api/secrets-expiry.test.ts). No background job purges expired rows.

## 9. Self-host and no-egress

**What we can claim.** The [`Dockerfile`](../../Dockerfile) is multi-stage, non-root, `NEXT_TELEMETRY_DISABLED=1`, healthcheck on `:3000`. [`docker-compose.yml`](../../docker-compose.yml) starts one `app` service (`${APP_PORT:-3000}:3000`). Legal copy states no analytics/advertising/tracking cookies ([`src/lib/legal-copy.ts`](../../src/lib/legal-copy.ts)). Isolated no-egress CI runs the secrets flow on an `internal: true` Docker network with a DNS sink and fails on any outbound packet — [`.github/workflows/no-egress.yml`](../../.github/workflows/no-egress.yml), [`deploy/airgap/`](../../deploy/airgap/). **Done on `main`:** [#204](https://github.com/matebenyovszky/agentplaybooks/pull/204). `NO_EGRESS=true` disables optional MCP-registry search unless `MCP_REGISTRY_URL` is an internal mirror.

**What we cannot claim as a default “air-gapped / no-egress” product.**

1. Production [`docker-compose.yml`](../../docker-compose.yml) still does not include the Supabase stack. The no-egress proof uses a separate [`deploy/airgap/docker-compose.yml`](../../deploy/airgap/docker-compose.yml).
2. Build fonts: `next/font/local` Geist / Geist Mono woff2 — [`src/app/layout.tsx`](../../src/app/layout.tsx), [`src/app/fonts/Geist-Variable.woff2`](../../src/app/fonts/Geist-Variable.woff2). **Done on `main`:** [#200](https://github.com/matebenyovszky/agentplaybooks/pull/200). The build no longer fetches Google Fonts. `npm ci` and base-image pulls still happen **before** the no-egress job isolates the network.
3. Isolated-network E2E proving zero outbound packets at **runtime** is on `main`. **Done on `main`:** [#204](https://github.com/matebenyovszky/agentplaybooks/pull/204).
4. CSP is enforced and includes a custom Auth origin from `NEXT_PUBLIC_SUPABASE_URL` ([`src/lib/security-headers.ts`](../../src/lib/security-headers.ts), [#219](https://github.com/matebenyovszky/agentplaybooks/pull/219)). `connect-src` is not a network egress policy.
5. `use_secret` / federation **intentionally** make outbound HTTP to customer-chosen destinations unless `allowed_hosts` / `SECRETS_REQUIRE_ALLOWED_HOSTS=true` pin them (the air-gap job uses an in-network echo host). Since [#216](https://github.com/matebenyovszky/agentplaybooks/pull/216) (**Done on `main`**) the compose default is `true` — see [`public/docs/self-hosting.md`](../../public/docs/self-hosting.md).
6. mTLS on plain Docker/Node without a terminator stays fail-closed. Trusted-proxy mode (`MTLS_MODE=proxy`) is on `main`. **Done on `main`:** [#201](https://github.com/matebenyovszky/agentplaybooks/pull/201).

A customer production no-egress goal is still their network isolation plus `NO_EGRESS=true` and `SECRETS_REQUIRE_ALLOWED_HOSTS=true`. The **No egress** workflow measures the air-gap fixture, not every operator compose.

HTTP headers (HSTS, `X-Frame-Options: DENY`, nosniff, Permissions-Policy): [`src/lib/security-headers.ts`](../../src/lib/security-headers.ts), [`next.config.ts`](../../next.config.ts). CSP is enforced; inline scripts and eval are still allowed.

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
| Encrypted on-prem backup / restore + empty-machine drill | Yes on `main` | [`docs/self-host/backup-restore.md`](../self-host/backup-restore.md), [`scripts/self-host/backup.sh`](../../scripts/self-host/backup.sh), [`.github/workflows/self-host-restore-drill.yml`](../../.github/workflows/self-host-restore-drill.yml). **Done on `main`:** [#203](https://github.com/matebenyovszky/agentplaybooks/pull/203). Master key is still stored separately. The drill runs the hash-chain verifier when it is present; [`scripts/verify-audit-hash-chain.ts`](../../scripts/verify-audit-hash-chain.ts) is on `main` since [#202](https://github.com/matebenyovszky/agentplaybooks/pull/202) |

Lockfiles (`package-lock.json`, `packages/cli/package-lock.json`) are the reproducible-install input.

## 11. Known gaps

Honest list for the supplier assessment. Status follows `main` as of 2026-10-28. **Folyamatban / In progress** would mark items from still-open PRs (only merged security changes are counted); **Done on `main`** rows keep the merged PR link.

1. **No KMS / HSM.** The master key is a process environment variable.
2. **No key rotation with re-encryption.** Changing the master key is vault data loss.
3. **No application-level MFA.** The app does not check the session's `aal`. MFA is IdP-only (e.g. Entra Conditional Access).
4. **Auditor role: done on `main`.** **Done on `main`:** [#202](https://github.com/matebenyovszky/agentplaybooks/pull/202) — collaborator role `auditor` and API-key role `auditor`; audit read/export and playbook metadata only, no secrets, no content forks, no writes ([`src/lib/audit-access.ts`](../../src/lib/audit-access.ts)). Audit access is not content access; independently issued agent credentials must be revoked separately.
5. **No SAML SSO.** OIDC/OAuth via GoTrue if the customer enables it.
6. **Audit export, retention, hash chain and syslog/SIEM forwarding are on `main`.** **Done on `main`:** [#202](https://github.com/matebenyovszky/agentplaybooks/pull/202). Limits: the chain is unkeyed SHA-256; forwarding is off by default and drops a copy after 3 attempts (no outbox); retention needs an operator-scheduled call. **Done on `main`:** [#216](https://github.com/matebenyovszky/agentplaybooks/pull/216) — the trail survives deleting a playbook, server or account; DELETE / TRUNCATE refused; configuration changes recorded by triggers. Memory and canvas writes are also recorded (#222). Still open: user API keys, sign-ins and audit reads are not recorded; trigger-written rows are not forwarded; no source IP / user-agent; reveal/resolve audit writes fail closed; other audit writes remain fail-open.
7. **`SECURITY.md` and 24/72h / 1-month incident runbook are on `main`.** **Done on `main`:** [#205](https://github.com/matebenyovszky/agentplaybooks/pull/205) — [`SECURITY.md`](../../SECURITY.md), [`docs/security/incident-runbook.md`](./incident-runbook.md). GitHub private vulnerability reporting is the only security contact (**Done on `main`:** [#207](https://github.com/matebenyovszky/agentplaybooks/pull/207)); there is no security email. Maintainer review is best-effort. The 24/72h / 1-month clocks remain operator duties under 418/2024. § 77, not a reporter SLA. NKI notification remains the customer's process — **jogi ellenőrzés szükséges**.
8. **On-prem backup / restore runbook and empty-machine drill are on `main`.** **Done on `main`:** [#203](https://github.com/matebenyovszky/agentplaybooks/pull/203) — [`docs/self-host/backup-restore.md`](../self-host/backup-restore.md), [`scripts/self-host/backup.sh`](../../scripts/self-host/backup.sh), [`scripts/self-host/restore-drill.sh`](../../scripts/self-host/restore-drill.sh), [`.github/workflows/self-host-restore-drill.yml`](../../.github/workflows/self-host-restore-drill.yml). Since [#227](https://github.com/matebenyovszky/agentplaybooks/pull/227), AES-256-CBC/PBKDF2 archives are authenticated by a separately derived HMAC-SHA256 key and verified before decryption. Legacy unsealed archives require `BACKUP_ALLOW_UNSEALED=1`. `--no-encrypt` remains an operator choice. `SECRETS_ENCRYPTION_KEY` is never in the archive. Playbook snapshots still do not include vault values. The drill runs the hash-chain verifier, which is on `main` since [#202](https://github.com/matebenyovszky/agentplaybooks/pull/202).
9. **CodeQL, CycloneDX SBOMs, and cosign of SBOM blobs are on `main`.** **Done on `main`:** [#205](https://github.com/matebenyovszky/agentplaybooks/pull/205) — [`.github/workflows/codeql.yml`](../../.github/workflows/codeql.yml), [`.github/workflows/sbom.yml`](../../.github/workflows/sbom.yml), [`docs/security/supply-chain.md`](./supply-chain.md). Dependabot + production npm audit + CLI provenance remain. There is still no signed container **registry** publish.
10. **Self-host mTLS via trusted proxy is on `main`.** **Done on `main`:** [#201](https://github.com/matebenyovszky/agentplaybooks/pull/201) — `MTLS_MODE=proxy`, [`public/docs/self-hosted-mtls.md`](../../public/docs/self-hosted-mtls.md), [`deploy/self-host/docker-compose.mtls.yml`](../../deploy/self-host/docker-compose.mtls.yml). Node still does not terminate TLS; without a terminator the default stays fail-closed.
11. **Isolated no-egress CI evidence is on `main`.** **Done on `main`:** fonts [#200](https://github.com/matebenyovszky/agentplaybooks/pull/200) (`next/font/local`); secrets-flow CI [#204](https://github.com/matebenyovszky/agentplaybooks/pull/204) — [`.github/workflows/no-egress.yml`](../../.github/workflows/no-egress.yml), [`deploy/airgap/`](../../deploy/airgap/). Production compose is still app-only. `npm ci` and base-image pulls happen before isolation. `use_secret` still leaves the network unless destinations are pinned.
12. **No rate limiting** (ROADMAP).
13. **No external pentest** in this pack.
14. **Enforced CSP with remaining allowances.** Custom Auth origins are supported; `unsafe-inline` / `unsafe-eval` and the lack of report collection remain gaps.
15. **RLS is not the primary control for service_role**; authz is in the API layer.
16. **SSRF residual: DNS rebinding.** **Done on `main`:** [#216](https://github.com/matebenyovszky/agentplaybooks/pull/216) added one destination check with DNS resolution ([`src/lib/outbound-destination.ts`](../../src/lib/outbound-destination.ts)). A name whose answer changes between the check and the connection is not covered; a network egress policy for the app container is the control.
17. **API keys: expiry optional, permission strings not validated.** A key without `expires_at` never expires. The `permissions` array is stored as sent.
18. **`/api/mcp/manage` grants `full` to any valid Supabase JWT.** OAuth scopes are ignored.
19. **Account offboarding and activity checks: done on `main`.** [#227](https://github.com/matebenyovszky/agentplaybooks/pull/227): an inactive account's credentials are refused on its next request; operator credential revocation is available. There is no instance-admin UI.
20. **CORS fallback.** **Done on `main`:** [#220](https://github.com/matebenyovszky/agentplaybooks/pull/220) — with `ALLOWED_ORIGINS` unset, a self-hosted `NEXT_PUBLIC_APP_URL` is the only trusted origin; the hosted origins are no longer added. Remaining: if both `ALLOWED_ORIGINS` and `NEXT_PUBLIC_APP_URL` are unset, the allow-list is the hosted origins ([`src/app/api/_shared/hono.ts`](../../src/app/api/_shared/hono.ts)).
21. **No container hardening in compose.** No `read_only`, `cap_drop`, or image digest pinning; no image scanning or signing.
22. **Operational logging.** No access log; the app does not generate a request ID (it passes on an incoming `x-request-id` / `cf-ray`); no log-shipping guidance.
23. **No default-secret check for self-hosted Supabase.** The app does not detect the example JWT secret or keys of a Supabase install.
24. **Prompt-injection integrity.** Skill and persona changes need no approval. Any key that may write memory or skills may also approve proposals of that kind ([`src/app/api/playbooks/[guid]/proposals/reviewer.ts`](../../src/app/api/playbooks/[guid]/proposals/reviewer.ts)).
25. **Secret routing and exposure.** **Done on `main`:** [#216](https://github.com/matebenyovszky/agentplaybooks/pull/216) — an API key cannot enable reveal or widen `allowed_hosts`; MCP configs that reference secrets need the owner or `secrets:read`; `access: "public"` servers with secrets need a credential; public listings withhold header values and query strings; a playbook key cannot publish a playbook; the private-instance switch (run as `supabase_admin` on the official Supabase image, then restart PostgREST).

## 12. Responsibility split (short)

| Area | Product | Customer |
|------|---------|----------|
| Code, crypto, RBAC, vault, audit API | Yes | — |
| Classification, risk analysis, MK control selection | Template | IBF — **jogi ellenőrzés szükséges** |
| Entra SSO + MFA, network, TLS termination, physical protection | Config hooks | Operations |
| Log retention, SIEM, NKI incident reporting | Audit API, export, hash-chain verify, optional syslog / SIEM forwarding, retention endpoint + [`docs/security/incident-runbook.md`](./incident-runbook.md) | Schedule the purge, run the syslog / SIEM receiver, forward GoTrue's own log, 24 / 72 h / 1 month process |
| Backup, RPO/RTO | [`docs/self-host/backup-restore.md`](../self-host/backup-restore.md) + encrypted archives + CI drill | Schedule, offsite copy, master-key custody, measured RTO |
| GDPR controller / processor | On self-host the customer is generally the controller — **jogi ellenőrzés szükséges** | DPIA if required |

Detailed mapping: [risk-assessment.md](./risk-assessment.md).

## 13. Source index

| Topic | Files |
|-------|-------|
| Crypto | `src/lib/crypto.ts`, `src/lib/crypto.test.ts` |
| mTLS | `src/lib/mtls.ts`, `src/lib/mtls.test.ts`, `supabase/migrations/20261010081252_secret_clients.sql`, `public/docs/self-hosted-mtls.md`, `deploy/self-host/docker-compose.mtls.yml` |
| Authz | `src/app/api/_shared/guards.ts`, `src/app/api/_shared/permissions.ts`, `src/app/api/_shared/auth.ts`, `src/lib/audit-access.ts`, `src/app/api/_shared/federation-secrets.ts`, `src/lib/mcp/public-transport-config.ts`, `supabase/migrations/20261025140000_private_instance.sql`, `permissions.md` |
| Audit | `src/app/api/_shared/audit.ts`, `src/app/api/_shared/audit-forward.ts`, `src/lib/audit-chain.ts`, `src/lib/audit-context.ts`, `src/app/api/playbooks/[guid]/audit/app.ts`, `src/app/api/cron/audit-purge/route.ts`, `supabase/migrations/20260819_audit_logs_secrets.sql`, `supabase/migrations/20261024120000_audit_logs_compliance.sql`, `supabase/migrations/20261025124500_audit_logs_tamper_resistance.sql`, `supabase/migrations/20261025130000_audit_config_changes.sql` |
| Expiry / SSRF | `src/lib/secret-expiry.ts`, `src/lib/secret-destinations.ts`, `src/lib/outbound-destination.ts`, `src/lib/mcp/federation.ts` |
| Self-host | `docker-compose.yml`, `Dockerfile`, `public/docs/self-hosting.md`, `src/app/fonts/Geist-Variable.woff2`, `deploy/airgap/`, `.github/workflows/no-egress.yml`, `docs/self-host/backup-restore.md`, `scripts/self-host/backup.sh`, `.github/workflows/self-host-restore-drill.yml` |
| SDLC | `.github/dependabot.yml`, `.github/workflows/ci.yml`, `.github/workflows/publish-cli.yml`, `.github/workflows/codeql.yml`, `.github/workflows/sbom.yml`, `.github/workflows/no-egress.yml`, `scripts/audit-production.mjs`, `SECURITY.md`, `docs/security/incident-runbook.md`, `docs/security/supply-chain.md` |
| Live inventory | `scripts/list-self-host-stack.mjs` |

Self-host proxy mode additionally requires MTLS_PROXY_SHARED_SECRET to authenticate the proxy channel; forwarded IP headers alone are insufficient. See the updated mTLS runbook.
