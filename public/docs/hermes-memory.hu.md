# Hermes memóriaszolgáltató

Az AgentPlaybooks natív memóriaszolgáltatóként választható ki a Hermes Agentben.
A tartós tényeket privát playbookban tárolja, több munkameneten át elérhetővé
teszi, és az AgentPlaybooksban is szerkeszthető, archiválható vagy törölhető
bejegyzésekként kezeli.

## Telepítés és beállítás

Használj **Hermes 0.21.4 vagy újabb** verziót. A kompatibilitási teszt a
[workflow-ban rögzített upstream verzióval](https://github.com/matebenyovszky/agentplaybooks/blob/main/.github/workflows/hermes-memory.yml)
fut.

1. Hozz létre **ehhez a Hermes-profilhoz egy külön privát playbookot**.
2. A playbook **Integrations** lapján készíts playbookhoz kötött API-kulcsot
   `memory:read` és `memory:write` jogosultságokkal. A **Coworker** szerepkör
   mindkettőt tartalmazza. A fiókkezelési kulcs ezt nem helyettesíti.
3. Telepítsd a plugint a megfelelő Hermes-profilba:

```bash
hermes plugins install matebenyovszky/agentplaybooks/packages/hermes-memory/agentplaybooks
hermes memory setup
hermes memory status
```

A beállítóban válaszd az **agentplaybooks** providert, és add meg a privát
playbook GUID-ját, kulcsát és a szolgáltatás címét (alapértelmezetten
`https://agentplaybooks.ai`). A Hermes Desktopban is vannak natív beállítási
mezők. A konfiguráció a `$HERMES_HOME/agentplaybooks/config.json` fájlba kerül;
a kulcs helye a profil titoktárolója, `AGENTPLAYBOOKS_MEMORY_API_KEY` néven,
nem a JSON-fájl. Több profil esetén telepítés és beállítás előtt válaszd ki a
megfelelőt a `HERMES_HOME` segítségével. Egy ellenőrzött verziót a
`--ref <full-commit-sha>` kapcsolóval rögzíthetsz.

**Plugin-store állapot, 2026. szeptember 22.:** a
[Hermes-katalógus beküldése](https://github.com/NousResearch/hermes-agent/pull/119450)
a karbantartók jóváhagyására vár. A közvetlen repótelepítés működik;
a `hermes plugins install agentplaybooks` rövid parancshoz a katalógusbejegyzés
elfogadása és közzététele szükséges.

### Telepítés az AgentPlaybooks CLI-vel

A repó forráskódja már tartalmazza az `apb memory setup` parancsot. Amíg nem
olyan CLI-kiadást használsz, amelyben ez szerepel, építsd forrásból; ne
feltételezd, hogy a korábban telepített npm-verzió már tudja. A repó gyökerében:

```bash
npm --prefix packages/cli install
npm --prefix packages/cli run build
node packages/cli/bin/agentplaybooks.js memory setup PRIVATE_PLAYBOOK_GUID --target=hermes
node packages/cli/bin/agentplaybooks.js memory setup PRIVATE_PLAYBOOK_GUID --target=hermes --apply
hermes memory setup
hermes memory status
```

Az első setup parancs csak tervet készít; az `--apply` telepíti a csomagolt
plugint és kiválasztja a providert. A profil a `HERMES_HOME` vagy a
`--hermes-home=<directory>` segítségével adható meg. A parancs megőrzi a többi
beállítást, jelzi az ütköző pluginfájlokat vagy a már kiválasztott másik
providert, és nem másol hitelesítő adatokat. Ez a közvetlen repótelepítés
alternatívája. A meglévő helyi memóriát nem importálja.

## Használat és kipróbálás

| Eszköz | Feladat |
|---|---|
| `apb_memory_search` | Szó szerinti keresés; keresőkifejezés nélkül az aktuális emlékek listázása |
| `apb_memory_read` | Ismert kulcs olvasása, archivált bejegyzésnél is |
| `apb_memory_write` | Kulcs létrehozása vagy frissítése JSON-értékkel, összefoglalóval és memóriaszinttel |
| `apb_memory_history` | Korábbi változatok megtekintése |
| `apb_memory_archive` | Elrejtés a normál keresés elől a tartalom és az előzmények megtartásával |
| `apb_memory_delete` | Bejegyzés és távoli előzményei végleges törlése |

Első próbának kérd meg a Hermest, hogy az `apb_memory_write` eszközzel mentse
el a `project_language` kulcsot `{"language":"Hungarian"}` értékkel.
Új munkamenetben olvastasd vissza. Javítsd az értéket az AgentPlaybooks
szerkesztőjében, majd olvastasd újra, és nézesd meg az előzményeit. Archiváld a
próbabejegyzést, ellenőrizd, hogy a normál keresés már nem adja vissza, végül
töröld.

A provider a Hermes saját memóriaeszközének új, sikeres, explicit írásait is
tükrözi: a hozzáadásokat, cseréket és törléseket. Cserénél megmarad a távoli
kulcs és az előzménye. Az írások agent-, munkamenet-, szerző-, platform- és
forrásadatokat kapnak. Csak a fő agent kontextusából történhet írás.

A helyi `MEMORY.md` és `USER.md` továbbra is működik. **A távoli javítás nem
írja át a helyi példányt.** Helyi memóriából tükrözött tényt ott is javítani
vagy törölni kell. A végleges elfelejtéshez mindkét példányt el kell távolítani;
az archiválás megtartja az adatot.

## Profilhatárok és megosztott tudás

Profilonként külön privát memóriaplaybookot használj. Aki hozzáfér a profilhoz,
annak a memória is közös, beleértve az üzenetküldő gateway résztvevőit. A szerző
adata a bejegyzés eredetét jelzi, nem személyenkénti hozzáférést szabályoz.
Felhasználók elkülönítéséhez külön profilok és külön privát playbookok kellenek.

A beállító opcionális `shared_playbooks` mezője vesszővel elválasztott
GUID-okat fogad. Ezek csak olvasható források, amelyeket az eszközök `source`
paraméterével választhatsz ki. Az automatikus visszakeresés csak a személyes
playbookot használja. A CLI megfelelő kapcsolója: `--shared=<guid>,<guid>`.

Nyilvános megosztott forráshoz nem kell kulcs. Privát forráshoz adj meg külön,
csak olvasási jogosultságú kulcsot a profil titokkörnyezetében:
`AGENTPLAYBOOKS_SHARED_<GUID_WITHOUT_HYPHENS_UPPERCASE>_API_KEY`.
A személyes playbook kulcsát a provider nem használja a megosztott forrásokhoz.

A személyes írások visszautasítják a nyilvános és nem listázott playbookokat.
Tartsd a playbookot privátként: láthatóságának későbbi módosítása a meglévő
tartalmakat is elérhetővé teszi a szolgáltatás hozzáférési szabályai szerint.
A láthatóság ellenőrzése és az írás külön kérés, nem egyetlen atomi művelet.

## Keresés és jelenlegi korlátok

Az automatikus visszakeresés a teljes kérdéssel futó **szó szerinti
szövegkeresést** használja, legfeljebb 20 találattal. Ha a teljes kérdés nem
szerepel a mentett szövegben, használj rövid kifejezéseket az
`apb_memory_search` eszközzel, vagy olvass ismert kulcsot. Ez a verzió nem ad
szemantikus keresést vagy relevancia szerinti rangsorolást.

A plugin nem tölti fel a teljes beszélgetéseket, nem nyer ki automatikusan
tényeket, nem importálja tömegesen a helyi memóriát, és nem ad gyorsítótárat,
offline várólistát, újrapróbálkozást vagy circuit breakert. A sikertelen API-
műveleteket jelzi, nem teszi félre későbbre.

A szinteket, időbélyegeket és előzményeket a [memória-API útmutatója](./memory.md),
a megvalósítást a [provider forráskódja és tesztjei](https://github.com/matebenyovszky/agentplaybooks/tree/main/packages/hermes-memory)
részletezik. Az automatizált tesztek a REST-működést és a valódi Hermes
betöltőjét, Desktop-sémáját, eszközeit, memóriaírási eseményeit és profilváltását
ellenőrzik helyi HTTP-tesztszerverrel, éles fiók használata nélkül.
