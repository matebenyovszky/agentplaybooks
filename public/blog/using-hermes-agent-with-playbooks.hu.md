---
title: A Hermes Agent használata az AgentPlaybooks-kal
description: A Hermes Agent a Nous Research MIT-licencű, saját gépen futó személyi ügynöke. Így lesz egy playbookból a skilljei, az MCP-szerverei és az identitása — és így szabályozod, mihez nyúl először.
date: 2026-06-15
author: Mate Benyovszky
---

# A Hermes Agent használata az AgentPlaybooks-kal

A **Hermes Agent** a Nous Research nyílt forráskódú (MIT) személyi ügynöke.
Ugyanaz az agent-core fut egy CLI, egy TUI, egy Electron desktop alkalmazás és
egy messaging gateway mögött (Telegram, Discord, Slack és még körülbelül húsz
platform). Minden, amit tud, egyetlen profilkönyvtárban él — `~/.hermes`, vagy
`$HERMES_HOME`, ha több profilt futtatsz —, és semmi nem hagyja el a gépet a
modellhívásokon kívül, amiket te állítasz be.

> **2026. augusztusi frissítés:** A Hermes Agent már profilalapú Bot Mode-ot
> kínál tartós botokkal, rutinokkal, csoportos beszélgetésekkel, többgépes
> peerekkel, Agent Skills és MCP támogatással. Az aktuális képességtérképet és a
> profiltelepítési tervünket az
> [A botod nem az agented](/blog/your-bot-is-not-your-agent) cikkben és a
> [portolható botcsapat útmutatóban](/docs/bot-platform-integrations) találod.

> **Két különböző dolgot hívnak Hermesnek.** Ez a bejegyzés a *Hermes Agentről*
> szól, arról a kliensről, amit telepítesz. A *Hermes* modellek (Hermes 3,
> Hermes 4) a Nous Research külön kiadása; bármelyiket futtathatod modellként
> egy MCP-képes kliens alatt, akár ez alatt is, de az modellválasztás — nem az
> teszi a playbookot portolhatóvá.

Ez a profilfelépítés pontosan az, amit az AgentPlaybooks szinkronizál:

| Amit a playbook tartalmaz | Ahol a Hermes Agent olvassa |
|---|---|
| Persona | `~/.hermes/SOUL.md` — a rendszerprompt #1 slotja |
| Projekt-utasítások | `AGENTS.md` a projektben (natívan olvassa) |
| Agent Skillek | `~/.hermes/skills/`, plusz minden könyvtár a `skills.external_dirs`-ből |
| MCP-szerverek | `mcp_servers:` a `~/.hermes/config.yaml`-ban |

## Playbook szinkronizálása egy Hermes profilba

Húzd le a playbookot, majd add át a Hermesnek:

```bash
apb pull <playbook-guid> --apply
apb sync --target=hermes --apply
```

A terv pontosan megmutatja, mi fog történni, mielőtt bármi íródna. Három dolgot
érdemes tudni a hermes targetről:

**A skillek regisztrálva lesznek, nem másolva.** Ahelyett, hogy minden skillt
beduplikálnánk a `~/.hermes/skills/`-be, a sync felveszi a projekt portable
tárát a `config.yaml` `skills.external_dirs` listájába. A Hermes ezután ott
olvassa a skilleket, ahol vannak. Semmi nem duplikálódik, tehát semmi nem tud
elcsúszni; a következő `apb pull` azonnal él, második sync nélkül.

**Az MCP-szerverek beolvadnak a `config.yaml`-ba.** A dokumentumot szerkesztjük,
nem újragenerálljuk, így a kommentjeid, a kulcssorrend és minden nem érintett
beállítás megmarad. Ha egy szerver már létezik más definícióval, azt
konfliktusként jelentjük és nem bántjuk — a sync soha nem ír felül kézzel
beállított kapcsolatot.

**A personából `SOUL.md` lesz.** A Hermes az első indításkor legenerál egy alap
`SOUL.md`-t, és a sync azt nem írja felül. Ha a playbook personáját akarod az
ügynök identitásának, töröld a legenerált fájlt (vagy fűzd össze a kettőt
kézzel), és futtasd újra a syncet. Ez az ügynököd identitása — azt nem egy
eszköznek kell eldöntenie.

## Mihez nyúl a Hermes először

A Hermesben nincs numerikus skill-prioritás. A sorrend négy mechanizmusból áll
össze, és együtt pont azt adják, amit általában akarsz — előbb az ügynök saját
skilljei, közvetlenül utánuk a szervezet playbookja:

1. **Precedencia névütközésnél.** A `~/.hermes/skills/` nyer minden ellen, ami az
   `external_dirs`-ben van. Mivel a playbook külső könyvtárként van regisztrálva,
   a Hermes beépített és önmaga által írt skilljei elöl maradnak, a playbook
   pedig a következő, amit lát.
2. **Az utasításfájlok.** A `SOUL.md` és az `AGENTS.md` az a hely, ahol kimondod,
   melyik forrás az irányadó — például hogy a playbook skilljei a szervezet
   szabályai, és nyernek a modell saját szokásaival szemben. Ez prompt-fegyelem,
   és a gyakorlatban ez dönt.
3. **Bundle-ök.** Egy Hermes bundle több skillt fog össze egyetlen slash-parancs
   alá, és slug-ütközésnél megelőzi az egyedi skilleket.
4. **`hermes skills config`.** Platformonkénti be- és kikapcsolás, hogy ki tudd
   lőni azt a zajt, amit egy marketplace-ről telepítettél és soha nem használtál.

Egy Hermes-specifikus csapda, amit a CLI most már jelez neked: a Hermes pontosan
**egy** projekt-kontextusfájlt tölt be, az első találat nyer, ebben a sorrendben:
`.hermes.md` → `AGENTS.md` → `CLAUDE.md` → `.cursorrules`. Egy projekt, amiben
`.hermes.md` és `AGENTS.md` is van, olyan utasításokat szállít, amiket a Hermes
soha nem fog elolvasni. Az `apb sync --target=hermes` ezt konfliktusként jelzi,
nem pedig hagyja, hogy később derüljön ki.

## Skillek telepítése közvetlenül egy playbookból

A Hermes bármelyik oldalról telepít skillt, amelyik a well-known útvonalon
publikálja őket — regisztráció és registry nélkül. Minden publikus playbook
ilyen:

```bash
hermes skills search https://agentplaybooks.ai/playbooks/<guid> --source well-known
hermes skills install well-known:https://agentplaybooks.ai/playbooks/<guid>/.well-known/skills/<név>
```

Van egy oldalszintű index is:
`https://agentplaybooks.ai/.well-known/skills/index.json`. Mindkettő valódi
`SKILL.md` dokumentumokat szolgál ki — ugyanazt az Agent Skills formátumot
([agentskills.io](https://agentskills.io/specification)), amit minden más kliens
olvas, és a specifikáción kívüli, Hermes által értett mezőket (`version`,
`platforms`, `metadata.hermes.*`) pontosan úgy megtartja, ahogy a szerző megírta.

Csak publikus playbookok jelennek meg így. Egy privát vagy unlisted playbook az
`apb pull` mögött marad — ez így szándékos, nem korlátozás.

## A playbook mint MCP-szerver

A másik irány ugyanennyire hasznos: a playbook maga is MCP-szerver, így a Hermes
eszközként hívhatja, nem csak fájlokat olvashat belőle. Vedd fel a
`~/.hermes/config.yaml`-ba:

```yaml
mcp_servers:
  my-playbook:
    url: "https://apbks.com/api/mcp/A_PLAYBOOK_GUID"
    headers:
      Authorization: "Bearer ${PLAYBOOK_API_KEY}"
```

Magát a kulcsot a `~/.hermes/.env`-ben tartsd, ne a `config.yaml`-ban. A Hermes a
`${VAR}` hivatkozásokat először a környezetből, majd abból a fájlból oldja fel,
így a config, amit commitolsz vagy megosztasz, soha nem tartalmaz hitelesítő
adatot.

MCP-n keresztül a Hermes megkapja a playbook memóriáját és vászonját
erőforrásként, a skilljeit és integrációit pedig eszközként. Ha egy eszközhöz
külső hitelesítő adat kell, a playbook Secrets Vaultja hajtja végre a hívást az
ügynök nevében: a nyers érték nem jut el a modellhez, és nem kerül a gépre.

## Következő lépések

- [CLI referencia](/docs/cli) — minden target, és hogy mit ír a sync mindegyikhez
- [Platform integrációk](/docs/platform-integrations) — ugyanaz a playbook más kliensekben
- [Hermes Agent dokumentáció](https://hermes-agent.nousresearch.com/docs) — profilok, pluginok, terminal backendek
