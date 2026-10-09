---
title: Jedes playbook als MCP-Server verbinden — Cursor, Claude und mehr
description: Schritt-für-Schritt-Anleitung zum Anbinden von AgentPlaybooks an Cursor IDE, Claude Desktop, Claude Code und andere MCP-kompatible Tools. Eine URL, Konfiguration per Copy-Paste, sofortige KI-Tools.
date: 2026-04-05
author: Mate Benyovszky
---

# Jedes playbook als MCP-Server verbinden

Jedes playbook auf AgentPlaybooks ist zugleich ein live **MCP (Model Context Protocol)**-Server. Du kannst es also direkt in Cursor, Claude Desktop, Claude Code oder jeden MCP-kompatiblen Client einbinden — und dein KI-Agent hat sofort Zugriff auf die Tools, Memory, Canvas und Personas des playbooks.

Heute machen wir das noch einfacher: mit einem neuen Tab **Integrationen** im playbook-Dashboard und aktualisierter Dokumentation, in der die Einrichtung in Cursor IDE klar im Vordergrund steht.

## Update (Oktober 2026): drei Zugänge

Seit dieser Beitrag geschrieben wurde, ist ein Playbook auf drei Wegen
erreichbar. Wähle nach *Umfang* und nach *Client*:

| Du möchtest | Nutze | Authentifizierung |
|---|---|---|
| **Dein ganzes Konto** — alle Playbooks, inklusive Anlegen und Verwalten aus dem Agenten | `https://apbks.com/api/mcp/manage` | OAuth-Anmeldung (der Client öffnet einen Zustimmungsdialog) oder ein User API Key |
| **Ein einzelnes Playbook** — genau seine Tools, sein Memory und seine Skills | `https://apbks.com/api/mcp/YOUR_GUID` | Ein Playbook API Key — für Lesezugriff auf ein öffentliches Playbook keiner |
| **Skripte und codeausführende Agenten** — ganz ohne MCP | `https://apbks.com/api/mcp/YOUR_GUID/llms.txt` | Derselbe Playbook API Key |

**Konto-Endpunkt.** Eine Verbindung deckt alle Playbooks ab, auf die du Zugriff
hast; die Tools erhalten ein `playbook_id`-Argument. Er ist eine echte OAuth-2.1-
geschützte Ressource: Wähle in Claudes Dialog *Add custom connector* die Option
**Always required** und melde dich an — kein Schlüssel zum Kopieren. Headless-
Automatisierung kann stattdessen einen User API Key senden.

**Playbook-Endpunkt.** Über die URL an genau ein Playbook gebunden,
authentifiziert mit einem Playbook API Key. Der Schlüssel darf in
`Authorization` (mit oder ohne `Bearer `-Präfix) oder in `X-API-Key` stehen —
praktisch, wenn ein Client `Authorization` für sich selbst reserviert. Mit
`?toolset=runtime` (oder `memory`, `admin`) werden weniger Tools angeboten; auf
einer nicht festgelegten Verbindung erreicht der Agent über `find_tools` trotzdem
alles.

**Skripte.** Manche Agenten schreiben Code, statt Tools einzeln aufzurufen, und
einige davon können aus ihren Skripten keine MCP-Tools aufrufen. Für sie ist
`llms.txt` ein einziger Abruf, der die Authentifizierung und die Ein-POST-
Aufrufkonvention (`POST .../tools/TOOL_NAME` mit JSON-Argumenten) erklärt und
jedem Tool ein One-Shot-Beispiel mitgibt — danach verkettet der Agent in einem
Skript so viele Aufrufe wie nötig und hält Zwischenergebnisse aus seinem Kontext
heraus.

Der Tab **Integrationen** im Dashboard zeigt jetzt alle drei, jeweils mit
Kopierknopf.

## Was ist MCP?

Das [Model Context Protocol](https://modelcontextprotocol.io/) ist ein offener Standard (ursprünglich von Anthropic entwickelt), mit dem KI-Assistenten über eine einfache JSON-RPC-Schnittstelle an externe Tools und Datenquellen angebunden werden können. Stell es dir als universelles Plugin-System für KI vor.

AgentPlaybooks setzt die MCP-Server-Spezifikation für jedes playbook um. Deine Skills werden zu aufrufbaren Tools, dein Memory zu les- und beschreibbarem State, und deine Personas liefern Kontext für System-Prompts — alles über einen einzigen HTTP-Endpunkt.

## Der neue Tab „Integrationen“

Wir haben den playbook-Editor umgebaut. Der frühere Tab „API Keys“ heißt jetzt **Integrationen** und enthält alles, was du brauchst, um dein playbook mit externen Plattformen zu verbinden:

1. **Als MCP-Server verbinden** — Fertige JSON-Konfigurationen zum Kopieren für Cursor, Claude Desktop und Claude Code. Die Konfigurationen sind bereits mit GUID und Namen deines playbooks vorausgefüllt.
2. **Mit KI-Plattformen nutzen** — Schnellaktionen (In Claude öffnen, In ChatGPT öffnen, als ZIP exportieren) plus Referenz der API-Endpunkte.
3. **Plattform-Karten** — Links mit einem Klick zu Schritt-für-Schritt-Anleitungen für Cursor, ChatGPT, Claude, Gemini, Claude Code und generische API-Integration.
4. **API Keys** — API-Keys für Schreibzugriff erzeugen und verwalten.

## Verbindung mit Cursor IDE

Cursor unterstützt MCP nativ. So bindest du ein playbook an:

### 1. Tab „Integrationen“ öffnen

Öffne dein playbook im Dashboard und klicke auf den Tab **Integrationen** (Puzzle-Symbol).

### 2. Cursor-Konfiguration kopieren

Du siehst einen fertigen JSON-Block zum Kopieren. Er sieht so aus:

```json
{
  "mcpServers": {
    "apb-my-assistant": {
      "url": "https://apbks.com/api/mcp/YOUR_GUID"
    }
  }
}
```

### 3. In die Cursor-Einstellungen einfügen

Speichere das JSON in einer der folgenden Dateien:
- **Projektweit**: `.cursor/mcp.json` im Projektroot
- **Global**: `~/.cursor/mcp.json` für alle Projekte

### 4. Neu starten und prüfen

Starte Cursor neu (oder lade das Fenster neu). Die Tools deines playbooks erscheinen im MCP-Tools-Panel von Cursor.

## Verbindung mit Claude Desktop

> **Das hat nie funktioniert.** `claude_desktop_config.json` kennt nur lokale Server und ignoriert eine URL ohne Fehlermeldung. Nutzen Sie stattdessen das AgentPlaybooks-Plugin oder einen eigenen Connector, mit OAuth-Anmeldung und ohne Key — siehe [AgentPlaybooks in Claude](/docs/claude).

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

Speichere das in deiner `claude_desktop_config.json` und starte Claude Desktop neu.

## Verbindung mit Claude Code

Ein Befehl:

```bash
claude mcp add apb-my-assistant https://apbks.com/api/mcp/YOUR_GUID --transport http
```

Zur Kontrolle: `claude mcp list`.

## Authentifizierung

**Öffentliche playbooks** brauchen für Lesezugriff keine Authentifizierung. Jede Person kann sich verbinden und die Tools nutzen.

**Private playbooks** benötigen einen API Key. Erzeuge einen im Tab Integrationen und füge ihn in deine Konfiguration ein:

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

**Write-back** (Speichern in Memory oder Canvas) erfordert immer einen API Key — auch bei öffentlichen playbooks. Keys gibt es in drei Rollen:
- **Viewer** — Nur lesen
- **Coworker** — Lesen und schreiben
- **Admin** — Voller Zugriff

## Was dein KI-Agent bekommt

Nach der Verbindung steht deinem KI-Agenten Folgendes zur Verfügung:

| Komponente | MCP-Fähigkeit |
|---|---|
| **Skills** | Aufrufbare Tools mit definierten Eingabe-Schemas |
| **Memory** | Lesen/Schreiben/Suchen in persistentem Key-Value-Store |
| **Canvas** | Lesen/Schreiben strukturierter Markdown-Dokumente |
| **Personas** | System-Prompt und Persönlichkeitskontext |
| **Secrets** | Serverseitiger Credential-Proxy (Werte werden nie preisgegeben) |

Zu den eingebauten Tools gehören unter anderem `read_memory`, `write_memory`, `search_memory`, `read_canvas`, `write_canvas`, `patch_canvas_section`, `get_canvas_toc`, `list_secrets`, `use_secret` und weitere.

## Verbindung testen

Kopiere im Tab Integrationen den Testbefehl:

```bash
curl -s https://apbks.com/api/mcp/YOUR_GUID | head -c 200
```

Wenn du JSON mit `protocolVersion` und `serverInfo` siehst, passt alles.

## Was als Nächstes kommt

- **Cursor Marketplace** — Wir arbeiten daran, AgentPlaybooks im Cursor-Extension-/MCP-Marketplace zu listen
- **Windsurf** und andere MCP-kompatible IDEs — Derselbe Endpunkt funktioniert überall
- **Management MCP Server** — Verfügbar: den Konto-Endpunkt mit OAuth-Anmeldung siehe oben unter *Update (Oktober 2026)*

Die vollständige Referenz findest du in der [MCP-Integration-Dokumentation](/docs/mcp-integration) und im [Leitfaden zu Plattform-Integrationen](/docs/platform-integrations).

---

*AgentPlaybooks — Universelles Memory und Toolkit für deine KI. Ein playbook, jede Plattform.*
