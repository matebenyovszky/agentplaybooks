---
title: Egy playbook, hordozható Agent Pluginok és élő MCP skillek
description: Az AgentPlaybooks összeköti az Agent Plugins 1.0 csomagokat, Agent Skilleket, MCP-szervereket, platformok közötti szinkront és a privát mentést, titkok exportálása nélkül.
date: 2026-09-24
author: Mate Benyovszky
---

# Egy playbook, hordozható Agent Pluginok és élő MCP skillek

Egy AI-ügynök beállítása ritkán fér el egyetlen fájlban. A skillek könyvtárakban vannak, az eszközök MCP-n kapcsolódnak, a szerkesztőspecifikus utasítások eltérhetnek, a titkok pedig nem kerülhetnek telepíthető csomagba. Az AgentPlaybooks ezt két szinten kezeli: van egy stabil projektplugin, és minden playbook külön hordozható pluginként exportálható.

Az **Export as Agent Plugin** gomb Agent Plugins 1.0 csomagot készít `plugin.json`, `mcp.json` és szabványos `skills/<név>/SKILL.md` fájlokkal. A skill biztonságos segédfájljai, valamint a playbook persona- és utasításszövege bekerülnek; memória, canvas, futási adatok és titokértékek nem. Az MCP-kapcsolat hitelesítését a fogadó kliens kezeli.

Az [MCP Skills kiegészítést](https://github.com/modelcontextprotocol/ext-skills/blob/main/specification/stable/skills.mdx) támogató kliensek az élő playbookból kérhetik le a skillek listáját, frontmatterét és fájlmanifesztjét, majd SHA-256 lenyomattal ellenőrizhetik a beolvasott fájlokat. Más kliensek használhatják az exportált csomagot vagy a már meglévő MCP-eszközöket. Egyes plugináruházak az átvett skilleket jóváhagyáskori pillanatképként kezelik, így egy playbook változása nem kerülheti meg az áruházi felülvizsgálatot.

A konfigurációs hidat továbbra is a CLI adja: az `apb doctor` észleli az eltéréseket, az `apb sync` átvezeti a támogatott skilleket, utasításokat, egyéni ügynököket és MCP-hivatkozásokat. Az `apb push`, `apb backups` és `apb pull` ettől különálló, privát helyreállítási út. A pluginexport telepítésre és megosztásra való, nem helyettesíti a központi mentést.

Ez a **platformfüggetlen AI-ügynök hordozhatóság**, **Agent Skills migráció**, **MCP-szerver terjesztés** és **AI-ügynök konfigurációmentés** világos határokkal. A [kiadási terjesztési útmutató](/docs/release-distribution) követi az npm, MCP-regiszterek, plugináruházak, skillfelfedezés, Hermes-memória, dokumentáció és jóváhagyások állapotát.
