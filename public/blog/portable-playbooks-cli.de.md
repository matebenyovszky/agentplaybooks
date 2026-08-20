---
title: Ein Playbook, jeder Agent — CLI-Adapter, Remote-Sync und das Claude-Code-Plugin
description: Die AgentPlaybooks-CLI synchronisiert Ihre Skills und MCP-Konfiguration jetzt über Claude Code, Cursor, ChatGPT/Codex, Google Antigravity und Hermes Agent hinweg — und kommt als Claude-Code-Plugin, das Sie mit einem Befehl installieren.
date: 2026-08-01
author: Mate Benyovszky
---

# Ein Playbook, jeder Agent

Ihre Agent-Konfiguration ist verstreut. Skills liegen in `.claude/skills/`,
Ihre MCP-Server in `.mcp.json`, eine leicht abweichende Kopie in
`.cursor/mcp.json`, Anweisungen in `AGENTS.md` — und jedes neue
KI-Coding-Tool bringt einen weiteren Ordner mit. Das von Hand konsistent zu
halten ist genau die Fleißarbeit, die Agenten eigentlich abschaffen sollten.

Ab heute schließt die AgentPlaybooks-CLI diese Lücke. `agentplaybooks sync`
erzeugt die Plattformdateien, die den aktivierten Zielen fehlen,
`pull`/`push` verbinden Ihr lokales Projekt mit einem gehosteten Playbook,
und die gesamte CLI ist zugleich ein **Claude-Code-Plugin** — Ihr Agent kann
den Workflow also für Sie ausführen.

## Fünf Plattformen, ein Befehl

`apb sync` normalisiert die gefundene Konfiguration in das kanonische
`agentplaybook.json`-Manifest und füllt dann die Lücken pro Ziel:

| Ziel | Skills | MCP-Server |
|---|---|---|
| Claude Code / Cowork | `.claude/skills/` | `.mcp.json` |
| Cursor | `.cursor/skills/` | `.cursor/mcp.json` |
| ChatGPT / OpenAI Codex | `.codex/skills/` | `.codex/config.toml` |
| Google Antigravity | `.agents/skills/` | — |
| Hermes Agent (Nous Research) | `.agents/skills/` (registriert in `~/.hermes/config.yaml`) | `~/.hermes/config.yaml` |

Schreiben Sie einen Skill einmal in Claude Code, führen Sie
`apb sync --apply` aus, und er erscheint auch in Cursor, Codex und
Antigravity — inklusive Ihrer MCP-Server-Definitionen, automatisch zwischen
JSON und dem TOML-Format von Codex übersetzt.

Ein schönes Detail: Google Antigravity liest Projekt-Skills aus
`.agents/skills/` — exakt dem portablen Speicher von AgentPlaybooks. Ein
gezogenes Playbook ist ohne weitere Schritte Antigravity-bereit.

## Sicher per Voreinstellung

Die Sync-Engine behält die Garantien unseres ursprünglichen Designs:

- **Erst planen.** Ohne explizites `--apply` wird nichts geschrieben oder
  hochgeladen.
- **Kein stilles Überschreiben.** Gleichnamige Definitionen mit
  unterschiedlichem Inhalt sind Konflikte — gemeldet und übersprungen, bis
  Sie den Drift auflösen.
- **Backups.** Jede geänderte Datei wird zuerst nach
  `.agentplaybooks/backups/` kopiert.
- **Keine Geheimnis-Lecks.** Geheimniswerte gelangen nie ins Manifest, und
  `push` verweigert Inhalte, die hartkodierte Zugangsdaten zu enthalten
  scheinen.

## Team-Playbooks: pull und push

```bash
apb login                              # User-API-Key (apb_...) speichern
apb push --apply                       # Skills + MCP-Server + Manifest → gehostetes Playbook
apb pull <guid> --apply                # Teammitglieder ziehen es in ihre Projekte
apb sync --target=claude,codex --apply # …und weiter in die Tools, die sie nutzen
```

Skills *und* MCP-Server-Definitionen reisen in beide Richtungen. `pull` legt
sie im portablen Speicher ab (`.agents/skills/`, `.agents/mcp.json`); das
anschließende `sync` verteilt sie auf jede Plattform, die Ihr Teammitglied
nutzt — auch wenn das ein anderer Editor ist als Ihrer. Genau darum geht es:
**die portable Einheit ist das Playbook, nicht das Tool**.

Zwei Details, nach denen sofort gefragt wurde. Erstens kennt die gehostete
Seite Dinge, die eine lokale Datei nicht ausdrücken kann: Request-Timeouts,
Auth-Konfiguration, kuratierte Tool-Listen. Ein `push` aktualisiert die
Verbindung und lässt all das unberührt — der reichere Datensatz wird nie auf
den ärmeren eingeebnet. Zweitens ist auf einer brandneuen Maschine der
portable Speicher das Einzige auf der Platte und selbst kein Deployment-Ziel;
deshalb nennt Ihnen `sync`, welche Agent-Tools es für Ihren Benutzer gefunden
hat und was Sie an `--target` übergeben sollten. Keine stillen No-Ops.

## Secrets: Der Vertrag reist, die Zugangsdaten nicht

Das ist der Teil, bei dem alle vage Formulierungen erwarten, deshalb ganz
deutlich: **kein Geheimniswert bewegt sich jemals.** Was sich bewegt, ist die
Anforderung. `sync` sammelt jede Umgebungsreferenz aus Ihrer
MCP-Konfiguration im Manifest:

```json
"secrets": [
  { "name": "DEPLOY_API_KEY", "ref": "env:DEPLOY_API_KEY", "required": true }
]
```

Wer das Playbook zieht, weiß nun genau, welche Variablen zu setzen sind — und
niemand hat irgendwo einen Schlüssel verschickt. Richten Sie einen Eintrag
stattdessen auf einen Vault, überlebt Ihre Änderung den nächsten Sync.
Literale Zugangsdaten werden von `doctor` gemeldet, und `push` verweigert die
Ausführung, bis sie durch Referenzen ersetzt sind — auch dann, wenn sie in
einem MCP-Header oder einer URL stecken.

## Als Claude-Code-Plugin installieren

Das CLI-Paket ist selbst ein Claude-Code- / Claude-Cowork-Plugin mit dem
`agentplaybooks`-Skill und Slash-Befehlen:

```text
/plugin marketplace add matebenyovszky/agentplaybooks
/plugin install agentplaybooks@agentplaybooks
```

Dann fragen Sie einfach: „prüfe meine Agent-Konfiguration“, „mach meine
Claude-Skills in ChatGPT und Cursor verfügbar“, oder führen Sie
`/agentplaybooks:doctor` aus. Der Skill kennt den sicheren Ablauf — planen,
Diff zeigen, erst nach Ihrer Freigabe anwenden.

## Loslegen

```bash
git clone https://github.com/matebenyovszky/agentplaybooks
node agentplaybooks/packages/cli/bin/agentplaybooks.js doctor .
```

Die vollständige Anleitung finden Sie in der
[CLI-&-Editor-Plugins-Dokumentation](/docs/cli) — und sagen Sie uns, welchen
Plattform-Adapter Sie als Nächstes brauchen: ROS 2 steht bereits auf der
[Roadmap](/docs/roadmap).
