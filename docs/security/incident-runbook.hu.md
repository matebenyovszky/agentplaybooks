# Incidenskezelési runbook

Magyar. Angol: [incident-runbook.md](./incident-runbook.md).
A tároló sérülékenység-bejelentése: [SECURITY.md](../../SECURITY.md).
SBOM és `cosign verify`: [supply-chain.md](./supply-chain.md).

> **jogi ellenőrzés szükséges.** A runbook minden jogi értelmezése (ki
> köteles bejelenteni, melyik hatóságnak, mi számít „jelentős
> incidensnek”, gyártók vagyunk-e a CRA szerint, GDPR-szerepek) nyilvános
> források első olvasata, nem jogi tanács. Éles folyamatot ügyvédnek és az
> ügyfél IBF-jének (információbiztonságért felelős személy) kell
> jóváhagynia.

## Cél és ki jelent

A runbook két feladatot lát el:

1. Segíti az **ügyfelet** (a hosztolt vagy self-hosted AgentPlaybooks
   példány üzemeltetőjét, például egy magyar állami szervet) a törvényi
   incidensbejelentés adatcsomagjának összeállításában.
2. Megmondja a **karbantartóknak**, hogyan támogatjuk az ügyfelet, és
   hogyan kezeljük a terméksérülékenységeket, ideértve a CRA 14. cikkét,
   ha később gyártók lennénk.

**Az ügyfél a bejelentésre kötelezett szervezet.** A NIS2 23. cikke és a
418/2024. (XII. 23.) Korm. rendelet 77. §-a szerint az elektronikus
információs rendszert üzemeltető szervezet jelent a hatáskörrel rendelkező
szervnek. Magyar **állami és önkormányzati szervek** esetén ez jellemzően
az **NBSZ NKI** ([incidens.nki.gov.hu](https://incidens.nki.gov.hu)). Ha a
portál nem elérhető, az NKI tartalékcsatornát ad meg ugyanazon a honlapon.
*jogi ellenőrzés szükséges*

Mi a **beszállító** vagyunk. Az NKI / NIS2 bejelentést nem az ügyfél
nevében adjuk be. Naplókat, SBOM-ot, javított verziót és kitöltött
adatcsomagot adunk, amelyet az ügyfél IBF-je a portálra másolhat.

A **CRA (EU) 2024/2847 14. cikke** más: ha az AgentPlaybooks egy
kereskedelmi tevékenység keretében forgalomba hozott, digitális elemeket
tartalmazó termék **gyártója**, akkor **mi** jelentjük az aktívan kihasznált
sérülékenységet és a termék biztonságát érintő súlyos incidenst a
koordinátorként kijelölt CSIRT-nek és az ENISA-nak az egységes bejelentési
platformon. Az ingyenesen elérhető nyílt forrás más rezsim alá eshet; a
fizetős pilot vagy támogatás gyártóvá tehet. A 14. cikk szerinti jelentés
2026. szeptember 11-től alkalmazandó. **CRA gyártói / nyílt forrású
steward státusz: nyitott, döntésre vár.** Ez a nyitott tétel nem blokkolja
az üzemeltetői bejelentést és a GitHub-jelentéseket. *jogi ellenőrzés
szükséges*

A GitHub privát sérülékenység-bejelentésen érkező jelentéseket a
karbantartók legjobb tudásuk szerint, erőfeszítés alapon vizsgálják.

A GDPR 33. cikk (72 órás adatvédelmi incidens a felügyeleti hatóságnak) az
**adatkezelő** kötelezettsége. Self-hosted példánynál általában nem vagyunk
adatfeldolgozók. *jogi ellenőrzés szükséges*

## Szerepek

| Szerep | Ki | Mit csinál |
| --- | --- | --- |
| Ügyfél IBF | Az ügyfél információbiztonságért felelős személye | Dönt a bejelentéskötelességről, beadja az NKI / hatóság felé, birtokolja a törvényi órákat |
| Ügyfél incidensvezető | Az ügyfél kijelölt kapcsolattartója | Észlelés, elhárítás a *saját* infrastruktúrán, bizonyíték megőrzése |
| Ügyfél jog / DPO | Ügyfél | NIS2 / Kiberbiztonsági tv. / GDPR besorolás. *jogi ellenőrzés szükséges* |
| Karbantartók | Az AgentPlaybooks karbantartói ([SECURITY.md](../../SECURITY.md)) | Erőfeszítés alapú terméktriaázs, javítás, CVE/GHSA, a javított kiadás SBOM-ja; CRA 14. cikk csak ha a gyártói státusz eldől |
| Aki a javítást szállítja | Egy karbantartó | Reprodukál, javít, `cli-v*` címkét vág, titkot nem ír gitbe vagy jegybe |
| Auditor (ha elkészül) | Az ügyfél kijelölt, csak olvasó szerepe | `audit_logs` olvasása; ma a nyomvonalat csak a playbook **tulajdonosa** (munkamenet vagy `playbooks:read` felhasználói API-kulcs) olvashatja |

## Észlelés

Az alábbiak bármelyike jelölt incidens. Az észlelés önmagában nem indítja
el a 24 órás törvényi órát; a **bejelentésre kötelezett szervezet
tudomásszerzése** igen. *jogi ellenőrzés szükséges*

| Forrás | Mit keress |
| --- | --- |
| `audit_logs` | `denied` / `error` rámpa `secret.use` / `secret.*` eseményeken, váratlan `actor_type`, új célállomás-hostok |
| Ügyfél IdP / WAF / gépnapló | Lehetetlen utazás, mTLS-hiba, tömeges 401/403 az `/api/*` felületen |
| Dependabot, `npm run audit:production`, CodeQL | Kihasználható függőség vagy first-party találat élesben |
| [SECURITY.md](../../SECURITY.md) jelentés | Kutatói vagy ügyféljelentés, különösen „aktívan kihasznált” |
| Mentés / épségellenőrzés | Séma vagy vault-ciphertext, ami nem egyezik az utolsó ismert jó állapottal |
| Ember | Elveszett laptop, kiszivárgott `SECRETS_ENCRYPTION_KEY`, service-role kulcs |

## Triaázs

1. **A termék, az ügyfél üzemeltetése, vagy harmadik fél?** A vault
   kriptográfia ebben a repóban van; az SSO/MFA, a hálózat és a Postgres
   hoszting az ügyfélé (vagy a Supabase-é), hacsak nem mi üzemeltetjük a
   hosztolt SaaS tenánszt.
2. **Bizonyítékot őrizni**, mielőtt olyan kulcsot rotálunk, ami a naplót
   ellenőrizhetetlenné tenné. A rotáció így is gyors; előbb pillanatkép.
3. **Súlyosság** (táblázat lent). Az ügyfél IBF ezt képezi le a hatóság
   felé „jelentős incidensre” / „nagykiterjedésűre”. *jogi ellenőrzés
   szükséges*
4. **Aktívan kihasznált?** Ha igen, párhuzamosan a CRA 14. cikk sáv
   (beszállító) *és* a NIS2 / 77. § sáv (ügyfél).
5. **Személyes adat?** Ha igen, az ügyfél DPO a GDPR 33. cikket mérlegeli.
   *jogi ellenőrzés szükséges*

### Súlyosság (termék / üzemeltetés)

Ezek a címkék az üzemeltető és a karbantartók közötti beszélgetést
segítik. **Nem** javítási határidők, és nem ígért válaszidő.

| Súlyosság | Példák |
| --- | --- |
| Kritikus | Vault-kulcs szivárgás; hitelesítés nélküli titokolvasás; aktív kihasználás |
| Magas | Auth-bypass másik tenánsz playbookjaira; service-role jogosultságkiterjesztés |
| Közepes | Hitelesített auditnapló-injektálás; CSRF állapotváltoztató útvonalon |
| Alacsony | Nem titok metaadat szivárgása; megerősítési hiány |

A törvényi **bejelentéskötelesség** nem azonos ezzel a táblázattal. Egy
közepes termékhiba is bejelentendő incidens lehet az ügyfélnél, ha az
általuk EIR-ként bejelentett szolgáltatást rontotta. *jogi ellenőrzés
szükséges*

## Bizonyítékgyűjtés

Jegybe vagy NKI-csomagba **ne** másolj titokértéket, `SECRETS_ENCRYPTION_KEY`
értéket, service-role kulcsot, vagy query stringet tartalmazó teljes URL-t.
Az `audit_logs` szándékosan csak metaadat (`src/app/api/_shared/audit.ts`):
művelet, cél **host**, státusz, szereplő típusa/id-előtagja, titok **neve**,
request id, időbélyeg.

### `audit_logs` ma

Tulajdonosi munkamenet vagy **felhasználói** API-kulcs `playbooks:read`
jogosultsággal (nem playbook-ügynök kulcs):

```bash
# Utolsó 500 esemény (API-korlát)
curl -sS -H "Authorization: Bearer $USER_API_KEY" \
  "$ORIGIN/api/playbooks/$PLAYBOOK_GUID/audit?limit=500" \
  -o audit-logs-$(date -u +%Y%m%dT%H%M%SZ).json

# Csak vault-műveletek
curl -sS -H "Authorization: Bearer $USER_API_KEY" \
  "$ORIGIN/api/playbooks/$PLAYBOOK_GUID/audit?operation=secret.&limit=500" \
  -o audit-secrets-$(date -u +%Y%m%dT%H%M%SZ).json
```

A `GET /api/mcp/audit/:guid` ugyanaz a kezelő. Őrizd a JSON-t, a `Date`
válaszfejlécet, a request id-t ha van, és hogy ki húzta le.

### Export / igazolás (amint elérhető)

<!-- TODO: ezt a szakaszt cserélni, ha megvan a SIEM-export, a megőrzés, a hash-lánc és az auditor szerep. -->

A megfelelési backlog még tartalmazza:

- az `audit_logs` syslog / SIEM exportját;
- megőrzést és törlést;
- hash-láncot, hogy a hamisított sor detektálható legyen;
- auditor szerepet.

**Amíg ezek nem készülnek el, nincs termékparancs az exportra vagy a
hash-lánc igazolására.** Az üzemeltető:

1. Húzza le a JSON-t a fentiek szerint, és írható-egyszeres tárra tegye.
2. Készítsen adatbázis-mentést (`supabase db dump` vagy a szállító PITR-je)
   az `audit_logs` táblával, és jegyezze a mentés azonosítóját és idejét.
3. Ha az export/igazolás elkészül, húzza újra az időablakot, futtassa az
   igazoló eszközt; a 72 órás / záró csomaghoz csatolja a régi JSON-t és az
   igazoló jelentést.

Ne várj ezekre a funkciókra a 24 órás óra elindításával.

### Egyéb bizonyíték

- A futó alkalmazás git SHA-ja vagy `cli-v*` címkéje; image digest, ha van
- Kiadási SBOM + `cosign verify-blob` kimenet ([supply-chain.md](./supply-chain.md))
- Dependabot / CodeQL / `npm audit` kimenet, ha függőség érintett
- WAF, IdP és reverse-proxy naplók (ügyfél)
- Elhárítási idővonal (kulcsrotáció, munkamenet-visszavonás, `allowed_hosts`)

## Elhárítás (beszállítói támogatás)

Tipikus terméklépések, amelyekben az ügyfelet támogatjuk; a környezetet
továbbra is az ügyfél birtokolja:

1. Kiszivárgott API-kulcsok és IdP-munkamenetek visszavonása;
   `SECRETS_ENCRYPTION_KEY` rotációja csak tervvel — a rotáció ma
   olvashatatlanná teszi a meglévő vault-ciphertextet (még nincs
   újratitkosító eszköz).
2. Nyilvános playbook-hozzáférés tiltása, ha az incidens nyilvános GUID-on
   van.
3. `allowed_hosts` rögzítése / `SECRETS_REQUIRE_ALLOWED_HOSTS=true`, ha a
   titok váratlan hosztra ment (`audit_logs.target`).
4. Javított `cli-v*` (és hosztolt deploy) SBOM-mal és npm provenance-szel.

## Bejelentési adatcsomagok

Az alábbi órák az **üzemeltető törvényi bejelentési kötelezettségei** a
**418/2024. (XII. 23.) Korm. r. 77. §** és a **NIS2 23. cikke** szerint,
nem ígéret arra, hogy a karbantartók egy GitHub-jelentésre ezeken az
órákon belül válaszolnak. Akkor indulnak, amikor a **bejelentésre
kötelezett szervezet** (az ügyfél) tudomást szerez.
*jogi ellenőrzés szükséges*

Magyar állami szervek elektronikusan az **NBSZ NKI**-nak jelentenek
([incidens.nki.gov.hu](https://incidens.nki.gov.hu)); honvédelmi célú EIR
esetén más központ vonatkozhat (418/2024. 78. §). Jelentős vagy
nagykiterjedésű incidensnél a bejelentést haladéktalanul telefonon is meg
kell tenni (78. § (2)). *jogi ellenőrzés szükséges*

Minden ismeretlen mező legyen `unknown`, ne töröld. A csomagon TLP
(WHITE/GREEN/AMBER/RED). A fertőzöttségi mutatókat (77. § (1) 2.) **amint
megvannak**, nem csak 72 órakor kell küldeni.

### 24 órás első bejelentés (korai riasztás)

Határidő: indokolatlan késedelem nélkül, legkésőbb a tudomásszerzéstől
számított **24 órán** belül (77. § (1) 1.; NIS2 23. cikk (4) a)).

```text
TLP:
Bejelentő szervezet (jogi név, adó- / org. azonosító):
IBF neve és elérhetősége:
Beszállítói kapcsolat (AgentPlaybooks): https://github.com/matebenyovszky/agentplaybooks/security/advisories/new
Hatóság / portál: NBSZ NKI / incidens.nki.gov.hu  (vagy más: ________)
Tudomásszerzés ideje (UTC):
A csomag előállításának ideje (UTC):

a) Érintett EIR / rendszer:
   AgentPlaybooks példány origin:
   Playbook GUID(ok), ha ismert:
   Ügyfél hosztolja / hosztolt SaaS / unknown:
b) Rövid leírás (és üzemeltetési incidens-e):
c) Státusz (folyamatban / elhárítva / helyreállítva / unknown):
d) Időtartam (kezdet–vég vagy folyamatban):
e) A szolgáltatás helyreállításának várható időpontja (ha becsülhető):
f) Érintett adatok fajtája (playbook-tartalom, vault-metaadat, személyes adat? — titokérték nélkül):
g) Érintett felhasználók száma (vagy unknown):
h) A szolgáltatás zavarásának mértéke:
i) Üzemeltetői kapcsolattartó (név, szervezet, telefon, e-mail):
j) Közvetítő / központi szolgáltató, ha van (pl. Cloudflare, Supabase):
k) Szándékolt incidens-e? (igen / nem / unknown):
l) Földrajzi kiterjedés:
m) Lehet határokon átnyúló hatása? (igen / nem / unknown):
n) Minden, ami a Központnak kell a határokon átnyúló hatás megítéléséhez:

Mellékletek:
- audit_logs JSON (csak metaadat) és a letöltés módja
- futó verzió / git SHA / cli-v* címke
- SBOM fájlnevek + cosign verify eredmény (ha van kiadás)
```

### 72 órás eseménybejelentés

Határidő: indokolatlan késedelem nélkül, legkésőbb a tudomásszerzéstől
számított **72 órán** belül (77. § (1) 3.; NIS2 23. cikk (4) b)). Frissíts
minden 24 órás mezőt. Add hozzá a **súlyosság és hatás** első értékelését.
Csatold a fertőzöttségi mutatókat, ha megvannak (és küldd el korábban, ha
korábban megvoltak).

```text
TLP:
A 24 órás bejelentés hivatkozása (portálazonosító / jegy):
A 24 órás mezők (a–n) frissítése:
Első értékelés:
- Súlyosság (ügyfél besorolása):
- Hatás az EIR rendelkezésre állására / sértetlenségére / bizalmasságára:
- Valószínű vektor (hitelesítőadat-szivárgás, függőségi CVE, hibás konfiguráció, unknown):
- Elhárítás eddig:
- Fennmaradó kockázat:

Fertőzöttségi mutatók (külön is, amint megvannak — 77. § (1) 2.):
- hash-ek, hosztnevek, IP-k, request id-k, actor_id előtagok (titok nélkül)

Mellékletek: frissített audit-kivonat; javítás állapota; beszállítói GHSA-azonosító, ha van.
```

### Egyhavi zárójelentés

Határidő: legkésőbb a 72 órás eseménybejelentést követő **egy hónapon**
belül (77. § (1) 5.; NIS2 23. cikk (4) c)). Ha az incidens akkor még tart,
előrehaladási jelentés (77. § (1) 6.), a zárójelentés pedig a **kezelés
befejezését követő egy hónapon** belül (77. § (1) 7.). A Központ kérhet
közbenső helyzetjelentést (77. § (1) 4.).

```text
TLP:
A 24 és 72 órás bejelentések hivatkozása:
a) Részletes leírás, súlyosság és hatás:
b) A valószínű fenyegetéstípus vagy kiváltó ok:
c) Alkalmazott és folyamatban lévő mérséklő intézkedések (javítás, kulcsrotáció, detektálási szabály):
d) Határokon átnyúló hatás (ha van):

Beszállítói függelék:
- GHSA / CVE:
- Javított verziók és cli-v* címke:
- SBOM + cosign verify:
- Mit változtatunk az SDLC-n (teszt, CodeQL-szabály, függőségpin):

Ha még folyamatban: haladás a 72 órás tervhez képest; miért nincs lezárva.
```

### CRA 14. cikk — gyártói sáv, nem az ügyfél

**CRA gyártói / nyílt forrású steward státusz: nyitott, döntésre vár.**
Ez nem blokkolja a fenti üzemeltetői csomagokat és a GitHub-jelentéseket.
*jogi ellenőrzés szükséges*

Ezt a csomagot az ügyfélcsomagok **mellé** használd, ha a gyártói státusz
eldőlt, és tudomást szerzünk a termékben lévő **aktívan kihasznált
sérülékenységről**, vagy a termék biztonságát érintő **súlyos
incidensről**. Az ENISA egységes bejelentési platformján a koordinátor
CSIRT-nek (uniós főtelephely) és az ENISA-nak. A felhasználókat a javító /
enyhítő intézkedésről értesíteni kell. *jogi ellenőrzés szükséges*

A táblázat 24 órás / 72 órás / zárójelentési lépései a CRA 14. cikk
törvényi kötelezettségei, *ha* gyártók vagyunk, nem ígért válaszidő a
kutatóknak.

| Lépés | Aktívan kihasznált sérülékenység | A termék biztonságát érintő súlyos incidens |
| --- | --- | --- |
| Korai riasztás | 24 óra a tudomásszerzésünktől | 24 óra |
| Bejelentés | 72 óra | 72 óra |
| Zárójelentés | 14 nappal a javító vagy enyhítő intézkedés rendelkezésre állása után | a 72 órás bejelentést követő 1 hónap |
| Közbenső | a CSIRT kérésére | a CSIRT kérésére |

```text
TLP:
Gyártó (jogi név, uniós főtelephely): nyitott, döntésre vár — jogi ellenőrzés szükséges
SRP-azonosító:
Termék neve / verzió / cli-v* / SBOM:
Tagállamok, ahol tudomásunk szerint forgalomba hoztuk:
A kihasználás / incidens jellege (exploit-kód nélkül, hacsak a CSIRT nem kéri):
Felhasználói javító vagy enyhítő intézkedések:
A bejelentés érzékenysége:
```

## Tabletop (minimum)

Minden jelentősebb kiadás után végigvinni egy kiszivárgott
`SECRETS_ENCRYPTION_KEY` vagy aktívan kihasznált függőségi CVE esetet:
észlelés → bizonyíték zárolása → az **üzemeltető** 24 órás törvényi
bejelentési csomagjának összeállítása → javítás + aláírt SBOM → az ügyfél
IBF próbabejelentése az NKI felé. A hiányokat (nincs export, nincs auditor
szerep) termékmunkaként rögzíteni, nem sikeres tesztként. A 24 órás lépés
az üzemeltető 77. § szerinti kötelezettsége, nem karbantartói
válaszígéret. *jogi ellenőrzés szükséges*

## Források (elsődleges)

- NIS2 (EU) 2022/2555 21. és 23. cikk — https://eur-lex.europa.eu/eli/dir/2022/2555/oj
- CRA (EU) 2024/2847 14. és 16. cikk — https://eur-lex.europa.eu/eli/reg/2024/2847/oj
- 2024. évi LXIX. tv. — https://njt.jog.gov.hu/jogszabaly/2024-69-00-00
- 418/2024. (XII. 23.) Korm. r. 77–80. § — https://njt.jog.gov.hu/jogszabaly/2024-418-20-22
- NKI-portál — https://incidens.nki.gov.hu
- ENISA CRA SRP FAQ — https://www.enisa.europa.eu/topics/product-security/vulnerability-services/eu-incident-response-and-cyber-crisis-management/single-reporting-platform-srp/frequently-asked-questions
