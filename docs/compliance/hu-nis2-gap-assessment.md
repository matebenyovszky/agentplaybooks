# Hungary Cybersecurity Act / NIS2 gap assessment (AgentPlaybooks)

**Verified:** 2026-10-25 against `main` at `96e92fe`, plus the open branch `fix/p0-audit-secrets-private-instance` (pull request #216).  
**Scope:** the software as shipped (app, API, MCP, CLI, self-host/air-gap deploy, Supabase migrations, CI), and what an operator needs from it when self-hosting.  
**Not in scope as product gaps:** organisational duties of the operator (appointing an information-security officer, registering with the competent authority, classifying the electronic information system, filing incident reports). Those appear with status **operator**.

> **jogi ellenőrzés szükséges.** This document **helps meet** the technical half of a supplier / self-host assessment. It is **not legal advice**, **not a certification**, and **not a conformity assessment**. Hungarian control IDs in 7/2024. (VI. 24.) MK rendelet (as amended) are **not invented here**; rows use NIST SP 800-53 rev. 5 names. Exact decree numbering, whether a given operator is in scope, the security class (alap / jelentős / magas), and whether Commission Implementing Regulation (EU) 2024/2690 binds that operator must be decided by the operator’s counsel and information-security officer.

Related pack (architecture, crypto, RBAC, honest gaps): [`docs/security/whitepaper.md`](../security/whitepaper.md), [`docs/security/risk-assessment.md`](../security/risk-assessment.md). This file does not redo those family-level rows; it is the control-by-control evidence table those documents point at.

---

## Method

| Source | How it is used here |
|--------|---------------------|
| NIST SP 800-53 rev. 5 families, plus the specifically requested controls (AC, AU, IA, SC, SI, CM, CP, IR, RA, SA, SR, SC-8 / SC-13 / SC-28, AU-9 / AU-10 / AU-11, IA-2(1)) | Backbone of the table |
| NIS2 Directive (EU) 2022/2555 Art. 21(2)(a)–(j) and Art. 23 | Mapping column. Art. 21 letters are the risk-management measures; Art. 23 is reporting |
| Commission Implementing Regulation (EU) 2024/2690 Annex §§ 1–13 | Technical mapping baseline. The regulation’s personal scope is a defined list of digital entities; **whether a given self-host operator is a “relevant entity” under that regulation is jogi ellenőrzés szükséges** |
| 2024. évi LXIX. törvény (Cybersecurity Act) | Operator duties (classification 10. §, information-security officer 11. §, registration). Product rows do not guess further article numbers |
| 418/2024. (XII. 23.) Korm. rendelet 77. § | Verified: 24-hour first report, 72-hour incident notification, intermediate report on request, final report within one month of the 72-hour notification. Filing is an **operator** duty |
| 7/2024. (VI. 24.) MK rendelet, amended by 18/2024. (XII. 30.) MK rendelet (in force 2025-01-01) | Classification and the NIST-based catalogue. **Use the consolidated in-force text; do not treat this file as a substitute for that decree.** *jogi ellenőrzés szükséges* |

**Status values**

| Status | Meaning |
|--------|---------|
| **met** | The product half of the control is present, and this file cites a concrete path, test, or workflow that was opened and checked |
| **partial** | Product function exists, but a gap remains (or an operator step is still required to use it) |
| **missing** | The product does not provide the expected product half |
| **operator** | Entirely an organisational / hosting / HR / physical duty. Not counted as a product gap |

A row is **never** marked met because a whitepaper says so. Evidence is a repository path, test name, or workflow file.

**Already covered — cited, not redone**

| Work | What it already closed | Evidence |
|------|------------------------|----------|
| #200 | Self-host Geist fonts (`next/font/local`); build no longer fetches Google Fonts | `src/app/layout.tsx`, `src/app/fonts/Geist-Variable.woff2` |
| #201 | Self-host mTLS via trusted proxy (`MTLS_MODE=proxy`) | `src/lib/mtls.ts`, `src/lib/mtls.test.ts`, `public/docs/self-hosted-mtls.md`, `.github/workflows/self-host-mtls.yml` |
| #202 | Audit export, retention, hash chain, auditor role, optional SIEM/syslog | `supabase/migrations/20261024120000_audit_logs_compliance.sql`, `src/lib/audit-chain.ts`, `tests/api/audit-role.test.ts`, `tests/api/audit.test.ts`, `public/docs/audit-logs.md` |
| #203 | Encrypted on-prem backup/restore + empty-machine drill | `docs/self-host/backup-restore.md`, `scripts/self-host/backup.sh`, `.github/workflows/self-host-restore-drill.yml` |
| #204 | Isolated no-egress CI for the secrets flow | `.github/workflows/no-egress.yml`, `deploy/airgap/` |
| #205 | `SECURITY.md` (later tightened by #207), incident runbook, CodeQL, CycloneDX SBOM, cosign of SBOM blobs | `.github/workflows/codeql.yml`, `.github/workflows/sbom.yml`, `docs/security/supply-chain.md`, `docs/security/incident-runbook.md` |
| #206 | Hungarian supplier-assessment security pack | `docs/security/` |
| #207 | GitHub private vulnerability reporting is the only security contact (no email) | `SECURITY.md` |
| #209 | Verified self-hosted EU cybersecurity guide (blog) | `public/blog/self-hosted-eu-cybersecurity-requirements.md` |
| #216 (open, about to merge) | Audit tamper resistance (no cascade deletes; DELETE only via retention purge; immutable checkpoints); DB-trigger audit of playbooks / skills / mcp_servers / api_keys / collaborators; outbound destination allow-list and secret-exfiltration closes; private-instance switch | Verified on branch `fix/p0-audit-secrets-private-instance` (not on `main` until merge): supabase/migrations/20261025120000_audit_logs_tamper_resistance.sql, 20261025130000_audit_config_changes.sql, 20261025140000_private_instance.sql, src/lib/outbound-destination.ts, src/lib/audit-context.ts |

#216 **does** close skill **config** writes (create/update/delete of `skills` rows, without copying skill bodies). It **does not** close memory or canvas writes. Those remain a product gap on `main` and on that branch.

---

## Prioritized fix list

### P0 — do now (or already in #216)

| ID | Item | Product vs operator | This audit |
|----|------|---------------------|------------|
| P0-1 | Playbook API-key create defaults omitted `permissions` to `memory:read` **and** `memory:write`, so a raw `role: "viewer"` (or omitted role) key can write memory. The dashboard sends the correct presets; the API does not. Contradicts `permissions.md` (“Viewer … Cannot modify data”). | Product | [#218](https://github.com/matebenyovszky/agentplaybooks/pull/218) |
| P0-2 | CSP is `Content-Security-Policy-Report-Only` with `connect-src` hardcoded to `https://*.supabase.co`. XSS in the UI is not contained. | Product | [#219](https://github.com/matebenyovszky/agentplaybooks/pull/219) |
| P0-3 | Audit trail erased on playbook/account delete (FK cascade); audit_logs writable by API roles | Product | **#216** (20261025120000_audit_logs_tamper_resistance.sql on that branch) — do not redo |
| P0-4 | Secret exfiltration paths (redirects, public MCP credentials, API-key widening of allowed_hosts) | Product | **#216** (src/lib/outbound-destination.ts on that branch) — do not redo |
| P0-5 | App-level MFA (NIST **IA-2(1)** / NIS2 Art. 21(2)(j)) | Product missing; operator can enforce at the IdP | **Design note only** — not a rushed PR |
| P0-6 | KMS/HSM wrapping of `SECRETS_ENCRYPTION_KEY` and master-key re-encryption/rotation (NIST **SC-12** / **SC-13**) | Product missing; operator holds the env var | **Design note only** |

### P1 — next

| ID | Item | This audit |
|----|------|------------|
| P1-1 | Memory and canvas writes not in `audit_logs` (skill config writes land with #216) | [#222](https://github.com/matebenyovszky/agentplaybooks/pull/222) (DB trigger, metadata only, no bodies; **contains a migration**) |
| P1-2 | Self-host CORS: unset `ALLOWED_ORIGINS` keeps the hosted product origins trusted even when `NEXT_PUBLIC_APP_URL` is a private origin | [#220](https://github.com/matebenyovszky/agentplaybooks/pull/220) |
| P1-3 | Locale cookie `NEXT_LOCALE` lacks `SameSite` / conditional `Secure` | [#221](https://github.com/matebenyovszky/agentplaybooks/pull/221) |
| P1-4 | No application rate limiting (auth, `secret.use`, API-key create) | Design note — needs a measured limiter, not a one-line cap |
| P1-5 | Unsigned container image / no registry cosign (SBOM blobs are signed) | Design note — this repository does not publish a registry image; adding one is a release-process change. **No tags or publishing in this audit** |
| P1-6 | Audit rows omit source IP / user agent (would change the hash-chain canonical form) | Design note — coordinate with #216 follow-ups |
| P1-7 | SAML SSO | Design note — OIDC/Entra already exists |

### P2 — later

| ID | Item |
|----|------|
| P2-1 | Remove CSP `'unsafe-inline'` / `'unsafe-eval'` (needs nonce/hash work in Next.js) |
| P2-2 | Digest-pin `FROM node:24-alpine` and compose base images |
| P2-3 | External penetration test (operator or contracted) |
| P2-4 | Fail-closed SIEM forward (today best-effort, by design, so a down SIEM cannot take the vault down) |
| P2-5 | Connection-time DNS pinning after `OUTBOUND_DNS_CHECK` (TOCTOU; #216 documents this) |
| P2-6 | App idle-timeout beyond GoTrue `JWT_EXPIRY` |
| P2-7 | Independent WORM / external timestamp for the audit chain |

Large items (KMS/HSM, SAML, MFA) stay design notes. See [Design notes](#design-notes-not-rushed-prs).

This document: [#217](https://github.com/matebenyovszky/agentplaybooks/pull/217). Only [#222](https://github.com/matebenyovszky/agentplaybooks/pull/222) contains a Supabase migration. Rebase the code PRs onto `main` after #216 merges.

---

## NIS2 Art. 21(2) / IR 2024/2690 map (indicative)

IR 2024/2690 Annex numbering is used as a **technical** checklist. Applicability of that regulation to a given operator is *jogi ellenőrzés szükséges*.

| NIS2 Art. 21(2) | IR 2024/2690 Annex | NIST families in this table |
|-----------------|--------------------|------------------------------|
| (a) policies on risk analysis and information-system security | §§ 1–2 | PL, RA |
| (b) incident handling | § 3 | IR, AU |
| (c) business continuity, backup, disaster recovery, crisis management | § 4 | CP |
| (d) supply-chain security | § 5 | SR, SA |
| (e) security in acquisition, development and maintenance; vulnerability handling | § 6 | SA, SI, CM, MA |
| (f) policies and procedures to assess effectiveness | § 7 | CA |
| (g) basic cyber hygiene and training | § 8 | AT, SI, CM |
| (h) cryptography | § 9 | SC-12, SC-13, SC-28 |
| (i) human resources security, access-control policies, asset management | §§ 10–12 | PS, AC, CM |
| (j) MFA, secured communications, emergency communication | § 11 (access control) | IA-2(1), SC-8 |
| Art. 23 reporting | (IR Arts. 3+ specify significance for listed digital entities) | IR-6 |

Art. 21 all-hazards / physical: IR § 13 → PE (operator).

---

## Control-by-control table

Columns: **control** · **requirement summary** · **status** · **evidence** · **gap** · **fix priority**.

### PL / RA — policy and risk (NIS2 21(2)(a); IR §§ 1–2)

| Control | Requirement summary | Status | Evidence | Gap | Priority |
|---------|---------------------|--------|----------|-----|----------|
| PL-2 | System security plan / policy on the security of network and information systems | **operator** | Product input: `docs/security/whitepaper.md`, `docs/security/README.md`, `public/docs/self-hosting.md`. IR § 1.1.1 requires management-approved policy — that is the operator | Operator writes and approves the instance policy; the pack is input only | — |
| RA-3 | Risk assessment, treatment plan, residual-risk acceptance | **partial** | Template: `docs/security/risk-assessment.md`, `docs/security/risk-assessment.csv`. Tests: `tests/security-docs-pack.test.ts` (`records AES-256-GCM and the honest gaps instead of over-claiming`) | No in-app risk engine. Operator must complete the CSV, pick the security class, and accept residual risk. 7/2024 annex numbering is *jogi ellenőrzés szükséges* | P2 (process, not code) |
| PM-1 | Information-security programme, officer, budget | **operator** | Act LXIX **11. §**: the organisation’s leader designates the person responsible for the electronic information system. Not a software feature | Appoint the officer; register as required by the Act (*jogi ellenőrzés szükséges* for which entities and deadlines) | — |

### CA — assessment of measures (NIS2 21(2)(f); IR § 7)

| Control | Requirement summary | Status | Evidence | Gap | Priority |
|---------|---------------------|--------|----------|-----|----------|
| CA-2 | Independent / periodic assessment that measures are effective | **partial** | CI: `.github/workflows/ci.yml` (lint, `test:all`, `tsc`, worker build, wrangler dry-run, `audit:production`). CodeQL: `.github/workflows/codeql.yml`. Dependency review: `.github/workflows/dependency-review.yml` (`fail-on-severity: low`). No-egress: `.github/workflows/no-egress.yml`. Restore drill: `.github/workflows/self-host-restore-drill.yml`. No `continue-on-error` in `.github/workflows/` | No pentest report in this repository. No APM. Operator still authorizes the production system and commissions independent review | P2 pentest (operator) |

### AC — access control (NIS2 21(2)(i)(j); IR § 11)

| Control | Requirement summary | Status | Evidence | Gap | Priority |
|---------|---------------------|--------|----------|-----|----------|
| AC-2 | Account management (provision, review, disable) | **partial** | Human roles `owner \| editor \| auditor`: `src/lib/audit-access.ts` (`PLAYBOOK_ACCESS_ROLES`, `roleMayWrite`, `roleMayReadAudit`, `roleMayReadSecrets`). Tests: `tests/api/audit-role.test.ts`, `tests/api/collaborators.test.ts`. API-key roles: `src/app/api/[[...route]]/route.ts` `API_KEY_ROLES`. Invites hashed, 72h: `src/app/api/playbooks/[guid]/collaborators/route.ts`. Key expiry/revoke: `src/app/api/_shared/auth.ts` (`lookupPlaybookKey`). Private-instance switch: **#216** 20261025140000_private_instance.sql (on that branch) | Joiner/leaver is the operator’s IdP. No periodic access-review workflow in the app | P2 |
| AC-3 | Access enforcement | **partial** | `src/app/api/_shared/guards.ts`, `src/app/api/_shared/permissions.ts` `grantsPermission`, `src/app/api/_shared/auth.ts` `authorizePlaybookRequest`. RLS exists (`supabase/schema.sql`) but the app uses `service_role`; whitepaper §11 item 15 is accurate. Collaborators table: RLS on, no client policies (`supabase/migrations/20260720_add_playbook_collaboration.sql`) | Authorization is API-layer. Direct Data API with `service_role` bypasses RLS (operator must not leak that key) | P1 (operator key custody) |
| AC-6 | Least privilege | **partial** | Dashboard presets: `src/components/playbook/ApiKeyManager.tsx` `ROLE_PERMISSIONS` (viewer is read-only). Auditor cannot purge: `tests/api/audit.test.ts` (`does not let an auditor purge`). Secrets: `secrets:read` does not follow from `secrets:write` (`src/app/api/_shared/permissions.ts`) | **P0-1:** POST `/api/playbooks/:id/api-keys` uses `permissions \|\| (role === "auditor" ? … : ["memory:read", "memory:write"])` in `src/app/api/[[...route]]/route.ts`. `validateApiKey` gates non-admin keys on the **permissions array**, not the role label (`src/app/api/_shared/auth.ts`). A caller who omits `permissions` gets memory write | **P0** |
| AC-7 | Unsuccessful logon / lockout / rate limiting | **missing** | Documented gap: `docs/security/whitepaper.md` item 12, `public/docs/api-reference.md`. No app limiter in `src/app/api/` | Brute-force of email/password or API keys is an operator WAF/IdP problem today | **P1** design |
| AC-12 | Session termination | **partial** | Session is a JWT in `Authorization`, not cookies: `src/app/api/_shared/auth.ts` `getAuthenticatedUser`. Self-host fixture `JWT_EXPIRY=3600` in `deploy/airgap/airgap.env` | No in-app idle logout. Operator sets GoTrue JWT lifetime | P2 |
| AC-17 | Remote access | **operator** | Compose listens HTTP `:3000` (`docker-compose.yml`, `Dockerfile` `EXPOSE 3000`). TLS terminator is the operator. mTLS via proxy: #201 | Put a TLS terminator in front; do not expose `:3000` to untrusted networks | — |

### AU — audit and accountability (NIS2 21(2)(b)(f); IR § 3)

| Control | Requirement summary | Status | Evidence | Gap | Priority |
|---------|---------------------|--------|----------|-----|----------|
| AU-2 | Event logging (what is recorded) | **partial** | Vault: `src/app/api/_shared/audit.ts`, `src/lib/supabase/types.ts` `SECRET_AUDIT_OPERATIONS`. Federation: `federationAuditWriter`. Tests: `tests/api/audit.test.ts`, `tests/api/audit-secrets-not-logged.test.ts`. Config changes (playbooks, **skills**, MCP servers, API keys, collaborators): **#216** 20261025130000_audit_config_changes.sql (tests/audit-config-changes-db.test.ts on that branch) | **Memory and canvas writes are not logged** on `main` or #216. Skill *bodies* are not copied (intentional). Source IP / UA not stored | **P1** (memory/canvas); P1-6 IP/UA |
| AU-3 | Content of audit records (no secrets) | **met** | `redactAuditSecrets`, `sanitizeAuditTarget` in `src/app/api/_shared/audit.ts`. Test: `tests/api/audit-secrets-not-logged.test.ts`. #216 trigger copies only access-control columns, never key hashes or skill bodies | — | — |
| AU-9 | Protection of audit information | **partial** on `main`; **met** once #216 merges | Hash chain + UPDATE denied: `supabase/migrations/20261024120000_audit_logs_compliance.sql`, `src/lib/audit-chain.ts`, `tests/api/audit-compliance-migration.test.ts`. #216: drop FKs so deletes do not cascade; refuse DELETE except purge_audit_logs; immutable checkpoints; revoke UPDATE/DELETE/TRUNCATE from API roles (20261025120000_audit_logs_tamper_resistance.sql on that branch) | Until #216 merges, deleting a playbook erases its trail. No WORM / external timestamp (P2-7) | **P0** via #216 |
| AU-10 | Non-repudiation / tamper evidence | **partial** | Per-playbook SHA-256 chain, checkpoints on retention purge, `npm run audit:chain`, `/audit/verify`. Restore drill invokes the verifier: `scripts/self-host/verify-restore.ts`, `.github/workflows/self-host-restore-drill.yml` | A database administrator can rewrite tip + checkpoint. Chain is evidence, not independent proof | P2-7 |
| AU-11 | Audit retention | **met** | `purge_audit_logs` RPC; `AUDIT_RETENTION_DAYS`; `POST /api/cron/audit-purge`; owner purge. Tests: `tests/api/audit-purge-cron.test.ts`. Operator sets the period and the cron secret (`public/docs/self-hosting.md`) | Operator must schedule the cron. Unset keeps rows until a later purge (and, on `main`, until playbook delete — #216 stops that) | — |
| AU-12 | Audit generation (coverage of write paths) | **partial** | Vault and federation writers in process. #216 adds table triggers so Data API writes cannot skip config events (src/lib/audit-context.ts x-apb-actor, trusted only from service_role, on that branch) | Memory/canvas still skip the trail. SIEM/syslog is best-effort (`src/app/api/_shared/audit.ts` “A write never throws”) | **P1-1** |

### IA — identification and authentication (NIS2 21(2)(i)(j); IR § 11)

| Control | Requirement summary | Status | Evidence | Gap | Priority |
|---------|---------------------|--------|----------|-----|----------|
| IA-2 | Identification and authentication of users | **met** | Supabase Auth. Providers: `src/lib/auth-providers.ts` (`google`, `github`, `linkedin_oidc`, `azure`). Tests: `tests/lib/auth-providers.test.ts`. Login: `src/app/login/page.tsx`. Open-redirect guard: `src/lib/auth-redirect.ts`, `tests/lib/auth-redirect.test.ts`. Cookie session path removed: `src/app/api/_shared/auth.ts` comment + `getAuthenticatedUser` | Email/password remains available if the operator enables it in GoTrue | — |
| IA-2(1) | Multifactor authentication | **missing** (product). Operator compensating control: IdP MFA | No TOTP/WebAuthn/AAL2 in `src/`. Whitepaper §6. ROADMAP Phase 4 for SAML; MFA is not implemented | Email/password self-host has no second factor unless the operator disables that provider and forces OIDC+MFA | **P0** design |
| IA-5 | Authenticator management | **partial** | API keys hashed SHA-256, prefix stored, plaintext shown once: `src/lib/utils.ts` `hashApiKey`, create handler in `src/app/api/[[...route]]/route.ts`. CLI credentials `chmod 0o600`: `packages/cli/src/remote.js`. mTLS fingerprints: `supabase/migrations/20261010081252_secret_clients.sql`. Invite tokens hashed | Master vault key is a 64-hex env var with no rotation tooling (`docker-compose.yml` comment) | **P0-6** design |
| IA-8 | Identification of external (federated) users | **partial** | OIDC/OAuth via GoTrue as listed in `src/lib/auth-providers.ts`. Self-host Entra: `public/docs/self-hosting.md` `GOTRUE_EXTERNAL_AZURE_*` | **No SAML** | **P1** design |

### SC — system and communications protection (NIS2 21(2)(h)(j); IR §§ 9, 11)

| Control | Requirement summary | Status | Evidence | Gap | Priority |
|---------|---------------------|--------|----------|-----|----------|
| SC-7 | Boundary protection / outbound control | **partial** on `main`; stronger on #216 | Secrets `allowed_hosts`: `src/lib/secret-destinations.ts`, `src/lib/secret-destinations.test.ts`. SSRF deny on proxy: `src/app/api/playbooks/[guid]/secrets/app.ts`. Federation `assertSafeRemoteUrl`: `src/lib/mcp/federation.ts`. No-egress CI: `.github/workflows/no-egress.yml`, `tests/airgap-observer.test.ts`. #216: src/lib/outbound-destination.ts on that branch; compose default SECRETS_REQUIRE_ALLOWED_HOSTS=true | On `main`, `SECRETS_REQUIRE_ALLOWED_HOSTS` is off by default (`docker-compose.yml`). Secrets proxy still allows `http:` as well as `https:`. DNS TOCTOU remains (documented on #216) | P1 (http-only optional follow-up); P2 DNS pin |
| SC-8 | Transmission confidentiality | **partial** | HSTS, `X-Frame-Options: DENY`, nosniff: `src/lib/security-headers.ts`, `next.config.ts`, applied in `src/worker/api-dispatch.ts`, `src/worker/page-routing.ts`, `src/worker/probe-paths.ts`, `src/worker/public-html-snapshot.ts`. Test checks nosniff + frame options: `tests/worker-public-html-snapshot.test.ts` (`serves the requested locale with native security headers and no browser cache`). mTLS: `src/lib/mtls.ts` | App does not terminate TLS. CSP is Report-Only (P0-2). Locale cookie not `SameSite` (P1-3) | **P0** CSP; **P1** cookie; operator TLS |
| SC-12 | Cryptographic key establishment and management | **missing** | Master key: `src/lib/crypto.ts` `getMasterKeyHex()` from `SECRETS_ENCRYPTION_KEY`. Compose: rotating it makes existing secrets undecryptable | No KMS, no HSM, no key-version field, no re-encrypt job | **P0** design |
| SC-13 | Cryptographic protection | **partial** | AES-256-GCM, 12-byte IV, HKDF-SHA-256 per user, v2 AAD (`userId`, `playbookId`, `secretName`): `src/lib/crypto.ts`. Tests: `src/lib/crypto.test.ts` (`round-trips a secret for its owner`, `still decrypts existing v1 ciphertext`, `rejects a 64-character value that is not hexadecimal`). Backup archives AES-256-CBC: `scripts/self-host/backup.sh`, `docs/self-host/backup-restore.md` | Algorithms are sound; key *management* is SC-12 | — |
| SC-28 | Protection of information at rest | **partial** | Vault ciphertext in `secrets`. Playbook content, memory, canvas, audit metadata are not application-encrypted (rely on disk/volume encryption — operator). API keys stored as SHA-256 | Operator encrypts volumes / backups. Snapshots are not vault values (`docs/self-host/backup-restore.md`) | operator (volumes) |
| SC-23 | Session authenticity | **partial** | Bearer JWT validated with `getUser(token)`. CORS allow-list: `src/app/api/_shared/hono.ts` `resolveAllowedOrigins`, tests `src/app/api/_shared/hono.test.ts` | Unset `ALLOWED_ORIGINS` on a custom `NEXT_PUBLIC_APP_URL` still trusts hosted product origins | **P1-2** |

### SI — system and information integrity (NIS2 21(2)(e)(g); IR §§ 6–8)

| Control | Requirement summary | Status | Evidence | Gap | Priority |
|---------|---------------------|--------|----------|-----|----------|
| SI-2 | Flaw remediation | **partial** | Dependabot: `.github/dependabot.yml` (weekly, Europe/Budapest). `npm run audit:production` in `.github/workflows/ci.yml` via `scripts/audit-production.mjs`. CodeQL JS/TS + Python: `.github/workflows/codeql.yml`. Vulnerability intake: `SECURITY.md` (GitHub private reporting only) | No signed container registry. Maintainer review of reports is best-effort (not a 24h/72h SLA — those clocks are operator filings) | P1-5 image |
| SI-4 | System monitoring | **partial** | `audit_logs` + optional `AUDIT_SYSLOG_URL` / `AUDIT_SIEM_WEBHOOK_URL` (`public/docs/self-hosting.md`, `public/docs/audit-logs.md`). Healthcheck: `Dockerfile` `HEALTHCHECK` | No APM. Audit IP/UA not stored. SIEM is best-effort | P1-6; P2-4 |
| SI-7 | Software, firmware, and information integrity | **partial** | CLI npm trusted publishing: `.github/workflows/publish-cli.yml`. CycloneDX + cosign of SBOM blobs on `cli-v*` tags: `.github/workflows/sbom.yml`, `docs/security/supply-chain.md`. Image SBOM on tags, **not** a signed registry image. Dockerfile non-root `nextjs` uid 1001 | Unsigned runnable image. Base `FROM node:24-alpine` is tag-pinned, not digest-pinned | **P1-5**; P2-2 |
| SI-10 | Information input restrictions / XSS containment | **partial** | Attachment validator: `src/lib/attachment-validator.ts`. Skill file checks: `src/lib/skill-markdown.ts`. CLI refuses likely hard-coded credentials: `packages/cli/test/push-decision.test.js`, `packages/cli/src/agent-plugins.js` | CSP Report-Only (`src/lib/security-headers.ts` `Content-Security-Policy-Report-Only`). Policy still needs `'unsafe-inline'` `'unsafe-eval'` | **P0-2**; P2-1 |

### CM — configuration management (NIS2 21(2)(e)(i); IR §§ 6, 12)

| Control | Requirement summary | Status | Evidence | Gap | Priority |
|---------|---------------------|--------|----------|-----|----------|
| CM-2 | Baseline configuration | **partial** | `scripts/list-self-host-stack.mjs`, `npm run inventory:self-host`. Asset list: `docs/security/asset-inventory.md`. Tests: `tests/security-docs-pack.test.ts` | Operator must run the inventory against the live compose and pin images | — |
| CM-3 | Configuration change control | **partial** | Playbook/skill/MCP/API-key/collaborator change audit: **#216** triggers. Migrations auto-apply on merge: `.github/workflows/deploy-supabase.yml` (tests first, dry-run, then `db push`; no `continue-on-error`) | Memory/canvas still unaudited. Operator change windows for image rebuilds | **P1-1** |
| CM-6 | Configuration settings | **partial** | Documented env: `public/docs/self-hosting.md`, `docker-compose.yml`. Air-gap flags: `NO_EGRESS`, `SECRETS_REQUIRE_ALLOWED_HOSTS` | Hosted defaults are not always the self-host-safe defaults (CORS, allowed_hosts on `main`) | **P1-2**; #216 flips allowed_hosts default |
| CM-7 | Least functionality | **partial** | `NO_EGRESS=true` disables optional MCP-registry search unless `MCP_REGISTRY_URL` is an internal mirror. Air-gap compose: `deploy/airgap/docker-compose.yml`. Fonts local: #200 | Production `docker-compose.yml` is app-only (no bundled Supabase). Operator still supplies the data plane | — |

### CP — contingency (NIS2 21(2)(c); IR § 4)

| Control | Requirement summary | Status | Evidence | Gap | Priority |
|---------|---------------------|--------|----------|-----|----------|
| CP-2 | Contingency plan / crisis management | **operator** | Product runbook: `docs/self-host/backup-restore.md`, `docs/security/incident-runbook.md`. IR § 4.1.1 plan is the operator’s | Write RPO/RTO, crisis comms, and who files | — |
| CP-9 | Information-system backup | **met** (product capability) | Encrypted archives; master key never in the archive: `scripts/self-host/backup.sh`. Docs: `docs/self-host/backup-restore.md`. Tests: `tests/self-host-archive.test.ts`, `tests/self-host-restore-drill.test.ts` | Operator schedules, stores offsite, and holds the master key separately | — |
| CP-10 | Information-system recovery and reconstitution | **met** (product capability) | `scripts/self-host/restore.sh`, `scripts/self-host/restore-drill.sh`, `.github/workflows/self-host-restore-drill.yml` (PR/main path filters + weekly cron). Verifies playbook, decrypted secret, `audit_logs` count, storage | Operator must run drills on *their* hardware and record measured RTO | — |

### IR — incident response (NIS2 21(2)(b), Art. 23; 418/2024 77. §; IR § 3)

| Control | Requirement summary | Status | Evidence | Gap | Priority |
|---------|---------------------|--------|----------|-----|----------|
| IR-4 | Incident handling | **partial** | `docs/security/incident-runbook.md` (containment, evidence, roles). `SECURITY.md`. Audit export/verify for extracts | Some runbook sentences still read as if auditor/hash-chain/SIEM were future work; those shipped in #202. Operator owns detection on IdP/WAF/host | P2 (doc refresh; not a control gap) |
| IR-6 | Incident reporting | **operator** | Product helps assemble evidence (export, SBOM, GHSA). **418/2024. (XII. 23.) Korm. rendelet 77. §** (verified): 24-hour first report, 72-hour notification, intermediate on request, final within one month of the 72-hour notification, to the national CSIRT. NIS2 Art. 23 is the EU counterpart. The supplier does not file in the operator’s name (`SECURITY.md`) | Decide reportability; file; notify users of the service where the decree requires it (418/2024 80. § — *jogi ellenőrzés szükséges*) | — |

### SA / SR — acquisition, development, supply chain (NIS2 21(2)(d)(e); IR §§ 5–6)

| Control | Requirement summary | Status | Evidence | Gap | Priority |
|---------|---------------------|--------|----------|-----|----------|
| SA-11 | Developer security testing | **met** | `.github/workflows/ci.yml` steps: `release:check`, `prebuild`, `lint`, `docs:check`, `test:all`, `tsc --noEmit`, `audit:production`, `build:worker`, `wrangler deploy --dry-run`. Python: `.github/workflows/python-secrets.yml`. CLI tests in `test:all`. No `continue-on-error` | — | — |
| SR-3 | Supply-chain controls / provenance | **partial** | Lockfiles, Dependabot, npm provenance, CycloneDX, cosign of SBOM blobs (`docs/security/supply-chain.md`). MIT source | No signed container **registry** publish. Operator must compare SBOM to running images | **P1-5** |
| SR-4 | Provenance | **partial** | `@agentplaybooks/cli` trusted publishing (`.github/workflows/publish-cli.yml`). Cosign identity is the `sbom.yml` workflow at `refs/tags/cli-v*` | Image digest is not signed | **P1-5** |

### AT / PS / PE / MP / MA / PT — mostly operator

| Control | Requirement summary | Status | Evidence | Gap | Priority |
|---------|---------------------|--------|----------|-----|----------|
| AT-2 | Awareness and training (NIS2 21(2)(g); IR § 8) | **operator** | Operator docs exist (`public/docs/`, `docs/security/`). Training records are not a software feature | Role-based training and evidence | — |
| PS-4 | Personnel termination | **operator** | Product supports revoke key / disable Auth user / remove collaborator | Joiner/leaver process, IdP groups | — |
| PE-2 / PE-3 | Physical / environmental (IR § 13) | **operator** | Software; no data-centre controls | Room, hosting, utilities | — |
| MP-4 | Media protection | **partial** | Vault is ciphertext. Backup media handling is the operator’s (`docs/self-host/backup-restore.md`) | Encrypt and control backup media | — |
| MA-2 | Controlled maintenance | **partial** | Documented image rebuild (`public/docs/self-hosting.md`). Dependabot | Change windows | — |
| PT (GDPR 32/33) | PII processing, breach notice | **operator** | Self-host: operator is generally the controller — *jogi ellenőrzés szükséges*. Hosted privacy copy: `src/lib/legal-copy.ts` (no tracking cookies; contact is GitHub issues, no email). Account deletion: `src/app/api` delete-account path, `tests/api/delete-account.test.ts` | DPIA, residency, DPA if using the hosted service | — |

---

## Design notes (not rushed PRs)

### KMS / HSM and master-key rotation (P0-6, SC-12 / SC-13)

Keep the current payload: AES-256-GCM with HKDF-SHA-256 per user (`src/lib/crypto.ts`). Do **not** change the algorithm in a hurry.

1. **Envelope the master key.** `SECRETS_ENCRYPTION_KEY` becomes a *data-encryption key* (DEK) wrapped by an operator-supplied *key-encryption key* (KEK) in a KMS/HSM (PKCS#11, a cloud KMS, or a local HSM). The process never sees the KEK; it receives an unwrapped DEK into memory (or uses the KMS to unwrap per start).
2. **Version the ciphertext.** Introduce a `v3:` (or `v2:` + key-id) prefix so decrypt can try current then previous DEK. Existing `v2:` / `v1:` rows stay readable.
3. **Rotation job.** A maintenance command re-encrypts every `secrets` row under the new DEK, in batches, verifying round-trip before dropping the old DEK. Rotating the env var **without** this job remains data loss — keep that warning until the job exists.
4. **Self-host default.** If no KMS is configured, refuse to start unless `SECRETS_ALLOW_ENV_MASTER_KEY=true` (explicit operator acceptance). Do not silently keep today’s behaviour after KMS ships.

This needs a migration of ciphertext format, operator runbooks, and restore-drill updates. It is not a small PR.

### App-level MFA (P0-5, IA-2(1), NIS2 Art. 21(2)(j))

Until this exists, operators who need MFA should **disable email/password** in GoTrue and require OIDC (e.g. Entra) with conditional-access MFA.

A product implementation, when scheduled:

1. Use GoTrue AAL2 (TOTP). Do not invent a parallel TOTP store.
2. Require `aal2` for vault **reveal**, API-key create/rotate, collaborator invite, and visibility changes. Session-only `aal1` may still read playbook metadata.
3. Playbook API keys are not people; they stay single-factor **and** scoped. Compensate with short expiry, `allowed_hosts`, and (self-host) mTLS (`MTLS_MODE=proxy`).
4. Record `auth.mfa_enroll` / step-up failures in `audit_logs` without storing secrets.

WebAuthn can follow TOTP; SAML is separate.

### SAML (P1-7)

GoTrue can sit behind a SAML IdP. The login page today only lists OAuth/OIDC providers from `/auth/v1/settings` (`src/lib/auth-providers.ts`). Adding SAML is an IdP + GoTrue configuration plus a provider tile and ACS URL docs. Many Hungarian public-sector operators already have Entra; OIDC covers that path. SAML is needed when the operator’s IdP has no OIDC. Not a small PR (metadata, cert rotation, ACS, logout).

### Unsigned container image (P1-5)

`docs/security/supply-chain.md` already states the rule: when a registry publish is added, it must run **on tags only**, produce `sbom-image.cdx.json`, and `cosign sign` the digest with the same GitHub OIDC identity as SBOM blobs. This audit does **not** add tags or publishing. Operators building locally should pin the git SHA they built and keep the image SBOM from the matching `cli-v*` release.

### Rate limiting (P1-4)

Put a WAF / reverse-proxy limit in front (operator). In-app: token bucket per IP + per key on `POST` login, API-key create, `secret.use`, and `secret.reveal`. Fail closed for those routes when the limiter backend is down. Do not rate-limit healthchecks. Needs production metrics before choosing numbers.

### Audit source IP / user agent (P1-6)

Adding columns changes `public.audit_log_canonical` / `AUDIT_CHAIN_FIELDS` in `src/lib/audit-chain.ts`. That is a **hash-chain format change**: new rows hash differently; old rows stay valid. Coordinate with #216 follow-ups; do not sneak a column into a small PR. Forwarding to SIEM can add IP at the proxy without changing the chain, as a stopgap.

---

## Hungarian legal review (do not guess)

The following need counsel / the information-security officer. This file does **not** invent MK-decree item IDs.

| Question | Why it is flagged |
|----------|-------------------|
| Is this operator in scope of 2024. évi LXIX. törvény? | Scope, annexes, and designation rules are legal facts |
| Security class (alap / jelentős / magas) of the *operator’s* electronic information system | Act LXIX **10. §**; 7/2024 MK rendelet annexes. The product is not a class |
| Which 7/2024 (as amended by 18/2024) catalogue items bind that class | Use the consolidated in-force text. This table uses NIST names only |
| Whether IR 2024/2690 applies | The regulation lists specific digital-entity types. Self-hosting this software does not by itself make the operator one of them |
| Registration with the national cybersecurity authority and appointment of the information-security officer | Act LXIX **11. §** and the Act’s registration rules. Operator |
| Incident filing channel and whether a given event is “significant” | 418/2024 **77. §** clocks are verified; significance and the portal to use are legal/operational |
| GDPR controller/processor on hosted vs self-host | Flagged in `docs/security/whitepaper.md` |
| CRA manufacturer / open-source steward status | Open in `SECURITY.md` |

---

## Status counts

Counted from the control table above (one status per row). **Operator** rows are not product gaps.

| Status | Count |
|--------|------:|
| met | 6 |
| partial | 30 |
| missing | 3 |
| operator | 9 |
| **Total rows** | **48** |

**missing:** IA-2(1) MFA; SC-12 key management; AC-7 rate limiting.  
**P0 product bugs with a small fix in this audit:** AC-6 API-key defaults; SC-8/SI-10 CSP Report-Only.  
**P0 already on #216:** AU-9 tamper resistance; SC-7 exfiltration closes.

If #216 merges before this document is used in an assessment, treat AU-9 as **met** (product half) and SC-7 as **partial** (http destinations and DNS TOCTOU remain). Re-verify the branch SHA.

---

## Disclaimer

This document **helps meet** the technical evidence needs of a Hungarian Cybersecurity Act / NIS2 / 7/2024 MK rendelet supplier or self-host assessment. It is **not legal advice**. It is **not a certification**. It does not decide whether any person or organisation is in scope, which security class applies, or which catalogue items bind. Hungarian legal interpretations are marked *jogi ellenőrzés szükséges* and must be approved by the operator’s counsel and information-security officer before production use.
