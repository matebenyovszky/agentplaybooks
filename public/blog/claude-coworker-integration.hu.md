---
title: Turbózd fel a Claude Coworkert az AgentPlaybooks-szal
description: Ismerd meg, hogyan bővítheted az Anthropic új Claude Coworker AI agentjét hordozható készségekkel, személyiségekkel és tartós memóriával az AgentPlaybooks segítségével.
date: 2026-01-20
author: Mate Benyovszky
---

# Turbózd fel a Claude Coworkert az AgentPlaybooks-szal

Az Anthropic nemrég indította el a **Claude Coworker**-t (más néven Claude Cowork) — egy úttörő AI ágenst, amely közvetlenül a Mac-eden működik. A chat-alapú asszisztensekkel ellentétben a Coworker képes ténylegesen *cselekedni*: fájlokat rendez, dokumentumokat konvertál, riportokat készít, és munkafolyamatokat automatizál anélkül, hogy neked bármit is tenned kellene.

De itt a kihívás: hogyan biztosítod, hogy a Coworker a céged specifikus irányelveit kövesse? Hogyan oszthatsz meg egy finoman hangolt ágens konfigurációt a csapatoddal? Pontosan erre való az **AgentPlaybooks**.

## Mi az a Claude Coworker?

A Claude Coworker az Anthropic kutatási előzetese egy autonóm AI ágensről, amely:

- **Hozzáfér a fájlrendszeredhez** — olvas, ír és rendezi a fájlokat a kijelölt mappákban
- **Többlépéses feladatokat hajt végre** — tervez és önállóan elvégez összetett munkafolyamatokat
- **Csatlakozókat használ** — integrálódik külső szolgáltatásokkal és adatforrásokkal
- **Készségekből tanul** — moduláris utasításcsomagokat követ (Claude Skills)

Ugyanazon a technológián alapul, mint a Claude Code (az Anthropic fejlesztőknek szánt CLI eszköze), de mindenkinek tervezték — marketingesektől az operációs vezetőkig.

## A Claude Skills ereje

A Claude Skills olyan utasításcsomagok, amelyek megtanítják a Coworkernek, hogyan kezeljen specifikus feladatokat. Gondolj rájuk úgy, mint **hordozható szakértelemre**. Egy készség meghatározhatja:

- Hogyan rendezzen költségjelentéseket negyedévenként
- Hogyan formázzon megbeszélési jegyzeteket egy specifikus sablonba
- Hogyan generáljon heti állapotjelentéseket nyers adatokból

Az AgentPlaybooks tovább viszi ezt a koncepciót, biztosítva egy **univerzális platformot** ezeknek a készségeknek a létrehozására, kezelésére és megosztására.

## Az AgentPlaybooks integrálása a Claude Coworkerrel

### 1. módszer: Készségek exportálása Claude Skills formátumban

Az AgentPlaybooks készségek már kompatibilisek az Anthropic eszközformátumával. A Coworkerrel való használathoz:

1. **Exportáld a playbook-odat** Anthropic formátumban:
   ```
   https://apbks.com/api/playbooks/YOUR_GUID?format=anthropic
   ```

2. **Konvertáld a készségeket helyi skill mappába**, amelyhez a Coworker hozzáférhet:
   ```bash
   curl -s "https://apbks.com/api/playbooks/YOUR_GUID?format=anthropic" \
     | jq '.tools' > ~/Documents/CoworkerSkills/my_skills.json
   ```

3. **Irányítsd a Coworkert a készségeidhez** a Claude alkalmazás beállításaiban.

### 2. módszer: MCP integráció (Ajánlott)

A legerősebb integráció az **MCP (Model Context Protocol)** révén történik. Az AgentPlaybooks élő MCP végpontot biztosít minden playbook-hoz:

```
https://apbks.com/api/mcp/YOUR_GUID
```

Konfiguráld a Claude Coworker MCP beállításait:

```json
{
  "mcpServers": {
    "my-playbook": {
      "transport": "http",
      "url": "https://apbks.com/api/mcp/YOUR_GUID"
    }
  }
}
```

Mostantól a Coworker hozzáfér:
- **Eszközökhöz** — Minden playbook készséged hívható funkcióként
- **Erőforrásokhoz** — Személyiségek, memória és készség definíciók
- **Tartós memóriához** — Az ágensed emlékszik a kontextusra a munkamenetek között

### 3. módszer: System Prompt befecskendezés

Egyszerűbb beállításokhoz add hozzá a playbook-odat a Coworker működési kontextusához:

1. Exportálás markdown-ként:
   ```bash
   curl -s "https://apbks.com/api/playbooks/YOUR_GUID?format=markdown" > ~/Documents/playbook.md
   ```

2. Add hozzá a kijelölt Coworker mappákhoz referencia dokumentumként.

## Valós használati esetek

### 🏢 Vállalati tudásmunkások

*Probléma*: Minden alkalmazott AI asszisztense másként viselkedik.
*Megoldás*: Készíts egy vállalati playbook-ot szabványosított személyiségekkel és készségekkel. Ossz meg egyetlen URL-en keresztül. Mindenki Coworkere ugyanazokat az irányelveket követi.

### 📊 Riport automatizálás

*Probléma*: A heti riportok összeállítása órákig tart.
*Megoldás*: Készíts egy playbook-ot készségekkel:
- `extract_metrics` — Adatok kinyerése táblázatokból
- `format_report` — Vállalati sablon alkalmazása
- `summarize_findings` — Vezetői összefoglaló generálása

A Coworker minden péntek reggel önállóan futtatja ezeket.

### 📁 Dokumentumrendezés

*Probléma*: Fájlok szétszórva a Letöltések, Asztal és véletlenszerű mappákban.
*Megoldás*: Egy playbook szervezési szabályokkal a memóriában:
- Számlák → `/Documents/Penzugy/Szamlak/2026/`
- Képernyőképek → `/Documents/Kepernyo/{datum}/`
- Megbeszélési jegyzetek → `/Documents/Megbeszelesek/{projekt}/`

## Minta készségek Claude Coworkerhez

Íme három éles használatra kész készség, amelyet hozzáadhatsz az AgentPlaybooks playbook-odhoz:

### Fájlrendezési készség

```json
{
  "name": "organize_files",
  "description": "Fájlok rendezése egy mappában előre definiált szabályok szerint fájltípus, dátum és elnevezési minták alapján",
  "input_schema": {
    "type": "object",
    "properties": {
      "source_folder": {
        "type": "string",
        "description": "A rendezendő fájlokat tartalmazó mappa elérési útja"
      },
      "rules": {
        "type": "string",
        "description": "Rendezési szabályok természetes nyelven"
      }
    },
    "required": ["source_folder"]
  }
}
```

### Dokumentumformázási készség

```json
{
  "name": "format_document",
  "description": "Nyers jegyzetek vagy adatok konvertálása formázott dokumentummá vállalati sablonok szerint",
  "input_schema": {
    "type": "object",
    "properties": {
      "input_path": {
        "type": "string",
        "description": "A forrásdokumentum elérési útja"
      },
      "template": {
        "type": "string",
        "description": "Alkalmazandó sablon neve (pl. 'megbeszeles_jegyzet', 'heti_riport')"
      },
      "output_path": {
        "type": "string",
        "description": "Hova mentse a formázott dokumentumot"
      }
    },
    "required": ["input_path", "template"]
  }
}
```

### Riportgenerálási készség

```json
{
  "name": "generate_report",
  "description": "Strukturált riport generálása adatfájlokból, diagramokkal és vezetői összefoglalóval",
  "input_schema": {
    "type": "object",
    "properties": {
      "data_sources": {
        "type": "array",
        "items": {"type": "string"},
        "description": "Adatfájlok elérési útjai (CSV, Excel, JSON)"
      },
      "report_type": {
        "type": "string",
        "enum": ["weekly", "monthly", "quarterly", "custom"],
        "description": "A generálandó riport típusa"
      },
      "include_charts": {
        "type": "boolean",
        "description": "Tartalmazzon-e adatvizualizációkat"
      }
    },
    "required": ["data_sources", "report_type"]
  }
}
```

## Miért AgentPlaybooks + Claude Coworker?

| Kihívás | AgentPlaybooks megoldás |
|---------|-------------------------|
| Készség fragmentáció | Központosított, verziózott készségtár |
| Csapat inkonzisztencia | Megosztott playbook-ok URL-en keresztül |
| Vendor lock-in | Export bármilyen formátumba (Anthropic, OpenAI, MCP) |
| Kontextus elvesztése | Tartós memória a munkamenetek között |
| Nincs átláthatóság | Dashboard az összes ágens konfiguráció kezeléséhez |

## Kezdés

1. **Készíts egy playbook-ot** az [agentplaybooks.ai/dashboard](/dashboard) oldalon
2. **Add hozzá a készségeidet és személyiségeidet** az intuitív szerkesztőnkkel
3. **Exportáld MCP-n keresztül** a Claude Coworkerrel való összekapcsoláshoz
4. **Oszd meg a csapatoddal** — egy URL, azonnali szinkronizáció

---

A Claude Coworker az AI asszisztencia jövőjét képviseli — ágensek, amelyek ténylegesen *dolgoznak* melletted. Az AgentPlaybooks-szal biztosítod, hogy ez a munka konzisztens, átadható és az irányításod alatt áll.

Készen állsz, hogy felturbózd az AI munkatársadat? [Kezdd el a playbook-od építését még ma →](/dashboard)

