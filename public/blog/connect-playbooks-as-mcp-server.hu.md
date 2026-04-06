---
title: Bármely playbook csatlakoztatása MCP szerverként — Cursor, Claude és továbbiak
description: Lépésről lépésre útmutató az AgentPlaybooks Cursor IDE-höz, Claude Desktophoz, Claude Code-hoz és más MCP-kompatibilis eszközökhöz való kapcsolásához. Egy URL, másolás-beillesztés konfiguráció, azonnali AI eszközök.
date: 2026-04-05
author: Mate Benyovszky
---

# Bármely playbook csatlakoztatása MCP szerverként

Az AgentPlaybooks minden playbookja egyben élő **MCP (Model Context Protocol)** szerver is. Ez azt jelenti, hogy egyenesen beillesztheted Cursorba, Claude Desktopba, Claude Code-ba vagy bármely MCP-kompatibilis kliensbe — és a te AI ügynököd azonnal hozzáfér a playbook eszközeihez, memóriájához, canvasához és personáihoz.

Ma ezt még egyszerűbbé tesszük egy új **Integrations** lappal a playbook vezérlőpulton, valamint friss dokumentációval, amelyben a Cursor IDE beállítása előtérbe került.

## Mi az az MCP?

A [Model Context Protocol](https://modelcontextprotocol.io/) egy nyílt szabvány (eredetileg az Anthropic fejlesztette), amellyel az AI asszisztensek egyszerű JSON-RPC interfészen keresztül kapcsolódhatnak külső eszközökhöz és adatforrásokhoz. Képzeld el univerzális bővítményrendszerként az AI számára.

Az AgentPlaybooks minden playbook esetében megvalósítja az MCP szerver specifikációját. A skilljeid hívható eszközökké válnak, a memóriád olvasható/írható állapottá, a personáid pedig rendszerprompt-kontextust adnak — mindezt egyetlen HTTP végponton keresztül.

## Az új Integrations lap

Átszerveztük a playbook szerkesztőt. A régi „API Keys” lap neve most **Integrations**, és mindent tartalmaz, ami a playbook külső platformokhoz kötéséhez kell:

1. **Connect as MCP Server** — Másolásra kész JSON konfigurációk Cursorhoz, Claude Desktophoz és Claude Code-hoz. A konfigurációk előre ki vannak töltve a playbook GUID-jával és nevével.
2. **Use with AI Platforms** — Gyorsművelet gombok (Megnyitás Claudéban, Megnyitás ChatGPT-ben, export ZIP-ként) plusz API végpont referencia.
3. **Platform Cards** — Egy kattintásos linkek lépésről lépésre útmutatókhoz Cursorhoz, ChatGPT-hez, Claudéhoz, Geminihoz, Claude Code-hoz és általános API integrációhoz.
4. **API Keys** — Hitelesítési kulcsok generálása és kezelése írási hozzáféréshez.

## Csatlakozás Cursor IDE-höz

A Cursor natív MCP támogatással rendelkezik. Így kötheted be:

### 1. Nyisd meg az Integrations lapot

Lépj a playbookodhoz a vezérlőpulton, és kattints az **Integrations** lapra (a puzzle ikon).

### 2. Másold ki a Cursor konfigurációt

Egy másolásra kész JSON blokkot látsz. Így néz ki:

```json
{
  "mcpServers": {
    "apb-my-assistant": {
      "url": "https://apbks.com/api/mcp/YOUR_GUID"
    }
  }
}
```

### 3. Illeszd be a Cursor beállításaiba

Mentsd a JSON-t az alábbiak egyikébe:
- **Projektszintű**: `.cursor/mcp.json` a projekt gyökerében
- **Globális**: `~/.cursor/mcp.json` minden projekthez

### 4. Indítsd újra és ellenőrizd

Indítsd újra a Cursort (vagy töltsd újra az ablakot). A playbook eszközei megjelennek a Cursor MCP eszközök paneljén.

## Csatlakozás Claude Desktophoz

```json
{
  "mcpServers": {
    "apb-my-assistant": {
      "transport": "http",
      "url": "https://apbks.com/api/mcp/YOUR_GUID"
    }
  }
}
```

Mentsd ezt a `claude_desktop_config.json` fájlba, és indítsd újra a Claude Desktopot.

## Csatlakozás Claude Code-hoz

Egy parancs:

```bash
claude mcp add apb-my-assistant https://apbks.com/api/mcp/YOUR_GUID --transport http
```

Ellenőrzés: `claude mcp list`.

## Hitelesítés

**Nyilvános playbookok** olvasáshoz nem igényelnek hitelesítést. Bárki csatlakozhat és használhatja az eszközöket.

**Privát playbookok** API kulcsot kérnek. Generálj egyet az Integrations lapon, és add hozzá a konfigurációdhoz:

```json
{
  "mcpServers": {
    "my-playbook": {
      "url": "https://apbks.com/api/mcp/YOUR_GUID",
      "headers": {
        "Authorization": "Bearer apb_live_your_key_here"
      }
    }
  }
}
```

A **write-back** (memóriába vagy canvasra mentés) mindig API kulcsot kér, még nyilvános playbookoknál is. A kulcsok három szerepkörben érhetők el:
- **Viewer** — Csak olvasás
- **Coworker** — Olvasás + írás
- **Admin** — Teljes hozzáférés

## Mit kap az AI ügynököd

Csatlakozás után az AI ügynököd hozzáfér:

| Komponens | MCP képesség |
|---|---|
| **Skills** | Hívható eszközök meghatározott bemeneti sémákkal |
| **Memory** | Olvasás/írás/keresés tartós kulcs-érték tárolóban |
| **Canvas** | Olvasás/írás strukturált markdown dokumentumokban |
| **Personas** | Rendszerprompt és személyiség-kontextus |
| **Secrets** | Szerveroldali hitelesítő proxy (az értékek soha nem kerülnek ki) |

A beépített eszközök között szerepel többek között a `read_memory`, `write_memory`, `search_memory`, `read_canvas`, `write_canvas`, `patch_canvas_section`, `get_canvas_toc`, `list_secrets`, `use_secret`, és továbbiak.

## A kapcsolat tesztelése

Az Integrations lapon másold ki a tesztparancsot:

```bash
curl -s https://apbks.com/api/mcp/YOUR_GUID | head -c 200
```

Ha JSON-t látsz `protocolVersion` és `serverInfo` mezőkkel, minden rendben.

## Mi jön ezután

- **Cursor Marketplace** — Dolgozunk azon, hogy az AgentPlaybooks felkerüljön a Cursor bővítmény/MCP piactérre
- **Windsurf** és más MCP-kompatibilis IDE-k — Ugyanaz a végpont mindenhol működik
- **Management MCP Server** — Használd a `https://apbks.com/api/mcp/manage` címet User API Key-jel playbookok létrehozásához és kezeléséhez közvetlenül az AI ügynöködből

A teljes referenciáért nézd meg az [MCP Integration dokumentációt](/docs/mcp-integration) és a [Platform Integrations útmutatót](/docs/platform-integrations).

---

*AgentPlaybooks — Az AI-d univerzális memóriája és eszköztára. Egy playbook, minden platform.*
