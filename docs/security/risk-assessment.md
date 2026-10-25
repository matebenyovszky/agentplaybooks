# Risk-assessment template (7/2024 MK r. / NIST 800-53)

**Spreadsheet:** [risk-assessment.csv](./risk-assessment.csv) (UTF-8 BOM, comma, every field quoted; in Hungarian Excel use Data → From Text/CSV → UTF-8).

Hungarian: [risk-assessment.hu.md](./risk-assessment.hu.md). Whitepaper: [whitepaper.md](./whitepaper.md).

> **jogi ellenőrzés szükséges.** 7/2024. (VI. 24.) MK rendelet prescribes a NIST SP 800-53 rev. 5-based catalogue. This template refers to **NIST family names** (AC, AU, CM, …). It does **not** invent or quote decree item IDs. Exact MK numbering, applying annex-3 threats, the EIR class (alap / jelentős / magas), and which NIS2 Art. 21 letters bind the customer are for the IBF and counsel.

NIS2 Art. 21(2)(a), (d), (g) are the pack’s primary focus (policy / supply chain / hygiene and training). Other letters appear because families overlap — that is not a conformity claim.

## How to fill it in

Copy the CSV. Add customer columns: `customer_status`, `residual_risk`, `owner`, `due_date`, `decision`. The `status` column is the **product** as of 2026-10-24:

| Value | Meaning |
|-------|---------|
| `implemented` | Code covers the product half of the family |
| `partial` | Product function exists, but a gap or customer half remains |
| `missing` | Product does not provide the expected product half |
| `customer` | Entirely customer (operations / HR / physical) |
| `n/a` | Not meaningful for this software |

Every CSV row sets `legal_flag` to `jogi ellenőrzés szükséges`.

## Control families

| NIST | Family | NIS2 (indicative) | Product support | Customer | Evidence / test | Status |
|------|--------|-------------------|-----------------|----------|-----------------|--------|
| AC | Access Control | 21(2)(i), (j) | owner\|editor; secrets owner-only; API-key roles (viewer/coworker/proposer/admin). **No auditor role on `main`.** **Folyamatban / In progress:** [#202](https://github.com/matebenyovszky/agentplaybooks/pull/202) | Owners, OAuth lock-down, whether an auditor is required | `guards.test.ts`; non-owner secrets 403 | partial |
| AU | Audit and Accountability | 21(2)(b),(f) | `audit_logs` + `secret.*` + federation; denials logged; no SIEM/retention/hash-chain on `main`. **Folyamatban / In progress:** [#202](https://github.com/matebenyovszky/agentplaybooks/pull/202) | SIEM, retention, AI Act 12/26 if applicable | `audit.test.ts`; `/audit?operation=secret.` | partial |
| CM | Configuration Management | 21(2)(i) | Static inventory + `scripts/list-self-host-stack.mjs` | Run the script; image change control | `npm run inventory:self-host`; `docs:check` | partial |
| IA | Identification and Authentication | 21(2)(i),(j) | Supabase Auth, Entra OIDC; **no app MFA, no SAML**; hosted mTLS; self-host `MTLS_MODE=proxy`. **Done on `main`:** [#201](https://github.com/matebenyovszky/agentplaybooks/pull/201) | Entra MFA, disable email login, on-prem TLS terminator | SSO E2E; `mtls.test.ts` (hosted + proxy) | partial |
| IR | Incident Response | Art. 23; 418/2024. § 77 | Audit API for extracts. `SECURITY.md` + incident runbook on `main`. **Done on `main`:** [#205](https://github.com/matebenyovszky/agentplaybooks/pull/205). GitHub private vulnerability reporting is the only contact (**Done on `main`:** [#207](https://github.com/matebenyovszky/agentplaybooks/pull/207)); no security email; review is best-effort | NKI 24/72 h / 1 month process (operator clocks, not reporter SLAs) | Tabletop: revoke key + extract + runbook | partial |
| PL | Planning | 21(2)(a),(g) | This documentation pack | Instance plan, EIR class | IBF/legal review | partial |
| RA | Risk Assessment | 21(2)(a) | Template + honest gaps; no automated engine | Annex 3, control selection | Completed CSV + IBF signature | partial |
| SC | System and Communications Protection | 21(2)(h) | AES-256-GCM, HKDF, SSRF, `allowed_hosts`. **No KMS/HSM, no re-encryption.** Self-host mTLS via trusted proxy. **Done on `main`:** [#201](https://github.com/matebenyovszky/agentplaybooks/pull/201) | HTTPS proxy, isolation, KMS decision | `crypto.test.ts`; proxy to link-local 400; `mtls.test.ts` | partial |
| SI | System and Information Integrity | 21(2)(e) | Dependabot, `npm audit:production`, CI tests, CodeQL, CycloneDX SBOM, cosign of SBOM blobs. **Done on `main`:** [#205](https://github.com/matebenyovszky/agentplaybooks/pull/205). No signed container registry; no in-app hash chain | Patch cadence, extra scanners | CI verify; audit:production; CodeQL; `supply-chain.md` | partial |
| CP | Contingency Planning | 21(2)(c) | Encrypted on-prem backup/restore runbook + empty-machine CI drill. Snapshots are **not** vault values. **Done on `main`:** [#203](https://github.com/matebenyovszky/agentplaybooks/pull/203) | Schedule, offsite copy, master-key custody, RPO/RTO targets | `restore-drill.sh`; `.github/workflows/self-host-restore-drill.yml` | partial |
| SA | System and Services Acquisition | 21(2)(d),(e); CRA? | MIT source, CI, CLI provenance, CycloneDX SBOM on `cli-v*` tags. **Done on `main`:** [#205](https://github.com/matebenyovszky/agentplaybooks/pull/205). No signed container registry | Licence, CRA manufacturer status | `publish-cli.yml`; `sbom.yml`; this pack | partial |
| SR | Supply Chain Risk Management | 21(2)(d), 21(3) | Lockfile, Dependabot, CLI provenance, CycloneDX + cosign of SBOM blobs. **Done on `main`:** [#205](https://github.com/matebenyovszky/agentplaybooks/pull/205). No signed container registry | Image pin, CVEs, compare SBOM to running images | `npm ci`; inventory images; `cosign verify-blob` | partial |
| AT | Awareness and Training | 21(2)(g) | Operator docs. No in-app training | Role-based training, evidence | Customer records | customer |
| CA | Assessment, Authorization, and Monitoring | 21(2)(f) | CI. No APM; no pentest report | Authorize, pentest, monitoring | CI; `HEALTHCHECK` | partial |
| PE | Physical and Environmental Protection | Art. 21 all-hazards | Software; no DC controls | Room / hosting | Customer facility | customer |
| MP | Media Protection | 21(2)(h),(c) | Ciphertext at rest | Backup media, volume copies | Inspect `secrets` table | partial |
| PS | Personnel Security | 21(2)(i) | RBAC, hashed invites | Joiner/leaver, Entra groups | Disable Auth, revoke keys | customer |
| MA | Maintenance | 21(2)(e) | Documented image rebuild; Dependabot | Change windows | self-hosting Updating | partial |
| PM | Program Management | 21(1) governance | Roadmap + this pack; no GRC | IBF, budget for gaps | Customer programme | customer |
| PT | PII Processing and Transparency | GDPR 32, 33 | Self-host on customer machines; Auth PII. Processor status **not decided** | DPIA, residency, DPA if hosted | `legal-copy.ts`; DPIA | partial |

Every legal column in the table is **jogi ellenőrzés szükséges**.

## Suggested customer tests (summary)

Evidence from the supplier-assessment requirement table, aligned to **today’s** code:

1. Unit/integration in CI: crypto, expiry, `allowed_hosts`, RBAC — **present**. Hash-chain, SIEM export, auditor role — **absent on `main`** (**Folyamatban / In progress:** [#202](https://github.com/matebenyovszky/agentplaybooks/pull/202)).
2. E2E on an isolated network, zero egress at runtime — **on `main`**. Fonts no longer fetch at build. **Done on `main`:** fonts [#200](https://github.com/matebenyovszky/agentplaybooks/pull/200); isolated CI [#204](https://github.com/matebenyovszky/agentplaybooks/pull/204) (`.github/workflows/no-egress.yml`).
3. Restore drill — product empty-machine drill is on `main`. **Done on `main`:** [#203](https://github.com/matebenyovszky/agentplaybooks/pull/203). Customer still owns schedule, offsite copy, and master-key custody.
4. Incident tabletop — customer; `SECURITY.md` + incident runbook are on `main`. **Done on `main`:** [#205](https://github.com/matebenyovszky/agentplaybooks/pull/205). GitHub private vulnerability reporting is the only contact. **Done on `main`:** [#207](https://github.com/matebenyovszky/agentplaybooks/pull/207).
5. CVE process: Dependabot → patch → CLI provenance + CodeQL + signed CycloneDX SBOM on `cli-v*` tags. **Done on `main`:** [#205](https://github.com/matebenyovszky/agentplaybooks/pull/205). Signed container registry publish is still absent.
6. Pentest — not in this pack.
7. IBF / legal review — **jogi ellenőrzés szükséges**.

## Related files

- [`src/lib/crypto.ts`](../../src/lib/crypto.ts)
- [`src/app/api/_shared/guards.ts`](../../src/app/api/_shared/guards.ts)
- [`src/app/api/_shared/audit.ts`](../../src/app/api/_shared/audit.ts)
- [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)
- [`.github/workflows/codeql.yml`](../../.github/workflows/codeql.yml)
- [`.github/workflows/sbom.yml`](../../.github/workflows/sbom.yml)
- [`SECURITY.md`](../../SECURITY.md)
- [`docs/security/incident-runbook.md`](./incident-runbook.md)
- [`docs/security/supply-chain.md`](./supply-chain.md)
- [`public/docs/self-hosted-mtls.md`](../../public/docs/self-hosted-mtls.md)
- [`.github/workflows/no-egress.yml`](../../.github/workflows/no-egress.yml)
- [`deploy/airgap/`](../../deploy/airgap/)
- [`docs/self-host/backup-restore.md`](../self-host/backup-restore.md)
- [`scripts/self-host/backup.sh`](../../scripts/self-host/backup.sh)
- [`.github/workflows/self-host-restore-drill.yml`](../../.github/workflows/self-host-restore-drill.yml)
- [`scripts/list-self-host-stack.mjs`](../../scripts/list-self-host-stack.mjs)
