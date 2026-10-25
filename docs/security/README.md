# Security documentation pack

**Language:** Hungarian is the language of record for the supplier assessment (`*.hu.md`). English lives in the unsuffixed `*.md` files, matching the rest of this repository (English `file.md`, Hungarian `file.hu.md`).

**Audience:** the customer's information-security officer (IBF), risk, legal, and operations teams. Written for a Hungarian public-sector supplier assessment and EIR security classification.

**Verified against source:** 2026-10-24, on the `main` branch as of that date.

> **jogi ellenőrzés szükséges.** This pack is not legal advice, not a certification, and not a substitute for the customer's own risk analysis or control selection under 7/2024. (VI. 24.) MK rendelet. Every note on scope, classification, responsibility split, or legal interpretation must be approved by the customer's counsel and IBF before production use.

## Contents

| Document | Hungarian (primary) | English |
|----------|---------------------|---------|
| Whitepaper (architecture, crypto, auth, audit, SDLC, gaps) | [whitepaper.hu.md](./whitepaper.hu.md) | [whitepaper.md](./whitepaper.md) |
| Asset inventory (components, ports, keys, dependencies) | [asset-inventory.hu.md](./asset-inventory.hu.md) | [asset-inventory.md](./asset-inventory.md) |
| Risk-assessment template (NIST 800-53 families ↔ MK r. / NIS2) | [risk-assessment.hu.md](./risk-assessment.hu.md) | [risk-assessment.md](./risk-assessment.md) |
| Spreadsheet export | [risk-assessment.csv](./risk-assessment.csv) (bilingual) | same file |

Live stack listing (`docker compose ps` / `images` / ports):

```bash
npm run inventory:self-host
# or: node scripts/list-self-host-stack.mjs --json
# with Supabase compose: node scripts/list-self-host-stack.mjs --compose-file /path/to/supabase/docker-compose.yml
```

Link and cited-path check:

```bash
npm run docs:check
```

## Legal sources (primary texts)

This pack **does not quote or invent** 7/2024 MK rendelet control IDs. Controls are named by NIST SP 800-53 rev. 5 family. Exact numbering in the Hungarian decree is for the customer to confirm — **jogi ellenőrzés szükséges**.

| Source | Role in this pack |
|--------|-------------------|
| NIS2 Directive (EU) 2022/2555, Article 21(2)(a), (d), (g) | Risk-analysis / ISMS policy, supply chain, cyber hygiene and training — [EUR-Lex](https://eur-lex.europa.eu/eli/dir/2022/2555/oj) |
| Act LXIX of 2024 (Cybersecurity Act) | EIR, security class, scope — [NJT](https://njt.jog.gov.hu/jogszabaly/2024-69-00-00) |
| 7/2024. (VI. 24.) MK rendelet | Classification, risk management, NIST 800-53 rev. 5-based catalogue — [NJT](https://njt.jog.gov.hu/jogszabaly/2024-7-20-7G) |
| 418/2024. (XII. 23.) Korm. rendelet | Incident notification timelines — [NJT](https://njt.jog.gov.hu/jogszabaly/2024-418-20-22) |
| GDPR (EU) 2016/679 | Security of processing, processor status — [EUR-Lex](https://eur-lex.europa.eu/eli/reg/2016/679/oj) |
| EiR guides (NBSZ NKI) | Practical help for the MK decree — [nki.gov.hu](https://nki.gov.hu/it-biztonsag/kiadvanyok/segedletek/eir-utmutato/) |

Related operations guide: [`public/docs/self-hosting.md`](../../public/docs/self-hosting.md). Short website summary: [`public/docs/security.md`](../../public/docs/security.md) / [`public/docs/security.hu.md`](../../public/docs/security.hu.md).

## What this pack does not claim

The product is **not** certified to any security class of 7/2024 MK rendelet. Classification (alap / jelentős / magas) applies to the customer's EIR, not to vendor marketing — **jogi ellenőrzés szükséges**.

The whitepaper only claims what the source code does. The gap list is intentionally honest; see [whitepaper.md — Known gaps](./whitepaper.md#known-gaps).
