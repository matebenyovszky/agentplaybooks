---
title: Hogyan segít megfelelni egy saját hosztolású AgentPlaybooks-példány az uniós kiberbiztonsági és adatvédelmi követelményeknek
description: A titkok, naplók és playbook-adatok a saját infrastruktúrán maradhatnak. A poszt a NIS2, a GDPR, a CRA és a kapcsolódó naplózási szabályok kódban létező funkciókhoz rendelését mutatja — és azt, ami továbbra is az üzemeltető feladata.
date: 2026-10-25
author: Mate Benyovszky
---

# Hogyan segít megfelelni egy saját hosztolású példány az uniós kiberbiztonsági követelményeknek

Egy helyi AgentPlaybooks-példány nem tanúsítvány. **Segíthet megfelelni** több uniós szabály technikai részének, mert **a titkok, az audit-sorok és a playbook-adatok azon az infrastruktúrán maradnak, amelyet te üzemeltetsz**. A jogi kötelezettségek — kockázatelemzés, incidensbejelentés, képzés, hatásvizsgálat, infrastruktúra megerősítése — az üzemeltetőéi maradnak.

Ez nyilvános források első olvasata a saját hosztolású termékhez képest, nem jogi tanács. Az, hogy mi köt téged, a jogászod és az információbiztonságért felelős személyed döntése.

## A titkok, naplók és adatok a saját infrastruktúrán maradnak

A hosztolt szolgáltatásban az alkalmazás Cloudflare-en, az adatbázis Supabase-en fut. Saját telepítésben mindkettőt te futtatod. Az alkalmazás konténere a Supabase Data API-t és az Auth-ot hívja; önmagában egy PostgreSQL-szerver nem elég. Lásd: [Önhosztolás](/docs/self-hosting).

Gyakorlatban:

- A széf értékei **AES-256-GCM** titkosított szövegként, felhasználónkénti HKDF-kulccsal tárolódnak. A mesterkulcs (`SECRETS_ENCRYPTION_KEY`) a *te* folyamatod környezetében van. A termékben nincs KMS és nincs HSM.
- Az ügynökök elnevezett titkokat a **`use_secret`** (GET/HEAD) és a **`use_secret_write`** (POST/PUT/PATCH/DELETE) eszközzel, vagy a `POST /api/playbooks/:guid/secrets/proxy` végponttal használnak. A szerver visszafejt, fejlécbe tesz, és **csak a HTTP választ** adja vissza. A proxy közvetlenül nem adja vissza a széf értékét. A célrendszer HTTP-válasza azonban visszatükrözhet hitelesítő adatot, ezért csak megbízható célokat engedélyezz; a reveal külön, kifejezett jogosultság.
- Minden titok **`allowed_hosts`** listával rögzíthető. A `SECRETS_REQUIRE_ALLOWED_HOSTS=true` a saját példányon kötelezővé teszi a rögzítést.
- A titok **`expires_at`** mezője leállítja a proxyt, a föderációt és az API-kulcsos reveal-t. A tulajdonos a vezérlőpulton továbbra is megnyithatja az értéket, hogy lecserélje.
- Tanúsítványos kliensek (`secret_clients`) saját hosztoláskor TLS-lezárót és **`MTLS_MODE=proxy`** beállítást igényelnek, amely a proxy privát csatornáját `MTLS_PROXY_SHARED_SECRET` kulccsal hitelesíti, és a beállított proxycímet a `MTLS_TRUSTED_PROXIES` listával ellenőrzi. Lezáró nélkül a tanúsítványos azonosítás zárva marad.
- A belépés a saját tenanszra szűkíthető **Microsoft Entra ID**-vel (`GOTRUE_EXTERNAL_AZURE_*` a GoTrue-n). Alkalmazásszintű MFA nincs; az MFA az identitásszolgáltató feladata.
- A helyszíni titkosított mentés és az üres gépre visszaállítás gyakorlata dokumentált. A mesterkulcs **soha** nincs az archívumban.

**Audit-nyomvonal.** Az **`audit_logs`** a széf műveleteit (`secret.*`) és a föderált MCP-hívásokat rögzíti. Az elutasítás is esemény. A sor hostname-et tart, teljes URL-t és titokértéket nem. A skill-, memória- és canvas-írások naplózottak; a bejelentkezések és auditolvasások külön lefedést igényelnek.

- **Hash-lánc / hamisításjelzés** — playbookonkénti SHA-256 lánc (`hash = sha256(kanonikus JSON, benne a prev_hash)`). Az első sor 64 nulla hex karakterhez láncolódik. Beszúró trigger írja a láncszemet; a módosítás elutasított, a sorok megváltoztathatatlanok. A `GET /api/playbooks/:guid/audit/verify` és az `apb audit verify` HTTP 409-et ad, ha a lánc törik.
- **Export** — `format` json, jsonl vagy csv a `GET /api/playbooks/:guid/audit` végponton. A `GET /api/playbooks/:guid/audit/export` alapértelmezése JSONL. CLI: `apb audit export`.
- **Megőrzés** — az `AUDIT_RETENTION_DAYS` üres / `0` / `forever` megtartja a sorokat. Pozitív egész szám ütemezett törlést kapcsol (`POST /api/cron/audit-purge` az `AUDIT_CRON_SECRET` tokennel). A törlés checkpointot és `audit.retention_purge` eseményt ír, hogy a maradék lánc továbbra is ellenőrizhető legyen. A tulajdonos `apb audit purge` parancsot is futtathat.
- **Auditor szerep** — collaborator `auditor` és playbook API-kulcs `auditor` (felhasználói kulcs `audit:read`). Csak olvasás, export, ellenőrzés. Titokérték nincs, írás nincs. A playbook metaadata látszik; a persona, a skillek és a széf tartalma nem.
- **SIEM / syslog** — alapból ki. Opcionális `AUDIT_SYSLOG_URL` (`udp://`, `tcp://` vagy `tls://`, RFC 5424) és `AUDIT_SIEM_WEBHOOK_URL` az `AUDIT_SIEM_WEBHOOK_SECRET` HMAC-SHA256 kulccsal (legalább 32 bájt véletlen). A továbbítás backoffkal újrapróbál, a széfet nem blokkolhatja; elérhetetlen SIEM nem rontja el a titokhívást. A syslog Node-socketeket használ saját hosztoláskor; a HTTPS webhook Cloudflare Workersen is megy.
- Automatizált tesztkészlet ellenőrzi, hogy a nyers API-kulcsok és a titokértékek soha ne jelenjenek meg a tárolt audit-sorokban, az exportban, a syslogban vagy a SIEM-törzsben.

## Követelmény és funkció

A „segít” nem azt jelenti, hogy „teljesíti”. Az (EU) 2024/2690 végrehajtási rendelet a NIS2 21. cikkéhez tartozó műszaki és módszertani követelményeket részletezi; a kontrollok kiválasztása, üzemeltetése és bizonyítása továbbra is a tiéd.

| Jogforrás | Mit kér (egyszerű olvasat) | Miben segít a helyi példány |
| --- | --- | --- |
| NIS2 21. cikk — kockázatkezelési intézkedések | Rendszerek biztonsága, kriptográfia, hozzáférés, ellátási lánc, naplózás, mentés, sérülékenységkezelés | Adatok a saját stacken; AES-256-GCM széf; `use_secret`, hogy az ügynök ne lássa az értéket; `allowed_hosts` + SSRF; Entra SSO-hook; owner/editor/auditor RBAC |
| NIS2 21. cikk (2) (c) — mentés és helyreállítás | Mentéskezelés és katasztrófa utáni helyreállítás | [Helyszíni mentés és visszaállítás](/docs/backup-restore) runbook, titkosított archívum, üres gépes gyakorlat a CI-ban |
| NIS2 21. cikk (2) (d) — ellátási lánc | IKT-származás | CycloneDX SBOM, SBOM-blobok cosign aláírása `cli-v*` tageken, CodeQL, Dependabot, npm provenance a CLI-hez. Nincs aláírt konténer-**registry** közzététel |
| NIS2 21. cikk (2) (e) — sérülékenységkezelés | Bejelentés és javítás folyamata | [SECURITY.md](https://github.com/matebenyovszky/agentplaybooks/blob/main/SECURITY.md) és [GitHub privát sérülékenységjelentés](https://github.com/matebenyovszky/agentplaybooks/security/advisories/new). A karbantartói átnézés best-effort; a törvényi órák a tieid |
| NIS2 21. cikk (2) (f) és 23. cikk — naplózás és bejelentés | Jelentős incidens észlelése, naplózása, bejelentése | `audit_logs` a széfhez és a föderált hívásokhoz, playbookonkénti hash-lánccal, JSON/JSONL/CSV exporttal, opcionális megőrzéssel, csak olvasható auditor szereppel és opcionális syslog/SIEM-továbbítással. A termék **nem** küld bejelentést hatóságnak |
| (EU) 2024/2690 végrehajtási rendelet | A 21. cikk intézkedéseinek műszaki és módszertani követelményei | A fenti sorok terméktámogatás. A 2024/2690 családokra vetítés üzemeltetői dokumentum |
| GDPR 5., 25., 32. cikk | Célhoz kötöttség, beépített adatvédelem, a kezelés biztonsága | Titok alapból nincs a modell kontextusában; ciphertext nyugalomban; saját hosztoláskor te választod a régiót és a feldolgozókat |
| GDPR 13. cikk | Tájékoztatás az érintetteknek | Saját hosztoláskor általában te vagy az adatkezelő, és neked kell tájékoztatnod. A hosztolt adatvédelmi tájékoztató a te példányodra nem vonatkozik |
| CRA (EU) 2024/2847 | Piacon, kereskedelmi tevékenység keretében forgalomba hozott digitális elemeket tartalmazó termékek | A díjmentes, nem monetizált nyílt forráskód jelenleg kívül esik ezen a kereskedelmi-tevékenység teszten (preambulum (18)). Az SBOM és a sérülékenységkezelés már a repóban van, ha a státusz később változik |
| DORA (EU) 2022/2554 | IKT-naplózás és incidensbejelentés a hatálya alá tartozó pénzügyi szervezeteknek | Ha a DORA téged köt, a kötelezettség a tiéd marad. A helyi példány a vonatkozó naplókat a te rendszereiden tartja, exporttal és opcionális SIEM/syslog-továbbítással |
| MI-rendelet (EU) 2024/1689 | Naplózás / nyilvántartás magas kockázatú rendszereknél (12. cikk) és az üzembe helyezőnél (26. cikk) | A termék nem minősíti a te MI-rendszeredet. A hash-láncolt széf- és föderációs audit sorok, plusz az export, a te nyilvántartásodba kerülhetnek, ha hatály alá esel |

### Magyar sajátosságok

A **2024. évi LXIX. törvény Magyarország kiberbiztonságáról** (Kiberbiztonsági tv.) a NIS2 magyar átültetése. A végrehajtási szabály a **418/2024. (XII. 23.) Korm. rendelet Magyarország kiberbiztonságáról szóló törvény végrehajtásáról**. A rendelet **77. §**-a a bejelentési órákat rögzíti: a tudomásszerzéstől számított **24 órán belül** első bejelentés, **72 órán belül** eseménybejelentés, az eseménybejelentést követő **egy hónapon belül** zárójelentés. Ha az incidens akkor még tart, a rendelet szerinti közbenső / későbbi zárójelentés az üzemeltető folyamata.

A **7/2024. (VI. 24.) MK rendelet** címe: *a biztonsági osztályba sorolás követelményeiről, valamint az egyes biztonsági osztályok esetében alkalmazandó konkrét védelmi intézkedésekről*. A védelmi intézkedések katalógusa a NIST SP 800-53 rev. 5 családjaira épül. Az AgentPlaybooks kockázatértékelési sablonja **családneveket** ad (AC, AU, SC, …), és **nem talál ki** rendeletbeli tételszámokat. Az EIR osztály (alap / jelentős / magas) és a pontos tételválasztás az információbiztonsági felelősé (IBF).

A bejelentés az **üzemeltető** (az érintett szervezet és az IBF) feladata, nem a szoftveré. A 24/72 óra / egy hónap órák nem a GitHub-jelentésekre tett karbantartói vállalások.

### Opcionális ISO/IEC 27001 és NIST SP 800-53 térkép

Ez olvasási segédlet, nem ISO 27001- vagy NIST-értékelés.

| Téma | Termékoldal |
| --- | --- |
| Kriptográfia (ISO 27001 A.8.24 / NIST SC) | AES-256-GCM, felhasználónkénti HKDF, AAD-kötött v2 ciphertext. Nincs KMS |
| Naplózás (A.8.15 / AU) | `audit_logs` hash-lánccal, exporttal, opcionális megőrzéssel, auditor szereppel, SIEM/sysloggal. A skill-, memória- és canvas-írások naplózottak; a bejelentkezések és auditolvasások külön lefedést igényelnek |
| Mentés (A.8.13 / CP) | Titkosított dump + visszaállítási gyakorlat; az RPO/RTO a tiéd |
| Hozzáférés (A.5.15 / AC, IA) | owner / editor / auditor; Entra OIDC; self-host mTLS megbízható proxy-n |
| Ellátási lánc (A.5.21 / SR, SI) | lockfile, CodeQL, CycloneDX, SBOM-blobok cosign aláírása |

Részletesebb családtábla a [biztonsági dokumentációs csomagban](/docs/security) van.

## Ami az üzemeltető felelőssége marad

A szoftver ezeket nem végzi el helyetted:

- **Kockázatkezelés** — besorolás, 21. cikk szerinti politika, kontrollválasztás a 2024/2690 alatt, maradék kockázat.
- **Incidensbejelentés** — NIS2 23. cikk és a 418/2024. 77. § órái. Az [incidens runbook](https://github.com/matebenyovszky/agentplaybooks/blob/main/docs/security/incident-runbook.hu.md) a *te* beadványod sablonja.
- **Képzés** — a 21. cikk (2) (g) szervezeti kontroll, nem szoftverfunkció.
- **Infrastruktúra megerősítése** — TLS-lezárás, hálózati izoláció, javítási ablakok, fizikai védelem, IdP MFA. A compose a 3000-es porton indítja az appot; nem zár TLS-t, és nem indítja a Supabase-t.
- **DPIA és GDPR-szerepek** — saját hosztoláskor általában te döntöd el a célokat és az eszközöket. A hatásvizsgálat, a kezelési nyilvántartás és a 13. cikk szerinti tájékoztatás a tiéd, ha személyes adat van a rendszerben.

Őszinte hiányok: nincs KMS/HSM, nincs újratitkosítás a mesterkulcs cseréjekor, nincs alkalmazás-MFA, nincs SAML, nincs aláírt konténer-registry image, a CSP kikényszerített, de az inline szkriptek és eval még megengedettek, a bejelentkezések és auditolvasások külön lefedést igényelnek.

## Hogyan telepítsd helyben

A meglévő útmutatókat kövesd, ne ezt az összefoglalót:

1. [Önhosztolás](/docs/self-hosting) — új adatbázishoz `supabase/schema.sql`, saját hosztolású Supabase (nem csupasz Postgres), Docker `app` a 3000-es porton vagy Cloudflare Pages. A `NEXT_PUBLIC_APP_URL` **build** idején kell. A `SECRETS_ENCRYPTION_KEY` kizárólag védett **futásidejű** környezeti változó legyen; ne kerüljön konténerképbe vagy nyilvános buildváltozóba.
2. [Önhosztolt mTLS](/docs/self-hosted-mtls) — lezáró + `MTLS_MODE=proxy`, ha tanúsítványos klienst használsz.
3. [Helyszíni mentés és visszaállítás](/docs/backup-restore) — ugyanaz a szöveg, mint a repó `docs/self-host/backup-restore.hu.md` fájlja; `scripts/self-host/backup.sh` és az üres gépes gyakorlat.
4. [Auditnaplók](/docs/audit-logs) — hash-lánc, export, megőrzés, auditor szerep és opcionális SIEM/syslog (`AUDIT_SYSLOG_URL`, `AUDIT_SIEM_WEBHOOK_URL`).
5. Légzár opciók az önhosztolási oldalon: `NO_EGRESS=true`, `SECRETS_REQUIRE_ALLOWED_HOSTS=true`, helyi Geist betűk (`next/font/local`). Az izolált no-egress CI: `.github/workflows/no-egress.yml` és `deploy/airgap/`. A produkciós compose továbbra is csak az app; az `npm ci` és az alapimage-ek a zárás előtt registry-t igényelnek.
6. Entra ID: `GOTRUE_EXTERNAL_AZURE_*` az önhosztolási útmutató szerint.
7. Biztonsági csomag: [Biztonsági dokumentáció](/docs/security). Sérülékenységjelentés: [GitHub privát advisory űrlap](https://github.com/matebenyovszky/agentplaybooks/security/advisories/new) — nincs security e-mail.

Kapcsolódó: [Secrets Vault](/blog/secrets-vault-secure-credential-management), [Python secrets](/docs/python-secrets).

## Záradék

Ez a cikk **nem jogi tanács** és **nem tanúsítvány**. Az AgentPlaybooks futtatása, akár a saját gépeiden, nem ruház NIS2-, GDPR-, CRA-, DORA- vagy MI-rendelet szerinti státuszt. Az üzemeltető felelős marad azért, amit a jog a szervezetétől követel. Az itt szereplő jogi értelmezéseket éles használat előtt ellenőrizni kell.
