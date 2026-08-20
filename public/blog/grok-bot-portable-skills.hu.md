---
title: A Grok Bot már olvassa a playbookodat — itt a `grok` target
description: Az xAI Grok Botja a hordozható .agents/skills tárból deríti fel a skilleket, és natívan betölti az AGENTS.md-t, így egy szinkronizált projekt hídfájl nélkül Grok-kész. Az új CLI-target ezt teszi explicitté — és kimondja azt az egy dolgot, amit fájlból nem lehet beállítani.
date: 2026-08-19
author: Benyovszky Máté
---

# A Grok Bot már olvassa a playbookodat

Nagyjából kéthetente érkezik egy új ügynök a gépre, és mindegyik ugyanazt
kérdezi: *hova tegyem most a skilleket?* A legtöbbjüknél az őszinte válasz
eddig az volt, hogy „egy újabb könyvtárba, egy újabb formátumban, kézzel
szinkronban tartva".

A Grok Bot, az xAI asztali ügynöke kellemes kivétel — és a ma megjelenő `grok`
target az AgentPlaybooks CLI-ben jórészt csak explicitté teszi ezt.

## Amit találtunk

A Grok Bot rögzített gyökérlistából deríti fel a skilleket. A telepített
alkalmazásból kiolvasva ez a lista:

```
.cursor/skills/   .cursor/skills-cursor/   .agents/skills/
.claude/skills/   .codex/skills/           .claude/plugins/
```

Az `.agents/skills/` — az a hordozható tár, amit az AgentPlaybooks eddig is
írt — benne van, „workspace" skill-forrásként osztályozva. A rendszerpromptja
pedig közvetlenül betölti az `AGENTS.md`-t: azt mondja a modellnek, hogy a
fájl környezeti részleteket, kódolási irányelveket és „a fontos szabályok vagy
skillek áttekintését" hordozhatja, és hogy mindig kövesse őket.

Vagyis az integráció érdekes része már készen volt. Ha lefuttattad egy
projekten az `agentplaybooks sync`-et, vagy lehúztál egy playbookot egy új
gépre, a Grok Bot látja azokat a skilleket és azt az instrukciót — hídfájl,
másolási lépés és formátumkonverzió nélkül.

## Az új target

```bash
agentplaybooks sync . --target=grok --apply
```

| Target | Skillek | MCP-szerverek | Instrukciók |
|---|---|---|---|
| `grok` — Grok Bot (xAI) | `.agents/skills/<név>/SKILL.md` | — (fiókszintű MCP Box) | natívan olvassa az `AGENTS.md`-t |

Ugyanezekhez a fájlokhoz eddig is el lehetett jutni az `antigravity`
targettel, hiszen mindkettő a hordozható tárat olvassa — de „Antigravity"-nek
hívni a Grok targetet az a fajta apró valótlanság, ami később egy órájába
kerül valakinek. A `doctor` és a `sync` mostantól a `~/.grokbot` profil alapján
felismeri az alkalmazást, és néven nevezve ajánlja a targetet.

## Az egy dolog, amit fájlból nem lehet

Az MCP-szerverek. A Grok Bot csak szerver-**azonosítók** tömbjét tárolja a
`~/.grokbot/settings.json`-ban:

```json
{ "mcpBoxServers": [], "mcpCustomInstructionsByServerId": {}, "mcpDisabledToolsByServerId": {} }
```

Az azonosítók mögötti definíciók a fiók MCP Boxában élnek, nem a lemezen.
Projektfájl nem provisionálja őket — vagyis a `sync` valóban nem tudja átadni
ennek a targetnek a playbook MCP-szervereit.

Ehelyett kimondja:

```
[conflict:grok] mcp 'deploy': Grok Bot's MCP servers live in the account's
MCP Box, not in a project file. Add the playbook's own MCP endpoint
(POST /api/mcp/<guid>) to the Box once, and its tools reach every Grok Bot
session.
```

Az a playbook, amelynek az MCP-szerverei némán nem érkeztek meg, pontosan úgy
néz ki, mint amelyiknek nincsenek is — és az derül ki róla, aki épp egy hiányzó
toolt debugol a legrosszabb pillanatban. A CLI ezért jelenti a rést, nem
átugorja. Csak akkor jelenti, ha ténylegesen lett volna mit átadnia: ha a
playbookban nincs MCP-szerver, hallgat.

A megkerülés egyetlen bejegyzés, egyszer. Vedd fel a playbook saját
MCP-végpontját — `POST /api/mcp/<guid>` — a Boxba, és minden, amit a playbook
tart, azon az egy szerveren át érkezik: skillek, memória, canvas-dokumentumok,
és a `use_secret` azokhoz a titkokhoz, amiket az ügynöknek *használnia* kell,
anélkül hogy valaha látná őket. A szerverenkénti egyéni utasítás és a
letiltott tool-ok a Grok Bot helyi beállításai, tehát azt is hangolhatod, mit
mutasson meg ez az egy szerver.

## Próbáld ki

```bash
npx agentplaybooks doctor .
npx agentplaybooks sync . --target=grok
```

Előbb terv; `--apply` nélkül semmi nem íródik ki. Ha a projektben már van skill
a `.claude/skills/` vagy a `.cursor/skills/` alatt, a terv megmutatja, ahogy az
`.agents/skills/`-be kerülnek — és ez az egész migráció.
