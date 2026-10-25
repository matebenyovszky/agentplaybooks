# Biztonsági dokumentumcsomag

**Nyelv:** magyar a beszállítói értékelés elsődleges nyelve; az angol fordítás a `*.md` fájlokban van (a repó dokumentációs mintája: angol `file.md`, magyar `file.hu.md`).

**Közönség:** ügyfél információbiztonságért felelős személye (IBF), kockázatkezelés, jog, üzemeltetés. Készült magyar állami / önkormányzati beszállítói értékeléshez és EIR biztonsági osztályba soroláshoz.

**Ellenőrzés dátuma:** 2026-10-25. A kódbeli állítások a `main` ág akkor aktuális forrására vonatkoznak (benne a merge-elt [#200](https://github.com/matebenyovszky/agentplaybooks/pull/200), [#201](https://github.com/matebenyovszky/agentplaybooks/pull/201), [#202](https://github.com/matebenyovszky/agentplaybooks/pull/202), [#203](https://github.com/matebenyovszky/agentplaybooks/pull/203), [#204](https://github.com/matebenyovszky/agentplaybooks/pull/204), [#205](https://github.com/matebenyovszky/agentplaybooks/pull/205), [#207](https://github.com/matebenyovszky/agentplaybooks/pull/207), [#216](https://github.com/matebenyovszky/agentplaybooks/pull/216)). Párhuzamos, még nem merge-elt PR-ek a gap listában **Folyamatban / In progress** jelöléssel szerepelnek.

> **Jogi ellenőrzés szükséges.** Ez a csomag nem jogi tanács, nem tanúsítvány, és nem helyettesíti az ügyfél saját kockázatelemzését vagy a 7/2024. (VI. 24.) MK rendelet szerinti védelmi intézkedés-kiválasztást. Minden hatály-, osztályba sorolási, felelősségmegosztási és jogértelmezési megjegyzést az ügyfél jogászának és IBF-jének jóvá kell hagynia éles bevezetés előtt.

## Mit tartalmaz

| Dokumentum | Magyar (elsődleges) | Angol |
|------------|---------------------|-------|
| Fehérkönyv (architektúra, kripto, auth, audit, SDLC, hiányosságok) | [whitepaper.hu.md](./whitepaper.hu.md) | [whitepaper.md](./whitepaper.md) |
| Magyarország / NIS2 kontrollonkénti hiányelemzés (ez az audit) | — | [hu-nis2-gap-assessment.md](../compliance/hu-nis2-gap-assessment.md) |
| Eszközleltár (komponensek, portok, kulcsok, függőségek) | [asset-inventory.hu.md](./asset-inventory.hu.md) | [asset-inventory.md](./asset-inventory.md) |
| Kockázatelemzés-sablon (NIST 800-53 családok ↔ MK r. / NIS2) | [risk-assessment.hu.md](./risk-assessment.hu.md) | [risk-assessment.md](./risk-assessment.md) |
| Táblázatkezelő-export | [risk-assessment.csv](./risk-assessment.csv) (kétnyelvű) | ugyanaz a fájl |
| Incidens-runbook (`main`-en [#205](https://github.com/matebenyovszky/agentplaybooks/pull/205) óta) | [incident-runbook.hu.md](./incident-runbook.hu.md) | [incident-runbook.md](./incident-runbook.md) |
| Ellátási lánc artifactek (`main`-en [#205](https://github.com/matebenyovszky/agentplaybooks/pull/205) óta) | — | [supply-chain.md](./supply-chain.md) |
| Helyszíni mentés / visszaállítás (`main`-en [#203](https://github.com/matebenyovszky/agentplaybooks/pull/203) óta) | [backup-restore.hu.md](../self-host/backup-restore.hu.md) | [backup-restore.md](../self-host/backup-restore.md) |

Élő stack-lista (Docker Compose `ps` / `images` / portok):

```bash
npm run inventory:self-host
# vagy: node scripts/list-self-host-stack.mjs --json
# Supabase compose-szal: node scripts/list-self-host-stack.mjs --compose-file /path/to/supabase/docker-compose.yml
```

A hivatkozások és a citált forrásfájlok ellenőrzése:

```bash
npm run docs:check
```

## Jogforrások (elsődleges szövegek)

A csomag **nem idéz és nem talál ki** 7/2024. MK rendeleti tétel-azonosítókat. A kontrollok NIST SP 800-53 rev. 5 családneveken szerepelnek; a rendeletbeli pontos számozás ügyféli egyeztetés tárgya — **jogi ellenőrzés szükséges**.

| Jogforrás | Szerepe ebben a csomagban |
|-----------|---------------------------|
| NIS2 irányelv (EU) 2022/2555, 21. cikk (2) (a), (d), (g) | Kockázatelemzési / ISMS-politika, ellátási lánc, kiberhigiénia és képzés — [EUR-Lex](https://eur-lex.europa.eu/eli/dir/2022/2555/oj) |
| 2024. évi LXIX. tv. (Kiberbiztonsági tv.) | EIR, biztonsági osztály, hatály — [NJT](https://njt.jog.gov.hu/jogszabaly/2024-69-00-00) |
| 7/2024. (VI. 24.) MK rendelet | Osztályba sorolás, kockázatmenedzsment, NIST 800-53 rev. 5 alapú intézkedéskatalógus — [NJT](https://njt.jog.gov.hu/jogszabaly/2024-7-20-7G) |
| 418/2024. (XII. 23.) Korm. rendelet | Incidensbejelentési határidők — [NJT](https://njt.jog.gov.hu/jogszabaly/2024-418-20-22) |
| GDPR (EU) 2016/679 | Adatbiztonság, adatfeldolgozói státusz — [EUR-Lex](https://eur-lex.europa.eu/eli/reg/2016/679/oj) |
| EiR útmutatók (NBSZ NKI) | Gyakorlati segítség a 7/2024. MK rendelethez — [nki.gov.hu](https://nki.gov.hu/it-biztonsag/kiadvanyok/segedletek/eir-utmutato/) |

Kapcsolódó üzemeltetési útmutató: [`public/docs/self-hosting.md`](../../public/docs/self-hosting.md). Self-host mTLS: [`public/docs/self-hosted-mtls.md`](../../public/docs/self-hosted-mtls.md). Mentés/visszaállítás: [`docs/self-host/backup-restore.md`](../self-host/backup-restore.md). Sérülékenység-politika: [`SECURITY.md`](../../SECURITY.md). Webes rövid összefoglaló: [`public/docs/security.md`](../../public/docs/security.md) / [`public/docs/security.hu.md`](../../public/docs/security.hu.md).

## Kész a `main`-en (merge-elve)

Ezek a gapek a `main`-en záródtak. A fehérkönyv sorai a merge-elt PR-ekre hivatkoznak.

| Gap | Kész a `main`-en |
|-----|------------------|
| 10 self-host mTLS trusted proxy-n (`MTLS_MODE=proxy`) | [#201](https://github.com/matebenyovszky/agentplaybooks/pull/201) |
| 11 build-kori Google Fonts (`next/font/local`) | [#200](https://github.com/matebenyovszky/agentplaybooks/pull/200) |
| 11 izolált no-egress CI (`deploy/airgap/`) | [#204](https://github.com/matebenyovszky/agentplaybooks/pull/204) |
| 8 helyszíni mentés / restore-runbook + üres-gép drill | [#203](https://github.com/matebenyovszky/agentplaybooks/pull/203) |
| 7 `SECURITY.md` / incidens-runbook; 9 CodeQL, CycloneDX SBOM, SBOM-blob cosign | [#205](https://github.com/matebenyovszky/agentplaybooks/pull/205) |
| 7 GitHub privát sérülékenység-jelentés mint egyetlen kapcsolat (nincs security e-mail; best-effort review) | [#207](https://github.com/matebenyovszky/agentplaybooks/pull/207) |

## Párhuzamos PR-ek (nincsenek a `main`-en)

A kódállítás a `main`. Az alábbi gapek még nyitottak; merge után a fehérkönyv gap-sorát kell átbillenteni.

| Gap | Folyamatban / In progress |
|-----|---------------------------|
| 4 auditor szerep; 6 audit export / syslog / SIEM / megőrzés / hash-lánc | [#202](https://github.com/matebenyovszky/agentplaybooks/pull/202) |

## Amit ez a csomag nem állít

A termék **nem** tanúsított a 7/2024. MK rendelet egyetlen biztonsági osztályára sem. Az osztályba sorolás (alap / jelentős / magas) az ügyfél EIR-jére vonatkozik, nem a beszállító marketingjére — **jogi ellenőrzés szükséges**.

A fehérkönyv csak azt állítja, amit a forráskód ténylegesen csinál. A hiányosságok listája szándékosan őszinte; lásd [whitepaper.hu.md — Ismert hiányosságok](./whitepaper.hu.md#ismert-hiányosságok).
