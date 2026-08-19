---
title: Egy playbook, minden ügynök — CLI-adapterek, távoli szinkron és a Claude Code plugin
description: Az AgentPlaybooks CLI mostantól szinkronizálja a skilljeidet és MCP-konfigodat a Claude Code, a Cursor, a ChatGPT/Codex, a Google Antigravity és a Hermes Agent között — és Claude Code pluginként egyetlen paranccsal telepíthető.
date: 2026-08-01
author: Mate Benyovszky
---

# Egy playbook, minden ügynök

Az ügynök-konfigurációd szét van szórva. A skillek a `.claude/skills/`-ben
élnek, az MCP-szervereid a `.mcp.json`-ban, egy kicsit más másolatuk a
`.cursor/mcp.json`-ban, az utasítások az `AGENTS.md`-ben — és minden új
AI-kódoló eszköz újabb mappát hoz. Ezeket kézzel konzisztensen tartani pont
az a robotmunka, amit az ügynököknek kellene megszüntetniük.

A mai naptól az AgentPlaybooks CLI bezárja ezt a kört. Az
`agentplaybooks sync` legenerálja az engedélyezett targetekről hiányzó
platformfájlokat, a `pull`/`push` összeköti a lokális projektet egy hosztolt
playbookkal, és az egész CLI egyben **Claude Code plugin** is — így a
munkafolyamatot akár az ügynököd is lefuttathatja helyetted.

## Öt platform, egy parancs

Az `apb sync` a talált konfigurációt a kanonikus `agentplaybook.json`
manifestbe normalizálja, majd targetenként pótolja a hiányokat:

| Target | Skillek | MCP-szerverek |
|---|---|---|
| Claude Code / Cowork | `.claude/skills/` | `.mcp.json` |
| Cursor | `.cursor/skills/` | `.cursor/mcp.json` |
| ChatGPT / OpenAI Codex | `.codex/skills/` | `.codex/config.toml` |
| Google Antigravity | `.agents/skills/` | — |
| Nous Hermes Agent | `~/.hermes/skills/` | — |

Írd meg a skillt egyszer Claude Code-ban, futtasd az `apb sync --apply`-t, és
megjelenik Cursorban, Codexben és Antigravityben is — az MCP-szerver
definíciókkal együtt, amiket a CLI automatikusan fordít JSON és a Codex
TOML-formátuma között.

Szép részlet: a Google Antigravity a projektszintű skilleket a
`.agents/skills/`-ből olvassa, ami pontosan az AgentPlaybooks hordozható
tára. Húzz le egy playbookot, és külön lépés nélkül Antigravity-kész.

## Alapból biztonságos

A szinkronmotor tartja az eredeti tervünk garanciáit:

- **Előbb terv.** Explicit `--apply` nélkül semmi nem íródik és nem töltődik
  fel.
- **Nincs csendes felülírás.** Az azonos nevű, de eltérő tartalmú definíciók
  konfliktusok — jelentve és kihagyva, amíg fel nem oldod az eltérést.
- **Backupok.** Minden módosuló fájl előbb a `.agentplaybooks/backups/` alá
  kerül.
- **Nincs secret-szivárgás.** Secret-értékek sosem kerülnek a manifestbe, a
  `push` pedig megtagadja az olyan tartalom feltöltését, ami beégetett
  hitelesítőadatnak tűnik.

## Csapat-playbookok: pull és push

```bash
apb login                              # user API kulcs (apb_...) tárolása
apb push --apply                       # skillek + MCP-szerverek + manifest → hosztolt playbook
apb pull <guid> --apply                # a csapattársak lehúzzák a saját projektjükbe
apb sync --target=claude,codex --apply # …majd be az általuk használt eszközökbe
```

A skillek *és* az MCP-szerver definíciók is mindkét irányban utaznak. A `pull`
a hordozható tárba teszi őket (`.agents/skills/`, `.agents/mcp.json`); egy ezt
követő `sync` szétteríti őket minden platformra, amit a csapattársad használ —
akkor is, ha ő más szerkesztőben dolgozik, mint te. Pont ez a lényeg: **a
hordozható egység a playbook, nem az eszköz**.

Két részlet, amiről azonnal kérdeztek minket. Egy: a hosztolt oldal olyan
dolgokat is tud, amiket egy lokális fájl nem tud kifejezni — kérés-timeoutok,
auth-beállítás, kurált eszközlisták. A `push` a kapcsolatot frissíti, mindezt
pedig békén hagyja; sosem lapítja a részletesebb rekordot a szegényesebbre.
Kettő: egy vadonatúj gépen a hordozható tár az egyetlen dolog a lemezen, és az
nem deployment target — ezért a `sync` megmondja, milyen ügynök-eszközöket
talált a felhasználódnál, és mit adj át a `--target`-nek. Csendes üresjárat
nincs.

## Secretek: a szerződés utazik, a hitelesítőadat nem

Ez az a pont, amit mindenki elnagyolásra számít, úgyhogy mondjuk ki
kerekperec: **secret-érték soha nem mozdul.** Ami mozog, az az elvárás. A
`sync` az MCP-konfigurációban lévő minden környezeti hivatkozást összegyűjt a
manifestbe:

```json
"secrets": [
  { "name": "DEPLOY_API_KEY", "ref": "env:DEPLOY_API_KEY", "required": true }
]
```

Aki lehúzza a playbookot, onnantól pontosan tudja, mely változókat kell
beállítania — és közben senki nem küldött el kulcsot semmilyen csatornán. Ha
inkább egy vaultra mutatsz egy bejegyzéssel, a módosításod túléli a következő
syncet. A literál hitelesítőadatokat a `doctor` megjelöli, a `push` pedig
megtagadja a futást, amíg le nem cserélted őket hivatkozásra — ideértve az MCP
headerben vagy URL-ben ülő hitelesítőadatokat is.

## Telepítsd Claude Code pluginként

A CLI-csomag önmagában Claude Code / Claude Cowork plugin, `agentplaybooks`
skillel és slash-parancsokkal:

```text
/plugin marketplace add matebenyovszky/agentplaybooks
/plugin install agentplaybooks@agentplaybooks
```

Utána csak kérd: „auditáld az ügynök-konfigomat”, „tedd elérhetővé a
Claude-skilljeimet ChatGPT-ben és Cursorban”, vagy futtasd a
`/agentplaybooks:doctor` parancsot. A skill ismeri a biztonságos
munkamenetet — tervez, megmutatja a diffet, és csak a jóváhagyásod után
alkalmaz.

## Kezdj bele

```bash
git clone https://github.com/matebenyovszky/agentplaybooks
node agentplaybooks/packages/cli/bin/agentplaybooks.js doctor .
```

A teljes útmutatót a [CLI és szerkesztő-pluginok dokumentációban](/docs/cli)
találod — és írd meg, melyik platform-adaptert szeretnéd következőnek: a
ROS 2 már rajta van a [roadmapen](/docs/roadmap).
