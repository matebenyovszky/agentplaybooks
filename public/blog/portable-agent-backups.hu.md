---
title: Az AI-ügynököd beállításai túlélhetik az eszközváltást
description: Mentsd központilag az Agent Skilleket, egyéni ügynököket, MCP-hivatkozásokat és projektutasításokat, majd állítsd vissza őket a támogatott AI-kódoló eszközökben.
date: 2026-09-23
author: Mate Benyovszky
---

# Az AI-ügynököd beállításai túlélhetik az eszközváltást

Egy AI-kódoló ügynök több egy chatablaknál. A hasznos munkakörnyezete projektutasításokból, skillekből, egyéni ügynökökből és MCP-szerverek definícióiból áll. Ezek gyakran szétszóródnak a Claude Code, a Cursor, a Codex, a Gemini CLI és más kliensek mappái között. Egy új szerkesztőre vagy gépre váltáskor nem kellene mindent emlékezetből újraépíteni.

Az AgentPlaybooks a meglévő `doctor` és `sync` folyamatot most **privát, verziózott, központi mentéssel** köti össze. A CLI felméri a helyi konfigurációt, jelzi az egymásnak ellentmondó másolatokat, és mentést készít a hordozható közös részből. Ezt egy új projektbe visszaállíthatod, majd előállíthatod az ott használt kliensek natív fájljait.

## Szétszórt fájlokból visszaállítható playbook

```bash
apb doctor . --strict
apb push .                 # a feltöltési terv ellenőrzése
apb push . --apply         # hosztolt playbook és privát mentés
apb backups PLAYBOOK_GUID  # korábbi mentések listája

apb pull PLAYBOOK_GUID ../recovered --apply
apb sync ../recovered --target=claude,cursor,codex,copilot,gemini --apply
```

A mentés tartalmazza az `AGENTS.md`-t, a hordozható manifestet, a teljes Agent Skills mappákat (szkriptekkel, referenciákkal és egyéb erőforrásokkal), a hordozható egyéni ügynököket, az MCP-definíciókat és az opcionális personát. Régebbi verzió a `pull --snapshot=SNAPSHOT_ID` kapcsolóval állítható vissza. A tulajdonos a playbook rekordjának törlése után is elérheti a privát mentést GUID alapján.

Ez több, mint egy `SKILL.md` fájl másolása: a skill segédfájljai is vele utaznak, a `doctor` és a `sync` pedig továbbra is megmutatja a platformmásolatok közötti eltérést. Az AgentPlaybooks az [Agent Plugins 1.0](https://agent-plugins.org/specification) csomagok importját és exportját is támogatja; a titok-hozzárendelések bővítése hivatkozásokat visz át, nem titokértékeket.

## A biztonságnak és a kompatibilitásnak is vannak határai

A vaultban tárolt titkok értéke nem része a mentésnek. Az MCP-hitelesítőadatokat környezeti változóra vagy vaultra mutató hivatkozással érdemes megadni; a vélhetően beégetett hitelesítőadatokat tartalmazó feltöltést a CLI elutasítja. A felismerés nem tévedhetetlen, ezért feltöltés előtt nézd át a skillek erőforrásait is. A mentés akkor is privát, ha maga a playbook nyilvános.

A híd a **közös konfigurációs modellre** vonatkozik, nem minden gyártóspecifikus funkcióra. A helyi felülírások, jogosultsági beállítások, hookok, worktree-k és tetszőleges alkalmazásadatok nem kerülnek ebbe a mentésbe. Egy csak hosztolt MCP-kapcsolatnak sem feltétlenül van helyi fájlmegfelelője. Eltérő fájlokat a CLI nem ír felül észrevétlenül: konfliktust jelez.

Így az AI-ügynök konfigurációja menthető és költöztethető anélkül, hogy az egész munkakörnyezet egyetlen kódoló eszközhöz kötődne. Kezdd a [mentési és migrációs útmutatóval](/docs/portable-agent-backups), vagy nézd meg a pontos parancsokat a [CLI dokumentációban](/docs/cli).
