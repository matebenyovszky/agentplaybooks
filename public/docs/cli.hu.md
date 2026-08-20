# CLI és szerkesztő-pluginok

Az AgentPlaybooks CLI (`@agentplaybooks/cli`, bináris: `agentplaybooks` vagy
`apb`) az ügynök-konfigurációt — utasításfájlokat, Agent Skilleket és MCP-
szerver definíciókat — tartja egészségesen, konzisztensen az AI-kódoló
eszközök között, és megoszthatóvá teszi hosztolt playbookként. Zéró
függőségű Node.js (>= 20) csomag, helye:
[`packages/cli`](https://github.com/matebenyovszky/agentplaybooks/tree/main/packages/cli).

## Doctor: az ügynök-konfiguráció auditja

```bash
apb doctor .            # ember által olvasható állapotjelentés
apb doctor . --json     # stabil, géppel feldolgozható kimenet
apb doctor . --strict   # 2-es kilépési kód high/critical találatnál (CI)
```

A doctor csak olvas, és csak lokálisan dolgozik. Felderíti az `AGENTS.md`,
`CLAUDE.md`, `.cursorrules`, `SKILL.md` fájlokat és az MCP-konfigokat a
platformmappákban, és jelenti:

- Agent Skills specifikációsértéseket (hiányzó name/description, rossz nevek)
- Valószínűleg beégetett hitelesítőadatokat (értéket sosem ír ki, csak sorszámot)
- Nem biztonságos, localhoston kívüli `http://` MCP URL-eket
- Azonos nevű, de platformonként eltérő definíciójú skilleket/MCP-szervereket
- Determinisztikus 0–100 közötti egészségpontszámot

## Sync: egy playbook, minden ügynök

```bash
apb sync .                       # csak terv — megmutatja, mi íródna
apb sync . --apply               # manifest és hiányzó platformfájlok megírása
apb sync . --target=codex        # a projektben még nem használt target bekapcsolása
```

A sync a talált konfigurációt a kanonikus `agentplaybook.json` manifestbe
normalizálja, majd legenerálja az engedélyezett deployment targetekről
hiányzó fájlokat:

| Target | Skillek | MCP-szerverek | Utasítások |
|---|---|---|---|
| `claude` — Claude Code / Claude Cowork | `.claude/skills/<név>/SKILL.md` | `.mcp.json` | `AGENTS.md`-t importáló `CLAUDE.md` |
| `cursor` — Cursor | `.cursor/skills/<név>/SKILL.md` | `.cursor/mcp.json` | — |
| `codex` — ChatGPT / OpenAI Codex | `.codex/skills/<név>/SKILL.md` | `.codex/config.toml` | natívan olvassa az `AGENTS.md`-t |
| `antigravity` — Google Antigravity | `.agents/skills/<név>/SKILL.md` | — (globális konfig) | — |
| `grok` — Grok Bot (xAI) | `.agents/skills/<név>/SKILL.md` | — (fiókszintű MCP Box; jelentve) | natívan olvassa az `AGENTS.md`-t |
| `hermes` — Hermes Agent (Nous Research) | `.agents/skills/<név>/SKILL.md`, regisztrálva a `~/.hermes/config.yaml`-ban | `mcp_servers:` a `~/.hermes/config.yaml`-ban | natívan olvassa az `AGENTS.md`-t; persona → `~/.hermes/SOUL.md` |

A felismert platformok automatikusan engedélyezettek; az `antigravity` és a
`hermes` opt-in — vegyél fel egy bejegyzést az `agentplaybook.json`
`spec.targets` listájába:

```json
{ "id": "codex", "type": "codex", "enabled": true, "config": {} }
```

Biztonsági szabályok:

- `--apply` nélkül minden csak terv.
- Az azonos nevű, de eltérő tartalmú definíciók **konfliktusok**: jelentve és
  kihagyva — soha nincs felülírás. Oldd fel az eltérést, majd futtasd újra.
- A módosuló fájlokról előbb backup készül a `.agentplaybooks/backups/` alá.
- Secret-értékek sosem kerülnek a manifestbe — csak környezeti hivatkozások.
- A sorvégek normalizálva vannak (a CRLF LF-ként számít), így ugyanannak a
  skillnek Windowson, macOS-en és Linuxon is ugyanaz a digestje. Egy vegyes
  platformú csapat nem lát fantom-driftet egy checkout-különbség miatt.

## Távoli szinkron: playbook-megosztás a csapattal

```bash
export AGENTPLAYBOOKS_API_KEY=<sajat-user-api-kulcs>
apb login               # kulcs ellenőrzése és tárolása (~/.agentplaybooks, 0600)
apb playbooks           # a kulccsal elérhető playbookok listája

apb pull <guid> --apply # skillek letöltése a .agents/skills/ tárba
apb push --apply        # lokális skillek + manifest feltöltése
```

Az utasítások, a skillek, az MCP-szerverek és a manifest mindkét irányban
utaznak:

- **Lokális → hosztolt** (`push`): a projekt utasításfájlja, a bármelyik
  platformmappában megtalált skillek és MCP-szerver definíciók, valamint a
  kanonikus manifest felkerülnek a linkelt (vagy egy új) playbookba. Ha a projekt
  gyökerében több utasításfájl is van, az `AGENTS.md` az erősebb; ha ezek a
  gyökérfájlok egymásnak ellentmondanak, az konfliktus, a beágyazott
  utasításfájlok pedig lokálisak maradnak, mert egy alkönyvtárra, nem a projektre
  vonatkoznak. Magára a kapcsolatra (command, args, env,
  url, headers) a lokális fájlok az irányadóak; a csak a hosztolt oldalon létező
  federációs beállítások — timeoutok, auth, hozzáférés, kurált eszközlisták,
  leírások — megmaradnak, nem íródnak felül. A lokálisan már nem létező távoli
  bejegyzéseket nem bántja.
- **Hosztolt → lokális** (`pull` + `sync --apply`): a playbook utasításai az
  `AGENTS.md`-be, a távoli skillek a `.agents/skills/`, a távoli MCP-szerverek
  pedig a `.agents/mcp.json` fájlba
  kerülnek — vagyis a hordozható tárba —, a projekt pedig a
  `.agentplaybooks/remote.json`-nal linkelődik. Az ezt követő sync mindet
  szétteríti minden engedélyezett platform-targetre — bármelyik szerkesztőt is
  használja a csapattársad.

A Claude Code a `CLAUDE.md`-t olvassa, az `AGENTS.md`-t nem, viszont támogatja a
`@` importokat. Ezért a `claude` target nem másolja le az utasításaidat, hanem
egy `@AGENTS.md`-t tartalmazó `CLAUDE.md`-t ír. Egy igazságforrás van, nincs mi
elcsússzon. Ha már van `CLAUDE.md`-d ilyen import nélkül, a `sync` ezt jelenti,
nem írja át a fájlodat.

Egy friss gépen a hordozható tár az egyetlen dolog, ami a lemezen van, és az
nem deployment target — így önmagában semmi nem íródna ki. Kapcsold be azokat
az eszközöket, amiket használsz:

```bash
apb pull <guid> --apply
apb sync --target=claude,codex --apply
```

Ha egyetlen target sincs engedélyezve, a `sync` ki is listázza, milyen
ügynök-eszközöket talált a felhasználódnál, hogy tudd, mit adj át.

Az OpenAPI-federációs szerverek csak a hosztolt oldalon léteznek, lokális
kliensmegfelelőjük nincs; a `pull` ezeket jelenti, nem félig lefordított
konfigot ír a helyükre. Secret-értékek egyik irányban sem mozdulnak — lásd
lentebb. Self-hosted telepítéshez használd a `--url=<base>` kapcsolót vagy az
`AGENTPLAYBOOKS_URL` változót.

## Secretek: egyetlen plaintext érték sem kerül a lemezre

```bash
apb secrets login <guid>     # playbookra szűkített kulcs, 0600-as jogokkal tárolva
apb secrets status           # mi kell, mi van a vaultban, mi van ebben a shellben
pass show deploy/api | apb secrets push DEPLOY_API_KEY
apb secrets run -- npm run deploy
```

- A **`status`** csak neveket és állapotot ír ki: mire van szüksége a
  playbooknak, mi van a vaultban, mit jelölt a tulajdonos felfedhetőnek, mi van
  már beállítva a shellodben. Értéket soha.
- A **`push`** az értéket a standard bemenetről vagy a `--from-env=<VAR>`-ból
  veszi — soha nem parancssori argumentumból, mert az argv bekerül a
  shell-előzményekbe és a processzlistába. Kiírja a nevet, a cél playbookot és a
  karakterszámot, majd megvárja, hogy beírd: `yes`. A már létező secretet a
  helyén rotálja, a tulajdonos felfedhetőségi jelzését, a host-engedélylistát, a
  kategóriát és a lejáratot érintetlenül hagyva.
- A **`run`** a deklarált secreteket memóriába kéri le, egyetlen
  gyerekfolyamatba injektálja, majd kilép. Semmi nem íródik ki sehová. Amit a
  tulajdonos nem jelölt felfedhetőnek, az a vaultban marad, és kihagyottként
  jelenik meg.
- Ezek a parancsok **playbookra szűkített** API-kulcsot használnak a fiókszintű
  kulcs helyett, így a secretekhez hozzáférő hitelesítőadat egyetlen playbookra
  korlátozódik. Ha egyáltalán nem akarod tárolni, használd az
  `AGENTPLAYBOOKS_PLAYBOOK_KEY` változót.

Ha az ügynököd MCP-szerverként beszél a hosztolt playbookkal, mindebből semmire
nincs szükséged: a `use_secret` eszközzel a platform szerveroldalon injektálja a
hitelesítőadatot, így az érték az ügynök kontextusába sem kerül be.

## A playbook a szerződést hordozza, nem a hitelesítőadatot

A playbook kimondja, milyen hitelesítőadatokra van szüksége; az értékek ott
maradnak, ahol lenniük kell. A `sync` az MCP-konfigurációban talált minden
környezeti hivatkozást (`${VAR}`, `$VAR`, `env:VAR`) összegyűjt a
`spec.secrets` alá:

```json
"secrets": [
  { "name": "DEPLOY_API_KEY", "ref": "env:DEPLOY_API_KEY", "required": true }
]
```

Ezzel a playbook hordozható és önleíró lesz: aki lehúzza, pontosan tudja,
mely változókat kell beállítania — anélkül, hogy bárki bárhová elküldött volna
egy kulcsot. Ha módosítasz egy bejegyzést — például egy vaultra mutatsz vele,
vagy opcionálisra állítod —, a te verziód megmarad a következő sync után is.
Literál hitelesítőadatok sosem íródnak a manifestbe és sosem kerülnek fel: a
`doctor` megjelöli őket, a `push` pedig megtagadja a futást, amíg nem cserélted
le őket hivatkozásra.

## Claude Code és Claude Cowork plugin

A CLI-csomag egyben Claude Code plugin is: `agentplaybooks` skillel és
`/agentplaybooks:doctor`, `:sync`, `:pull`, `:push` parancsokkal:

```text
/plugin marketplace add matebenyovszky/agentplaybooks
/plugin install agentplaybooks@agentplaybooks
```

Telepítés után kérdezd Claude-ot például így: „auditáld az
ügynök-konfigomat”, vagy „tedd elérhetővé a Claude-skilljeimet Cursorban és
ChatGPT-ben” — a skill ismeri a biztonságos munkamenetet (előbb terv, csak
jóváhagyás után apply).

## További platformok

- **ChatGPT / Codex**: a skillek a `.codex/skills/`-be, az MCP-szerverek a
  `.codex/config.toml`-ba kerülnek — a Codex CLI és a ChatGPT kódoló ügynöke
  automatikusan felveszi őket.
- **Google Antigravity**: a projektszintű skilleket a `.agents/skills/`-ből
  olvassa, ami pontosan az AgentPlaybooks hordozható tára — egy lehúzott
  playbook külön lépés nélkül Antigravity-kész.
- **Grok Bot (xAI)**: rögzített gyökérlistából deríti fel a skilleket, és ebben
  a hordozható `.agents/skills/` tár is benne van (a `.claude/skills/`, a
  `.codex/skills/` és a `.cursor/skills/` mellett), a rendszerprompt pedig
  közvetlenül betölti az `AGENTS.md`-t — így egy szinkronizált projekt
  hídfájl nélkül Grok-kész. Az **MCP-szerverek a kivétel**: a Grok Bot csak
  szerver-*azonosítók* tömbjét tárolja a `~/.grokbot/settings.json`-ban
  (`mcpBoxServers`), a definíciók a fiók MCP Boxában élnek, tehát projektfájlból
  nem provisionálhatók. A `sync` ezért jelenti azokat a szervereket, amiket nem
  tudott átadni, ahelyett hogy némán elejtené őket. A megkerülés egyetlen
  bejegyzés, egyszer: vedd fel a playbook saját MCP-végpontját
  (`POST /api/mcp/<guid>`) a Boxba, és a skillek, a memória, a canvas és a
  `use_secret` további szerverenkénti beállítás nélkül elér minden Grok
  Bot-munkamenetet.
- **Hermes Agent**: egy profil mindent a `~/.hermes`-ben tart (vagy a
  `$HERMES_HOME`-ban). A sync nem másolja be a skilleket ebbe a profilba, hanem
  regisztrálja a hordozható tárat a `~/.hermes/config.yaml`
  `skills.external_dirs` listájában — így a Hermes ott olvassa őket, ahol vannak:
  nincs duplikáció, és a következő `pull` újabb sync nélkül él. Névütközésnél a
  Hermes saját skilljei (`~/.hermes/skills/`) nyernek. Az MCP-szerverek ugyanabba
  a `config.yaml`-ba olvadnak be (a kommentek és a nem érintett beállítások
  megmaradnak), a lehúzott persona pedig `~/.hermes/SOUL.md` lesz — meglévő
  fájlt soha nem írunk felül, mert a Hermes az első indításkor legenerál egy
  alapot. Az utasításokat natívan az `AGENTS.md`-ből olvassa, de csak az *első*
  megtalált projekt-kontextusfájlt tölti be (`.hermes.md` → `AGENTS.md` →
  `CLAUDE.md` → `.cursorrules`), ezért egy `AGENTS.md`-t elrejtő `.hermes.md`
  konfliktusként jelenik meg. Publikus playbook skilljei közvetlenül a webről is
  telepíthetők:
  `hermes skills install well-known:https://agentplaybooks.ai/playbooks/<guid>/.well-known/skills/<név>`.
- **Cursor**: skillek a `.cursor/skills/`-ben, MCP-szerverek a
  `.cursor/mcp.json`-ban.
