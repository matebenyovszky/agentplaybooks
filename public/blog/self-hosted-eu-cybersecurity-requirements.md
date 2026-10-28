---
title: How a self-hosted AgentPlaybooks instance helps meet EU cybersecurity and data-protection requirements
description: Secrets, logs and playbook data can stay on your own infrastructure. This post maps NIS2, GDPR, the CRA, and related logging rules to features that exist in the code — and to the duties that remain yours.
date: 2026-10-25
author: Mate Benyovszky
---

# How a self-hosted instance helps meet EU cybersecurity requirements

A local AgentPlaybooks instance is not a certification. It can **help meet** technical parts of several EU rules because **secrets, audit rows, and playbook data stay on infrastructure you operate**. The legal duties — risk analysis, incident filing, staff training, DPIA, hardening — stay with the operator.

This is a first reading of public sources against the self-hosted product, not legal advice. Counsel and your information-security officer must decide what binds you.

## Secrets, logs and data stay on your infrastructure

On the hosted service, the application runs on Cloudflare and the database on Supabase. On a self-hosted install you run both. The application container talks to the Supabase Data API and Auth; a bare PostgreSQL server is not enough. See [Self-Hosting](/docs/self-hosting).

What that split means in practice:

- Vault values are stored as **AES-256-GCM** ciphertext under a per-user HKDF key. The master key (`SECRETS_ENCRYPTION_KEY`) lives in *your* process environment. There is no KMS or HSM in the product.
- Agents use named secrets through **`use_secret`** (GET/HEAD) and **`use_secret_write`** (POST/PUT/PATCH/DELETE), or `POST /api/playbooks/:guid/secrets/proxy`. The server decrypts, injects a header, and returns **only the HTTP response**. The proxy does not return the vault value directly. A destination can still echo credentials in its HTTP response, so allow only trusted destinations; reveal is a separate explicit capability.
- Each secret can pin destinations with **`allowed_hosts`**. `SECRETS_REQUIRE_ALLOWED_HOSTS=true` makes pinning mandatory on your instance.
- **`expires_at`** on a secret stops proxy, federation, and API-key reveal. The owner can still open the value in the dashboard in order to replace it.
- Certificate clients (`secret_clients`) on self-host need a TLS terminator and **`MTLS_MODE=proxy`**, which authenticates the private proxy channel with `MTLS_PROXY_SHARED_SECRET` and checks its stamped address against `MTLS_TRUSTED_PROXIES`. Without a terminator, certificate auth fails closed.
- Sign-in can be limited to your tenant with **Microsoft Entra ID** (`GOTRUE_EXTERNAL_AZURE_*` on GoTrue). There is no application-level MFA; MFA is an IdP control.
- Encrypted on-prem backup and an empty-machine restore drill are documented. The master key is **never** inside the archive.

**Audit trail.** `audit_logs` records vault operations (`secret.*`) and federated MCP calls. A refusal is an event. Rows keep a hostname, not a full URL, and not the secret value. Skill, memory, and canvas writes are recorded by database triggers; sign-ins and audit reads need separate coverage.

- **Hash chain / tamper evidence** — per-playbook SHA-256 chain (`hash = sha256(canonical JSON including prev_hash)`). The first row chains from 64 zero hex digits. An insert trigger assigns the link; updates are rejected, so rows stay immutable. `GET /api/playbooks/:guid/audit/verify` and `apb audit verify` return HTTP 409 when a link is broken.
- **Export** — `format` json, jsonl, or csv on `GET /api/playbooks/:guid/audit`. `GET /api/playbooks/:guid/audit/export` defaults to JSONL. CLI: `apb audit export`.
- **Retention** — unset / `0` / `forever` for `AUDIT_RETENTION_DAYS` keeps rows. A positive integer enables scheduled purge (`POST /api/cron/audit-purge` with `AUDIT_CRON_SECRET`). Purge writes a chain checkpoint and an `audit.retention_purge` event so the remaining chain still verifies. Owners can also `apb audit purge`.
- **Auditor role** — collaborator `auditor` and playbook API-key role `auditor` (user-key scope `audit:read`). Read, export, and verify only. No secret values, no writes. Playbook metadata is visible; persona, skills, and vault contents are not.
- **SIEM / syslog** — off by default. Optional `AUDIT_SYSLOG_URL` (`udp://`, `tcp://`, or `tls://`, RFC 5424) and `AUDIT_SIEM_WEBHOOK_URL` with `AUDIT_SIEM_WEBHOOK_SECRET` (HMAC-SHA256 key of at least 32 random bytes). Forwarding retries with backoff and must not block the vault; an unreachable SIEM does not fail the secret call. Syslog uses Node sockets on self-host; the HTTPS webhook also works on Cloudflare Workers.
- An automated test suite checks that raw API keys and secret values never appear in stored audit rows, exports, syslog or the SIEM payload.

National implementing rules (for example Hungary’s 2024 cybersecurity act and 24-hour / 72-hour / one-month reporting clocks) remain the operator’s duty.

## Requirement to feature

“Helps with” is not “satisfies”. Implementing Regulation (EU) 2024/2690 spells out technical and methodological requirements under NIS2 Article 21; you still select, operate, and evidence the controls.

| Instrument | What it asks (plain reading) | What a local instance helps with |
| --- | --- | --- |
| NIS2 Art. 21 — risk-management measures | Security of systems, cryptography, access control, supply chain, logging, backup, vulnerability handling | Data residency on your stack; AES-256-GCM vault; `use_secret` so the agent never sees the value; `allowed_hosts` + SSRF filters; Entra SSO hook; owner/editor/auditor RBAC |
| NIS2 Art. 21(2)(c) — backup and recovery | Backup management and disaster recovery | [On-prem backup and restore](/docs/backup-restore) runbook, encrypted archives, empty-machine drill in CI |
| NIS2 Art. 21(2)(d) — supply chain | Provenance of ICT | CycloneDX SBOMs, cosign of SBOM blobs on `cli-v*` tags, CodeQL, Dependabot, npm provenance for the CLI. No signed container **registry** publish |
| NIS2 Art. 21(2)(e) — vulnerability handling | Process to receive and fix issues | [SECURITY.md](https://github.com/matebenyovszky/agentplaybooks/blob/main/SECURITY.md) and [GitHub private vulnerability reporting](https://github.com/matebenyovszky/agentplaybooks/security/advisories/new). Maintainer review is best-effort; statutory clocks are yours |
| NIS2 Art. 21(2)(f) and Art. 23 — logging and reporting | Detect, log, and notify significant incidents | `audit_logs` for vault and federated calls, with a per-playbook hash chain, JSON/JSONL/CSV export, optional retention, a read-only auditor role, and optional syslog/SIEM forwarding. The product does **not** file with an authority |
| Commission IR (EU) 2024/2690 | Technical and methodological requirements for Art. 21 measures | The rows above are product inputs. Mapping them onto 2024/2690 control families is an operator document |
| GDPR Art. 5, 25, 32 | Purpose limitation, data protection by design, security of processing | Secrets not in model context by default; ciphertext at rest; self-host so you choose the region and processors |
| GDPR Art. 13 | Information to data subjects | On self-host you are generally the controller and must inform people yourself. The hosted privacy notice does not cover your instance |
| CRA (EU) 2024/2847 | Products with digital elements placed on the market in a commercial activity | Free, non-monetised open source is currently treated as out of that commercial-activity test (Recital 18). SBOMs and vulnerability handling are already in the repo if that status later changes |
| DORA (EU) 2022/2554 | ICT logging and incident reporting for in-scope financial entities | If DORA binds you, those duties stay yours. A local instance keeps the relevant logs on your systems, with export and optional SIEM/syslog forwarding |
| AI Act (EU) 2024/1689 | Logging / record-keeping for high-risk systems (Art. 12) and deployers (Art. 26) | The product does not classify your AI system. Hash-chained vault and federation audit rows, plus export, can feed *your* record-keeping if you are in scope |

### Optional ISO/IEC 27001 and NIST SP 800-53 map

This is a reading aid, not an ISO 27001 or NIST assessment.

| Theme | Product side |
| --- | --- |
| Cryptography (ISO 27001 A.8.24 / NIST SC) | AES-256-GCM, HKDF per user, AAD-bound v2 ciphertext. No KMS |
| Logging (A.8.15 / AU) | `audit_logs` with hash chain, export, optional retention, auditor role, SIEM/syslog. Skill, memory, and canvas writes are audited; sign-ins and audit reads need separate coverage |
| Backup (A.8.13 / CP) | Encrypted dump + restore drill; you set RPO/RTO |
| Access (A.5.15 / AC, IA) | owner / editor / auditor; Entra OIDC; self-host mTLS via trusted proxy |
| Supply chain (A.5.21 / SR, SI) | lockfiles, CodeQL, CycloneDX, cosign of SBOM blobs |

A fuller family table lives in the [security documentation pack](/docs/security).

## What stays the operator’s responsibility

The software cannot do these for you:

- **Risk management** — classification, Art. 21 policy, control selection under 2024/2690, residual risk.
- **Incident reporting** — NIS2 Art. 23 clocks (early warning, notification, final report). The [incident runbook](https://github.com/matebenyovszky/agentplaybooks/blob/main/docs/security/incident-runbook.md) is a template for *your* filing pack.
- **Staff training** — Art. 21(2)(g) is an organisational control, not a product feature.
- **Infrastructure hardening** — TLS termination, network isolation, patch windows, physical rooms, IdP MFA. Compose starts the app on port 3000; it does not terminate TLS and does not start Supabase.
- **DPIA and GDPR roles** — on self-host you generally decide purposes and means. A DPIA, records of processing, and Art. 13 notices are yours if personal data is in play.

Honest gaps: no KMS/HSM, no re-encryption when the master key changes, no app MFA, no SAML, no signed container registry image, CSP is enforced but still permits inline scripts and eval, sign-ins and audit reads need separate coverage.

## How to deploy locally

Follow the existing guides rather than this summary:

1. [Self-Hosting](/docs/self-hosting) — `supabase/schema.sql` for a new database, self-hosted Supabase (not bare Postgres), Docker `app` on port 3000 or Cloudflare Pages. Set `NEXT_PUBLIC_APP_URL` at **build** time. Provide `SECRETS_ENCRYPTION_KEY` only in the protected **runtime** environment; never bake it into an image or a public build variable.
2. [Self-hosted mTLS](/docs/self-hosted-mtls) — terminator + `MTLS_MODE=proxy` if you use certificate clients.
3. [On-prem backup and restore](/docs/backup-restore) — same text as `docs/self-host/backup-restore.md` in the repository; `scripts/self-host/backup.sh` and the empty-machine drill.
4. [Audit logs](/docs/audit-logs) — hash chain, export, retention, auditor role, and optional SIEM/syslog (`AUDIT_SYSLOG_URL`, `AUDIT_SIEM_WEBHOOK_URL`).
5. Air-gap options on the self-hosting page: `NO_EGRESS=true`, `SECRETS_REQUIRE_ALLOWED_HOSTS=true`, local Geist fonts (`next/font/local`). Isolated no-egress CI lives in `.github/workflows/no-egress.yml` and `deploy/airgap/`. Production compose is still app-only; `npm ci` and base images still need a registry before isolation.
6. Entra ID: `GOTRUE_EXTERNAL_AZURE_*` as documented in the self-hosting guide.
7. Security pack: [Security documentation](/docs/security). Vulnerability reports: [GitHub private advisory form](https://github.com/matebenyovszky/agentplaybooks/security/advisories/new) — there is no security email.

Related reading: [Secrets Vault](/blog/secrets-vault-secure-credential-management), [Python secrets](/docs/python-secrets).

## Disclaimer

This article is **not legal advice** and **not a certification**. Running AgentPlaybooks, including on your own machines, does not confer NIS2, GDPR, CRA, DORA, or AI Act status. The operator remains responsible for what the law requires of their organisation. Legal interpretations here need review before production use.
