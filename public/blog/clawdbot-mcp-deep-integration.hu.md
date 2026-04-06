---
title: Mély MCP integráció — AgentPlaybooks és Clawdbot
description: Hogyan csatlakoztathatod az AgentPlaybooks-ot a Clawdbot-tal, a trendi nyílt forráskódú, saját hosztolású AI asszisztenssel, amely támogatja a WhatsApp-ot, Telegram-ot és a teljes MCP protokollt.
date: 2026-01-27
author: Mate Benyovszky
---

# Mély MCP integráció: AgentPlaybooks és Clawdbot

Az AI asszisztensek világában épp most történt egy nagy felfordulás. A **Clawdbot**, Peter Steinberger által készített nyílt forráskódú, saját hosztolású személyes AI asszisztens, trenddé vált a fejlesztői közösségekben — és nem ok nélkül. Kombinálja a Claude, ChatGPT és Gemini erejét teljes **Model Context Protocol (MCP)** támogatással, WhatsApp/Telegram/Discord integrációval és teljes helyi kontrollal.

Ma örömmel jelentjük be a Clawdbot első osztályú támogatását az **AgentPlaybooks**-ban. Ez azt jelenti, hogy most már hordozható, megosztható playbook-okkal működtetheted a Clawdbotodat — készségekkel, személyiségekkel és tartós memóriával együtt.

## Mi az a Clawdbot?

A Clawdbot egy **AI Gateway**, amely hídként működik a népszerű üzenetküldő platformok és a nagy nyelvi modell API-k között. Főbb jellemzők:

- 🔐 **Saját hosztolású adatvédelem** — A saját hardvereden fut (jellemzően Mac Mini)
- 📱 **Többplatformos üzenetküldés** — WhatsApp, Telegram, Discord és még több
- 🧠 **Tartós memória** — Emlékszik a kontextusra a beszélgetések között
- 🤖 **Proaktív üzenetküldés** — Triggerek alapján kezdeményezhet beszélgetéseket
- 🔧 **Teljes MCP támogatás** — A Model Context Protocol révén bővíti a képességeit
- 🌐 **Multi-LLM backend** — Válassz Claude-ot, ChatGPT-t, Geminit vagy helyi modelleket

A felhőalapú AI asszisztensekkel ellentétben a Clawdbot helyben tartja az adataidat és teljes kontrollt ad az AI viselkedése felett.

## Miért változtat meg mindent az MCP?

A **Model Context Protocol** egy nyílt szabvány (az Anthropic fejlesztette), amely lehetővé teszi az AI ágensek számára, hogy külső eszközökhöz és adatforrásokhoz csatlakozzanak. Gondolj rá úgy, mint egy univerzális plugin rendszerre az AI számára.

Az MCP-vel a Clawdbotod képes:
- Valós idejű adatokhoz hozzáférni külső API-kból
- Eszközöket és funkciókat végrehajtani
- Tartós memória tárolókból olvasni
- Strukturált készség definíciókat követni

Az AgentPlaybooks teljesen kompatibilis MCP szerver végpontot biztosít minden playbook-hoz — így az integráció zökkenőmentes.

## Az AgentPlaybooks beállítása Clawdbot-tal

### 1. lépés: Készítsd el a Playbook-odat

Először készíts egy playbook-ot az [apbks.com/dashboard](/dashboard) oldalon:

- **Személyiségek** — Definiáld, hogyan viselkedjen az asszisztensed
- **Készségek** — Milyen képességekkel rendelkezzen
- **Memória** — Tartós kontextus, amit emlékezzen

### 2. lépés: Szerezd meg az MCP végpontodat

Minden nyilvános playbook kap egy MCP végpontot:

```
https://apbks.com/api/mcp/YOUR_GUID
```

### 3. lépés: Konfiguráld a Clawdbotot

Add hozzá az AgentPlaybooks MCP szervert a Clawdbot konfigurációjához. A `config.yaml` fájlban:

```yaml
# Clawdbot config.yaml
llm:
  provider: anthropic  # vagy openai, google
  model: claude-sonnet-4-20250514

mcp_servers:
  - name: agent-playbook
    transport: http
    url: https://apbks.com/api/mcp/YOUR_GUID
    description: Egyéni AI playbook-om készségekkel és memóriával

messaging:
  whatsapp:
    enabled: true
    phone_number: "+36301234567"
  telegram:
    enabled: true
    bot_token: "a_bot_tokened"
```

### 4. lépés: Ellenőrizd a kapcsolatot

Indítsd el a Clawdbotot és ellenőrizd az MCP kapcsolatot:

```bash
clawdbot status

# A kimenet ezt kell mutassa:
# MCP Servers:
#   ✓ agent-playbook (connected)
#     - Tools: 5 available
#     - Resources: 3 available
```

## Mit kap a Clawdbotod?

A csatlakozás után a Clawdbot örökli mindent a playbook-odból:

### Eszközök (a készségekből)

A készségeid hívható eszközökké válnak. Például:

| Playbook készség | Clawdbot eszköz |
|-----------------|-----------------|
| `search_web` | `search_web(query)` |
| `summarize_text` | `summarize_text(text, length)` |
| `translate_document` | `translate_document(text, target_lang)` |

### Erőforrások

A Clawdbot képes olvasni a playbook erőforrásaidat:

```
playbook://YOUR_GUID/personas  → AI személyiségek
playbook://YOUR_GUID/memory    → Tartós tárolás
playbook://YOUR_GUID/skills    → Képesség definíciók
```

### Tartós memória

A gyilkos funkció: **megosztott memória platformok között**. Frissíts egy memória bejegyzést a Clawdboton keresztül WhatsApp-on, és azonnal elérhető, amikor Telegram-on vagy Discord-on csevelsz.

```javascript
// A Clawdbot automatikusan szinkronizálja a memóriát
await mcp.writeResource("playbook://GUID/memory/user_preferences", {
  timezone: "Europe/Budapest",
  language: "hu",
  notification_style: "brief"
});
```

## Valós használati esetek

### 🏠 Okos otthon asszisztens

Használd a Clawdbot + AgentPlaybooks kombinációt személyes otthoni asszisztens létrehozásához:

**Playbook készségek:**
- `control_lights` — Kapcsolódás a Home Assistant-hoz
- `set_thermostat` — Hőmérséklet beállítás
- `check_calendar` — Mai események olvasása
- `send_reminder` — Push értesítések

**Üzenetküldő platformok:**
- WhatsApp a családtagoknak
- Telegram gyors parancsokhoz
- Discord otthon automatizálási naplókhoz

### 📊 Üzleti intelligencia bot

**Playbook készségek:**
- `query_database` — SQL lekérdezések biztonságos futtatása
- `generate_chart` — Vizualizációk készítése
- `summarize_report` — Hosszú dokumentumok tömörítése
- `schedule_meeting` — Naptár foglalások

**Playbook memória:**
- Legutóbbi lekérdezések és eredmények
- Felhasználói preferenciák
- Gyakran használt metrikák

### 🌍 Többnyelvű ügyfélszolgálati ágens

**Playbook személyiségek:**
- Magyar támogatási személyiség
- Angol támogatási személyiség
- Német támogatási személyiség

**Készségek:**
- `detect_language` — Nyelv automatikus felismerése
- `translate_response` — Fordítás küldés előtt
- `log_ticket` — Támogatási jegyek létrehozása

## Haladó: Kétirányú memória szinkronizáció

Az AgentPlaybooks támogatja a visszaírást API-n keresztül. Konfiguráld a Clawdbotot memóriák tárolására:

```yaml
mcp_servers:
  - name: agent-playbook
    transport: http
    url: https://apbks.com/api/mcp/YOUR_GUID
    auth:
      type: bearer
      token: apb_live_xxx  # Az AgentPlaybooks API kulcsod
    write_enabled: true
```

Most a Clawdbot képes frissíteni a playbook-od memóriáját:

```python
# A Clawdbot eszköz végrehajtásán belül
def remember_user_preference(key: str, value: any):
    requests.put(
        f"https://apbks.com/api/playbooks/{GUID}/memory/{key}",
        headers={"Authorization": f"Bearer {API_KEY}"},
        json={"value": value}
    )
```

## Minta Clawdbot-kész playbook

Íme egy teljes playbook JSON, amit importálhatsz:

```json
{
  "name": "Clawdbot Személyes Asszisztens",
  "description": "Többplatformos AI asszisztens MCP integrációval",
  "personas": [
    {
      "name": "Asszisztens",
      "system_prompt": "Segítőkész személyes asszisztens vagy. Tudsz a weben keresni, feladatokat kezelni és felhasználói preferenciákat megjegyezni. Mindig legyél tömör az üzenetküldési kontextusokban."
    }
  ],
  "skills": [
    {
      "name": "quick_search",
      "description": "Keresés a weben és rövid összefoglaló visszaadása üzenetküldéshez",
      "input_schema": {
        "type": "object",
        "properties": {
          "query": {"type": "string"},
          "max_results": {"type": "integer", "default": 3}
        },
        "required": ["query"]
      }
    },
    {
      "name": "set_reminder",
      "description": "Emlékeztető létrehozása, amely az aktuális üzenetküldő platformon keresztül érkezik",
      "input_schema": {
        "type": "object",
        "properties": {
          "message": {"type": "string"},
          "when": {"type": "string", "description": "Természetes nyelvű időpont, pl. '2 óra múlva' vagy 'holnap 9-kor'"}
        },
        "required": ["message", "when"]
      }
    },
    {
      "name": "manage_task",
      "description": "Feladatok hozzáadása, befejezése vagy listázása a személyes feladatlistából",
      "input_schema": {
        "type": "object",
        "properties": {
          "action": {"type": "string", "enum": ["add", "complete", "list"]},
          "task": {"type": "string"},
          "priority": {"type": "string", "enum": ["low", "medium", "high"]}
        },
        "required": ["action"]
      }
    }
  ],
  "memory": {
    "user_name": "Barát",
    "preferred_language": "hu",
    "notification_hours": "09:00-22:00"
  }
}
```

## Az adatvédelmi előny

A csak felhős megoldásokkal ellentétben a Clawdbot + AgentPlaybooks kombináció kínálja:

| Funkció | Felhő AI | Clawdbot + AgentPlaybooks |
|---------|----------|---------------------------|
| Adatok helye | Szolgáltató szerverei | A saját géped |
| Üzenet adatvédelem | Vendor naplózza | Eszközön marad |
| Testreszabás | Korlátozott | Korlátlan |
| Offline képesség | Nincs | Teljes (helyi LLM-mel) |
| Költség | Üzenetenkénti díj | Fix infrastruktúra |

## Kezdj bele még ma!

1. **Telepítsd a Clawdbotot** — Kövesd a [Clawdbot dokumentációt](https://github.com/steipete/clawdbot)
2. **Készíts egy playbook-ot** — Tervezd meg az AI-dat az [agentplaybooks.ai/dashboard](/dashboard) oldalon
3. **Csatlakozz MCP-n keresztül** — Add hozzá a playbook végpontodat a Clawdbot konfighoz
4. **Kezdj csevelni** — Az AI asszisztensed készen áll WhatsApp-on, Telegram-on és Discord-on

---

A Clawdbot saját hosztolású infrastruktúrájának és az AgentPlaybooks hordozható playbook-jainak kombinációja létrehozza a tökéletes AI asszisztens stacket — privát, erőteljes és teljesen az irányításod alatt.

Készen állsz a sajátod megépítésére? [Készítsd el a playbook-odat →](/dashboard)

