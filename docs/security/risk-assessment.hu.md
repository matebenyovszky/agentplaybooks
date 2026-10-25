# Kockázatelemzés-sablon (7/2024. MK r. / NIST 800-53)

**Táblázatkezelő:** [risk-assessment.csv](./risk-assessment.csv) (UTF-8 BOM, vessző, minden mező idézőjelben; magyar Excel: Adatok → Szövegből/CSV → UTF-8).

Angol: [risk-assessment.md](./risk-assessment.md). Fehérkönyv: [whitepaper.hu.md](./whitepaper.hu.md).

> **Jogi ellenőrzés szükséges.** A 7/2024. (VI. 24.) MK rendelet NIST SP 800-53 rev. 5 alapú védelmi intézkedéskatalógust ír elő. Ez a sablon a **NIST családneveken** (AC, AU, CM, …) hivatkozik. **Nem** találunk ki és **nem** idézünk rendeletbeli tétel-azonosítókat. A pontos MK számozás, a 3. melléklet fenyegetéseinek alkalmazása, az EIR (alap / jelentős / magas) osztály és a NIS2 21. cikk betűinek hatálya az ügyfél IBF-jének és jogászának feladata.

A NIS2 21. cikk (2) (a), (d), (g) a csomag elsődleges fókusza (politika / ellátási lánc / kiberhigiénia és képzés). A többi betű azért szerepel, mert a családok átfednek — ez nem megfelelőségi állítás.

## Hogyan töltsd ki

Másold a CSV-t. Adj ügyféli oszlopokat: `customer_status`, `residual_risk`, `owner`, `due_date`, `decision`. A `status` oszlop a **termék** 2026-10-24-i állapota:

| Érték | Jelentés |
|-------|----------|
| `implemented` | A kód fedi a család termékre eső részét |
| `partial` | Van termékfunkció, de gap vagy ügyféli fél kell |
| `missing` | A termék nem adja a család elvárt termékfelét |
| `customer` | Teljes egészében ügyféli (üzemeltetés / HR / fizikai) |
| `n/a` | Nem értelmezhető erre a szoftverre |

Minden CSV-sor `legal_flag` mezője: `jogi ellenőrzés szükséges`.

## Kontrollcsaládok

| NIST | Család | NIS2 (tájékoztató) | Terméktámogatás | Ügyfél | Bizonyíték / teszt | Státusz |
|------|--------|--------------------|-----------------|--------|--------------------|---------|
| AC | Hozzáférés-vezérlés | 21(2)(i), (j) | owner/editor/auditor; editor: tartalom és titkok; auditor: audit és metaadat. Kulcsmódosítás és megosztás owner-only. | Tulajdonosok, OAuth-szűkítés, szerepkör-felülvizsgálat | `audit-access.ts`; `guards.ts`; `permissions.md` | partial |
| AU | Naplózás | 21(2)(b),(f) | `audit_logs` + `secret.*` + federáció; elutasítás is esemény; nincs SIEM/megőrzés/hash-lánc a `main`-en. **Folyamatban / In progress:** [#202](https://github.com/matebenyovszky/agentplaybooks/pull/202) | SIEM, megőrzés, AI Act 12/26 ha hatályos | `audit.test.ts`; `/audit?operation=secret.` | partial |
| CM | Konfigurációkezelés | 21(2)(i) | Statikus leltár + `scripts/list-self-host-stack.mjs` | Script futtatása, image változáskezelés | `npm run inventory:self-host`; `docs:check` | partial |
| IA | Azonosítás / hitelesítés | 21(2)(i),(j) | Supabase Auth, Entra OIDC; **nincs app-MFA, nincs SAML**; hosted mTLS; self-host `MTLS_MODE=proxy`. **Kész a `main`-en:** [#201](https://github.com/matebenyovszky/agentplaybooks/pull/201) | Entra MFA, e-mail login tiltása, on-prem TLS-terminátor | SSO E2E; `mtls.test.ts` (hosted + proxy) | partial |
| IR | Incidenskezelés | 23. cikk; 418/2024. 77. § | Audit API kivonathoz. `SECURITY.md` + incidens-runbook a `main`-en. **Kész a `main`-en:** [#205](https://github.com/matebenyovszky/agentplaybooks/pull/205). A biztonsági kapcsolat kizárólag a GitHub privát sérülékenység-jelentés (**Kész a `main`-en:** [#207](https://github.com/matebenyovszky/agentplaybooks/pull/207)); nincs security e-mail; a review best-effort | NKI 24/72 óra / 1 hónap rend (üzemeltetői órák, nem bejelentői SLA) | Tabletop: kulcsvisszavonás + kivonat + runbook | partial |
| PL | Tervezés | 21(2)(a),(g) | Ez a dokumentumcsomag | Instance-terv, EIR osztály | IBF/jogi review | partial |
| RA | Kockázatelemzés | 21(2)(a) | Sablon + őszinte gap lista; nincs automatikus motor | 3. melléklet, intézkedésválasztás | Kitöltött CSV + IBF aláírás | partial |
| SC | Kommunikációvédelem | 21(2)(h) | AES-256-GCM, HKDF, SSRF, `allowed_hosts`. **Nincs KMS/HSM, nincs re-encryption.** Self-host mTLS trusted proxy-n. **Kész a `main`-en:** [#201](https://github.com/matebenyovszky/agentplaybooks/pull/201) | HTTPS proxy, izoláció, KMS döntés | `crypto.test.ts`; proxy a link-localra 400; `mtls.test.ts` | partial |
| SI | Integritás | 21(2)(e) | Dependabot, `npm audit:production`, CI teszt, CodeQL, CycloneDX SBOM, SBOM-blob cosign. **Kész a `main`-en:** [#205](https://github.com/matebenyovszky/agentplaybooks/pull/205). Nincs aláírt konténer-registry; nincs alkalmazásbeli hash-lánc | Javítási ritmus, extra scanner | CI verify; audit:production; CodeQL; `supply-chain.md` | partial |
| CP | Üzletmenet-folytonosság | 21(2)(c) | Titkosított helyszíni mentés/restore-runbook + üres-gép CI drill. A snapshot **nem** vault-érték. **Kész a `main`-en:** [#203](https://github.com/matebenyovszky/agentplaybooks/pull/203) | Ütemezés, offsite másolat, mesterkulcs-őrzés, RPO/RTO cél | `restore-drill.sh`; `.github/workflows/self-host-restore-drill.yml` | partial |
| SA | Beszerzés | 21(2)(d),(e); CRA? | MIT forrás, CI, CLI provenance, CycloneDX SBOM `cli-v*` tageken. **Kész a `main`-en:** [#205](https://github.com/matebenyovszky/agentplaybooks/pull/205). Nincs aláírt konténer-registry | Licenc, CRA gyártói státusz | `publish-cli.yml`; `sbom.yml`; ez a csomag | partial |
| SR | Ellátási lánc | 21(2)(d), 21(3) | Lockfile, Dependabot, CLI provenance, CycloneDX + SBOM-blob cosign. **Kész a `main`-en:** [#205](https://github.com/matebenyovszky/agentplaybooks/pull/205). Nincs aláírt konténer-registry | Image pin, CVE, SBOM összevetése a futó image-dzsel | `npm ci`; inventory images; `cosign verify-blob` | partial |
| AT | Képzés | 21(2)(g) | Üzemeltetői doksik. Nincs in-app képzés | Szerepkörös képzés, igazolás | Ügyféli napló | customer |
| CA | Értékelés / monitoring | 21(2)(f) | CI. Nincs APM; nincs pentest-jelentés | Engedélyezés, pentest, monitoring | CI; `HEALTHCHECK` | partial |
| PE | Fizikai védelem | 21. cikk all-hazards | Szoftver; nincs DC-kontroll | Terem / hosting | Ügyféli létesítmény | customer |
| MP | Adathordozó | 21(2)(h),(c) | Ciphertext at rest | Mentési média, kötetmásolás | secrets tábla inspect | partial |
| PS | Személyzet | 21(2)(i) | RBAC, hashed invite | Joiner/leaver, Entra csoportok | Auth tiltás, kulcsvisszavonás | customer |
| MA | Karbantartás | 21(2)(e) | Dokumentált image-újraépítés; Dependabot | Változási ablak | self-hosting Updating | partial |
| PM | Programirányítás | 21(1) governance | Roadmap + csomag; nincs GRC | IBF, budget a gapekre | Ügyféli program | customer |
| PT | Személyes adatok | GDPR 32, 33 | Self-host az ügyfél gépén; Auth PII. Feldolgozói státusz **nincs eldöntve** | DPIA, rezidencia, DPA ha hosted | `legal-copy.ts`; DPIA | partial |

A táblázat minden jogi oszlopa **jogi ellenőrzés szükséges**.

## Ajánlott ügyféli teszt (összefoglaló)

A beszállítói értékelés requirement-táblája szerinti bizonyítékok, a **mai** kódhoz igazítva:

1. Unit/integráció a CI-ban: kripto, lejárat, `allowed_hosts`, RBAC — **van**. Hash-lánc, SIEM-export, auditor szerep — **nincs a `main`-en** (**Folyamatban / In progress:** [#202](https://github.com/matebenyovszky/agentplaybooks/pull/202)).
2. E2E izolált hálózaton, 0 kimenő forgalom runtime-ban — **van a `main`-en**. A fontok buildkor már nem töltődnek le. **Kész a `main`-en:** fontok [#200](https://github.com/matebenyovszky/agentplaybooks/pull/200); izolált CI [#204](https://github.com/matebenyovszky/agentplaybooks/pull/204) (`.github/workflows/no-egress.yml`).
3. Restore drill — a termék üres-gép drill a `main`-en van. **Kész a `main`-en:** [#203](https://github.com/matebenyovszky/agentplaybooks/pull/203). Az ütemezés, offsite másolat és a mesterkulcs-őrzés ügyféli.
4. Incidens tabletop — ügyféli; `SECURITY.md` + incidens-runbook a `main`-en van. **Kész a `main`-en:** [#205](https://github.com/matebenyovszky/agentplaybooks/pull/205). A biztonsági kapcsolat kizárólag a GitHub privát sérülékenység-jelentés. **Kész a `main`-en:** [#207](https://github.com/matebenyovszky/agentplaybooks/pull/207).
5. CVE-folyamat: Dependabot → javítás → CLI provenance + CodeQL + aláírt CycloneDX SBOM `cli-v*` tageken. **Kész a `main`-en:** [#205](https://github.com/matebenyovszky/agentplaybooks/pull/205). Aláírt konténer-registry publikálás továbbra sincs.
6. Pentest — nincs benne ebben a csomagban.
7. IBF / jogi review — **jogi ellenőrzés szükséges**.

## Kapcsolódó fájlok

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
