# Security documentation pack

Supplier-assessment and EIR classification pack for self-hosted AgentPlaybooks (NIS2 Article 21(2)(a), (d), (g); 7/2024. (VI. 24.) MK rendelet mapped to NIST SP 800-53 rev. 5 families).

**Hungarian is the language of record.** Full text lives in the repository (not only on this page):

- [docs/security/README.hu.md](https://github.com/matebenyovszky/agentplaybooks/blob/main/docs/security/README.hu.md) — index
- [Whitepaper (HU)](https://github.com/matebenyovszky/agentplaybooks/blob/main/docs/security/whitepaper.hu.md) · [EN](https://github.com/matebenyovszky/agentplaybooks/blob/main/docs/security/whitepaper.md)
- [Asset inventory (HU)](https://github.com/matebenyovszky/agentplaybooks/blob/main/docs/security/asset-inventory.hu.md) · [EN](https://github.com/matebenyovszky/agentplaybooks/blob/main/docs/security/asset-inventory.md)
- [Risk-assessment template (HU)](https://github.com/matebenyovszky/agentplaybooks/blob/main/docs/security/risk-assessment.hu.md) · [CSV](https://github.com/matebenyovszky/agentplaybooks/blob/main/docs/security/risk-assessment.csv)

In a clone of this tree the same files are under `docs/security/`.

> **jogi ellenőrzés szükséges.** This page is not legal advice, not a certification, and not an EIR classification. The customer's IBF and counsel must approve every legal interpretation before production use.

## What the code actually does (summary)

Verified in source; details and file links are in the whitepaper.

| Area | Present | Not present |
|------|---------|-------------|
| Crypto | AES-256-GCM, HKDF-SHA-256 per-user keys, AAD-bound v2 ciphertext | KMS/HSM, re-encryption rotation |
| TLS / mTLS | Platform TLS on hosted Cloudflare; hosted mTLS via `cf.tlsClientAuth`; self-host `MTLS_MODE=proxy` behind a trusted terminator. **Done on `main`:** [#201](https://github.com/matebenyovszky/agentplaybooks/pull/201) | Node does not terminate TLS; without a terminator certificate auth stays fail-closed |
| AuthN / AuthZ | Supabase Auth; optional Entra/Google/GitHub/LinkedIn OIDC; owner, editor and read-only auditor roles; scoped API keys including proposer and auditor; optional enforced private-instance mode | App-level MFA; SAML |
| Audit | Vault and federation events; configuration and memory/canvas writes; protected SHA-256 hash chains; owner/auditor read, verify and JSONL/CSV export; optional signed SIEM webhook or Node syslog; scheduled retention with checkpoints. See [Audit logs](./audit-logs.md) | Sign-in and audit-read events; forwarding of trigger-written events; durable SIEM outbox; digital signatures on the chain |
| Expiry | Enforced secret expiry; API-key expiry; mTLS client revocation; configurable audit retention via an operator-scheduled purge endpoint | Automatic deletion of expired secrets |
| Self-host | Docker `app` on port 3000; separate Supabase stack required; local Geist woff2 (`next/font/local`); isolated no-egress CI for the secrets flow (`deploy/airgap/`). **Done on `main`:** fonts [#200](https://github.com/matebenyovszky/agentplaybooks/pull/200); CI [#204](https://github.com/matebenyovszky/agentplaybooks/pull/204) | Production compose is still app-only; `npm ci` / base images pull before isolation; `use_secret` egress unless destinations are pinned |
| SDLC | Dependabot, `npm audit:production` in CI, CLI npm provenance, CodeQL, CycloneDX SBOM, cosign of SBOM blobs, `SECURITY.md`, incident runbook, GitHub private vulnerability reporting (no security email), encrypted on-prem backup/restore + empty-machine drill. **Done on `main`:** [#205](https://github.com/matebenyovszky/agentplaybooks/pull/205), [#207](https://github.com/matebenyovszky/agentplaybooks/pull/207), [#203](https://github.com/matebenyovszky/agentplaybooks/pull/203) | Signed container registry publish |

Operations checklist: [Self-Hosting](./self-hosting.md). Architecture: [Architecture](./architecture.md).

Keep the live inventory current:

```bash
npm run inventory:self-host
npm run docs:check
```
