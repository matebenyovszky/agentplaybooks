# Kockázatelemzés-sablon (7/2024. MK r. / NIST 800-53)

**Táblázatkezelő:** [risk-assessment.csv](./risk-assessment.csv) (UTF-8 BOM, vessző, minden mező idézőjelben; magyar Excel: Adatok → Szövegből/CSV → UTF-8).

Angol: [risk-assessment.md](./risk-assessment.md). Fehérkönyv: [whitepaper.hu.md](./whitepaper.hu.md).

> **Jogi ellenőrzés szükséges.** A 7/2024. (VI. 24.) MK rendelet NIST SP 800-53 rev. 5 alapú védelmi intézkedéskatalógust ír elő. Ez a sablon a **NIST családneveken** (AC, AU, CM, …) hivatkozik. **Nem** találunk ki és **nem** idézünk rendeletbeli tétel-azonosítókat. A pontos MK számozás, a 3. melléklet fenyegetéseinek alkalmazása, az EIR (alap / jelentős / magas) osztály és a NIS2 21. cikk betűinek hatálya az ügyfél IBF-jének és jogászának feladata.

A NIS2 21. cikk (2) (a), (d), (g) a csomag elsődleges fókusza (politika / ellátási lánc / kiberhigiénia és képzés). A többi betű azért szerepel, mert a családok átfednek — ez nem megfelelőségi állítás.

## Hogyan töltsd ki

Másold a CSV-t. Adj ügyféli oszlopokat: `customer_status`, `residual_risk`, `owner`, `due_date`, `decision`. A `status` oszlop a **termék** 2026-10-28-i állapota (`main`, a [#216](https://github.com/matebenyovszky/agentplaybooks/pull/216) és a [#220](https://github.com/matebenyovszky/agentplaybooks/pull/220) PR-rel). Még nyitott PR tétele **Folyamatban / In progress** jelölést kapna, és a státuszt nem emelné; csak merge-elt biztonsági változások számítanak késznek:

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
| AC | Hozzáférés-vezérlés | 21(2)(i), (j) | owner\|editor\|auditor; az editor tartalmat és titkokat kezel; az auditor auditbizonyítékot és metaadatot olvas; kulcsmódosítás és megosztás tulajdonosi jog; API-kulcs szerepek (viewer/coworker/proposer/admin/auditor). **Kész a `main`-en:** [#202](https://github.com/matebenyovszky/agentplaybooks/pull/202) (auditor). **Kész a `main`-en:** [#216](https://github.com/matebenyovszky/agentplaybooks/pull/216) — kulcs nem kapcsolhat reveal-t, nem bővíthet `allowed_hosts`-ot, nem tehet közzé playbookot; privát instance kapcsoló. Nyitott: kulcslejárat opcionális, jogosultság-sztring nincs ellenőrizve, `/api/mcp/manage` JWT = `full`; fiókellenőrzés és kiléptetés kész (#227), nincs instance-admin UI | Tulajdonosok, OAuth szűkítés, szerepkör-felülvizsgálat, auditorok kijelölése, kulcsvisszavonás kiléptetéskor | `audit-access.ts`; `guards.test.ts`; `audit-role.test.ts`; `permissions.md`; auditor secrets 403 | partial |
| AU | Naplózás | 21(2)(b),(f) | `audit_logs` + `secret.*` + federáció; elutasítás is esemény. **Kész a `main`-en:** [#202](https://github.com/matebenyovszky/agentplaybooks/pull/202) — hash-lánc (kulcs nélküli SHA-256), export json/jsonl/csv, `/audit/verify`, syslog/SIEM (alapból ki, 3 próbálkozás, nincs outbox), megőrzési purge. **Kész a `main`-en:** [#216](https://github.com/matebenyovszky/agentplaybooks/pull/216) — törlésálló napló, konfigurációváltozás-triggerek. Nyitott: memória/vászon írás naplózott (#222); bejelentkezés nincs naplózva, triggersorok nincsenek továbbítva, nincs IP/user-agent, reveal/resolve fail-closed, más auditírás fail-open | SIEM-fogadó, purge ütemezése, GoTrue-napló továbbítása, AI Act 12/26 ha hatályos | `audit.test.ts`; `audit-chain.test.ts`; `/audit/verify`; `audit-tamper-resistance-db.test.ts`; [Audit Logs](../../public/docs/audit-logs.hu.md) | partial |
| CM | Konfigurációkezelés | 21(2)(i) | Statikus leltár + `scripts/list-self-host-stack.mjs` | Script futtatása, image változáskezelés | `npm run inventory:self-host`; `docs:check` | partial |
| IA | Azonosítás / hitelesítés | 21(2)(i),(j) | Supabase Auth, Entra OIDC; **nincs app-MFA, nincs SAML**; hosted mTLS; self-host `MTLS_MODE=proxy`. **Kész a `main`-en:** [#201](https://github.com/matebenyovszky/agentplaybooks/pull/201) | Entra MFA, e-mail login tiltása, on-prem TLS-terminátor | SSO E2E; `mtls.test.ts` (hosted + proxy) | partial |
| IR | Incidenskezelés | 23. cikk; 418/2024. 77. § | Audit API kivonathoz. `SECURITY.md` + incidens-runbook a `main`-en. **Kész a `main`-en:** [#205](https://github.com/matebenyovszky/agentplaybooks/pull/205). A biztonsági kapcsolat kizárólag a GitHub privát sérülékenység-jelentés (**Kész a `main`-en:** [#207](https://github.com/matebenyovszky/agentplaybooks/pull/207)); nincs security e-mail; a review best-effort | NKI 24/72 óra / 1 hónap rend (üzemeltetői órák, nem bejelentői SLA) | Tabletop: kulcsvisszavonás + kivonat + runbook | partial |
| PL | Tervezés | 21(2)(a),(g) | Ez a dokumentumcsomag | Instance-terv, EIR osztály | IBF/jogi review | partial |
| RA | Kockázatelemzés | 21(2)(a) | Sablon + őszinte gap lista; nincs automatikus motor | 3. melléklet, intézkedésválasztás | Kitöltött CSV + IBF aláírás | partial |
| SC | Kommunikációvédelem | 21(2)(h) | AES-256-GCM, HKDF, SSRF, `allowed_hosts`. **Nincs KMS/HSM, nincs re-encryption.** Self-host mTLS trusted proxy-n. **Kész a `main`-en:** [#201](https://github.com/matebenyovszky/agentplaybooks/pull/201). **Kész a `main`-en:** [#216](https://github.com/matebenyovszky/agentplaybooks/pull/216) — közös SSRF-ellenőrzés DNS-feloldással, átirányítás tiltva, compose `SECRETS_REQUIRE_ALLOWED_HOSTS=true`. CORS: self-hosted `NEXT_PUBLIC_APP_URL` mellett a hosted originek már nem megbízhatók — **Kész a `main`-en:** [#220](https://github.com/matebenyovszky/agentplaybooks/pull/220). Nyitott: DNS rebinding, enforcing CSP; inline/eval allowed, hosted CORS-lista, ha sem `ALLOWED_ORIGINS`, sem `NEXT_PUBLIC_APP_URL` nincs beállítva | HTTPS proxy, egress-szabály, KMS döntés, `ALLOWED_ORIGINS` | `crypto.test.ts`; `outbound-destination.test.ts`; proxy a link-localra 400; `mtls.test.ts` | partial |
| SI | Integritás | 21(2)(e) | Dependabot, `npm audit:production`, CI teszt, CodeQL, CycloneDX SBOM, SBOM-blob cosign. **Kész a `main`-en:** [#205](https://github.com/matebenyovszky/agentplaybooks/pull/205). Auditnapló hash-lánc (kulcs nélküli). **Kész a `main`-en:** [#202](https://github.com/matebenyovszky/agentplaybooks/pull/202). Nincs aláírt konténer-registry, image-szkennelés, konténer-keményítés; skill-/személyiség-változás jóváhagyás nélkül | Javítási ritmus, extra scanner, syslog/SIEM mint külső másolat | CI verify; audit:production; CodeQL; `supply-chain.md`; `/audit/verify` | partial |
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

1. Unit/integráció a CI-ban: kripto, lejárat, `allowed_hosts`, RBAC — **van**. Hash-lánc, export, syslog/SIEM, auditor szerep — **a `main`-en van** (**Kész a `main`-en:** [#202](https://github.com/matebenyovszky/agentplaybooks/pull/202)). Napló-törlésállóság, konfigurációváltozás-naplózás, SSRF DNS-ellenőrzés — **a `main`-en van** (**Kész a `main`-en:** [#216](https://github.com/matebenyovszky/agentplaybooks/pull/216)). Az éles beállítások és az ügyfélspecifikus audit-lefedettség üzemeltetői felelősség.
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
- [`src/lib/audit-access.ts`](../../src/lib/audit-access.ts)
- [`src/lib/audit-chain.ts`](../../src/lib/audit-chain.ts)
- [`src/app/api/_shared/audit-forward.ts`](../../src/app/api/_shared/audit-forward.ts)
- [`src/lib/outbound-destination.ts`](../../src/lib/outbound-destination.ts)
- [`supabase/migrations/20261025124500_audit_logs_tamper_resistance.sql`](../../supabase/migrations/20261025124500_audit_logs_tamper_resistance.sql)
- [`supabase/migrations/20261025130000_audit_config_changes.sql`](../../supabase/migrations/20261025130000_audit_config_changes.sql)
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
