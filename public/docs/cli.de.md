# CLI & Editor-Plugins

Die AgentPlaybooks-CLI (`@agentplaybooks/cli`, Binary `agentplaybooks` oder
`apb`) hält Ihre Agent-Konfiguration — Anweisungsdateien, Agent Skills und
MCP-Server-Definitionen — gesund, konsistent über alle KI-Coding-Tools hinweg
und teilbar als gehostetes Playbook. Es ist ein Node.js-Paket (>= 20) ohne
Abhängigkeiten und liegt in
[`packages/cli`](https://github.com/matebenyovszky/agentplaybooks/tree/main/packages/cli).

## Doctor: Agent-Konfiguration prüfen

```bash
apb doctor .            # menschenlesbarer Gesundheitsbericht
apb doctor . --json     # stabile maschinenlesbare Ausgabe
apb doctor . --strict   # Exit-Code 2 bei High/Critical-Befunden (CI)
```

Doctor ist rein lesend und arbeitet nur lokal. Er entdeckt `AGENTS.md`,
`CLAUDE.md`, `.cursorrules`, `SKILL.md`-Dateien und MCP-Konfigurationen in
den Plattformordnern und meldet:

- Verstöße gegen die Agent-Skills-Spezifikation (fehlender Name/Beschreibung)
- Wahrscheinlich hartkodierte Zugangsdaten (nie Werte, nur Zeilennummern)
- Unsichere `http://`-MCP-URLs außerhalb von localhost
- Gleichnamige Skills oder MCP-Server mit abweichenden Definitionen (Drift)
- Einen deterministischen Gesundheitswert von 0–100

## Sync: ein Playbook, jeder Agent

```bash
apb sync .                       # nur Plan — zeigt, was geschrieben würde
apb sync . --apply               # Manifest und fehlende Plattformdateien schreiben
apb sync . --target=codex        # ein Ziel aktivieren, das das Projekt nicht hat
```

Sync normalisiert die gefundene Konfiguration in das kanonische
`agentplaybook.json`-Manifest und erzeugt anschließend die Dateien, die den
aktivierten Deployment-Zielen fehlen:

| Ziel | Skills | MCP-Server | Anweisungen |
|---|---|---|---|
| `claude` — Claude Code / Claude Cowork | `.claude/skills/<name>/SKILL.md` | `.mcp.json` | `CLAUDE.md`, das `AGENTS.md` importiert |
| `cursor` — Cursor | `.cursor/skills/<name>/SKILL.md` | `.cursor/mcp.json` | — |
| `codex` — ChatGPT / OpenAI Codex | `.codex/skills/<name>/SKILL.md` | `.codex/config.toml` | liest `AGENTS.md` nativ |
| `antigravity` — Google Antigravity | `.agents/skills/<name>/SKILL.md` | — (globale Konfig.) | — |
| `hermes` — Nous Hermes Agent | `~/.hermes/skills/<name>/SKILL.md` | — (globale `config.yaml`) | liest `AGENTS.md` nativ |

Erkannte Plattformen werden automatisch aktiviert; `antigravity` und `hermes`
sind Opt-in — fügen Sie einen Eintrag zu `spec.targets` im
`agentplaybook.json` hinzu:

```json
{ "id": "codex", "type": "codex", "enabled": true, "config": {} }
```

Sicherheitsregeln:

- Ohne explizites `--apply` bleibt alles ein Plan.
- Gleichnamige Definitionen mit unterschiedlichem Inhalt sind **Konflikte**:
  Sie werden gemeldet und übersprungen, nie überschrieben.
- Geänderte Dateien werden zuerst unter `.agentplaybooks/backups/` gesichert.
- Geheimniswerte gelangen nie in das Manifest — nur Umgebungsreferenzen.
- Zeilenenden werden normalisiert (CRLF gilt als LF), damit derselbe Skill
  unter Windows, macOS und Linux denselben Digest hat. Ein Team mit
  gemischten Plattformen sieht keinen Phantom-Drift durch Checkout-Unterschiede.

## Remote-Sync: Playbooks im Team teilen

```bash
export AGENTPLAYBOOKS_API_KEY=<ihr-user-api-key>
apb login               # Schlüssel prüfen und speichern (~/.agentplaybooks, 0600)
apb playbooks           # zugängliche Playbooks auflisten

apb pull <guid> --apply # Skills nach .agents/skills/ herunterladen
apb push --apply        # lokale Skills + Manifest hochladen
```

Anweisungen, Skills, MCP-Server und das Manifest reisen alle in beide
Richtungen:

- **Lokal → gehostet** (`push`): Die Anweisungsdatei des Projekts, die Skills
  und MCP-Server-Definitionen aus jedem Plattformordner sowie das kanonische
  Manifest werden in das verknüpfte (oder ein neues) Playbook geladen. Liegen
  mehrere Anweisungsdateien im Projektwurzelverzeichnis, hat `AGENTS.md`
  Vorrang; widersprechen sich diese Wurzeldateien untereinander, ist das ein
  Konflikt. Verschachtelte Anweisungsdateien bleiben lokal, weil sie ein
  Unterverzeichnis und nicht das Projekt betreffen. Für die Verbindung selbst
  (`command`, `args`, `env`, `url`, `headers`) sind die lokalen Dateien maßgeblich;
  Federation-Einstellungen, die es nur auf der gehosteten Seite gibt —
  Timeouts, Auth, Zugriff, kuratierte Tool-Listen, Beschreibungen —, bleiben
  erhalten und werden nicht überschrieben. Remote-Einträge, die lokal nicht
  mehr existieren, bleiben unberührt.
- **Gehostet → lokal** (`pull` + `sync --apply`): Die Anweisungen des Playbooks
  landen in `AGENTS.md`, Remote-Skills in `.agents/skills/` und
  Remote-MCP-Server in `.agents/mcp.json` — dem portablen
  Speicher —, und das Projekt wird über `.agentplaybooks/remote.json`
  verknüpft. Der anschließende Sync verteilt beides auf alle aktivierten
  Plattformziele — unabhängig vom Editor Ihres Teams.

Claude Code liest `CLAUDE.md` und nicht `AGENTS.md`, unterstützt aber
`@`-Importe. Das Ziel `claude` kopiert Ihre Anweisungen daher nicht, sondern
schreibt eine `CLAUDE.md`, die `@AGENTS.md` enthält. Eine einzige Quelle der
Wahrheit — nichts kann auseinanderlaufen. Existiert bereits eine `CLAUDE.md`
ohne diesen Import, meldet `sync` das, statt Ihre Datei zu überschreiben.

Auf einer frischen Maschine ist der portable Speicher das Einzige auf der
Platte, und er ist kein Deployment-Ziel — es würde also nichts geschrieben.
Aktivieren Sie die Tools, die Sie tatsächlich einsetzen:

```bash
apb pull <guid> --apply
apb sync --target=claude,codex --apply
```

Ist kein Ziel aktiviert, listet `sync` außerdem die Agent-Tools auf, die es
für Ihren Benutzer erkennt — so wissen Sie, was Sie übergeben müssen.

OpenAPI-Federation-Server sind eine rein gehostete Fähigkeit ohne lokales
Client-Äquivalent; `pull` meldet sie, statt eine halb übersetzte Konfiguration
zu schreiben. Geheimniswerte bewegen sich in keiner der beiden Richtungen —
siehe unten. Für Self-Hosting nutzen Sie `--url=<base>` oder
`AGENTPLAYBOOKS_URL`.

## Secrets: Kein Klartextwert berührt jemals die Festplatte

```bash
apb secrets login <guid>     # ein auf ein Playbook beschränkter Schlüssel, 0600 gespeichert
apb secrets status           # was benötigt wird vs. im Vault vs. in dieser Shell
pass show deploy/api | apb secrets push DEPLOY_API_KEY
apb secrets run -- npm run deploy
```

- **`status`** gibt ausschließlich Namen und Zustand aus: vom Playbook benötigt,
  im Vault vorhanden, vom Eigentümer als offenlegbar markiert, in Ihrer Shell
  bereits gesetzt. Niemals einen Wert.
- **`push`** nimmt den Wert von stdin oder aus `--from-env=<VAR>` — nie aus einem
  Kommandozeilenargument, denn argv landet in der Shell-History und in der
  Prozessliste. Der Befehl zeigt den Namen, das Ziel-Playbook und die
  Zeichenanzahl und verlangt dann, dass Sie `yes` eintippen. Ein bestehendes
  Geheimnis wird an seiner Stelle rotiert; das Offenlegungs-Flag des Eigentümers,
  die Host-Allowlist, die Kategorie und das Ablaufdatum bleiben unberührt.
- **`run`** holt die deklarierten Geheimnisse in den Speicher, injiziert sie in
  einen einzigen Kindprozess und beendet sich. Nichts wird irgendwohin
  geschrieben. Geheimnisse, die der Eigentümer nicht als offenlegbar markiert
  hat, bleiben im Vault und werden als übersprungen gemeldet.
- Diese Befehle verwenden einen **auf ein Playbook beschränkten** API-Schlüssel
  statt Ihres kontoweiten Schlüssels; damit sind die Zugangsdaten, die Geheimnisse
  erreichen können, auf ein einziges Playbook begrenzt. Mit
  `AGENTPLAYBOOKS_PLAYBOOK_KEY` speichern Sie ihn gar nicht.

Spricht Ihr Agent mit dem gehosteten Playbook als MCP-Server, brauchen Sie davon
nichts: Das Tool `use_secret` lässt die Plattform die Zugangsdaten serverseitig
injizieren, sodass der Wert auch nicht in den Kontext des Agents gelangt.

## Das Playbook trägt den Vertrag, nicht die Zugangsdaten

Ein Playbook benennt, welche Zugangsdaten es braucht; die Werte bleiben dort,
wo sie hingehören. `sync` sammelt jede Umgebungsreferenz, die es in Ihrer
MCP-Konfiguration findet (`${VAR}`, `$VAR`, `env:VAR`), in `spec.secrets`:

```json
"secrets": [
  { "name": "DEPLOY_API_KEY", "ref": "env:DEPLOY_API_KEY", "required": true }
]
```

Das macht das Playbook portabel und selbstbeschreibend: Wer es zieht, weiß
genau, welche Variablen zu setzen sind, ohne dass jemals ein Schlüssel
übertragen wurde. Bearbeiten Sie einen Eintrag — etwa um ihn auf einen Vault
zu richten oder als optional zu markieren —, bleibt Ihre Version beim nächsten
Sync erhalten. Literale Zugangsdaten gelangen nie in das Manifest und werden
nie hochgeladen; `doctor` meldet sie, und `push` verweigert die Ausführung,
bis sie durch Referenzen ersetzt sind.

## Claude-Code- & Claude-Cowork-Plugin

Das CLI-Paket ist zugleich ein Claude-Code-Plugin mit dem
`agentplaybooks`-Skill und den Befehlen `/agentplaybooks:doctor`, `:sync`,
`:pull`, `:push`:

```text
/plugin marketplace add matebenyovszky/agentplaybooks
/plugin install agentplaybooks@agentplaybooks
```

Nach der Installation können Sie Claude z. B. bitten: „prüfe meine
Agent-Konfiguration“ oder „mach meine Claude-Skills in Cursor und ChatGPT
verfügbar“ — der Skill kennt den sicheren Ablauf (erst planen, nach Freigabe
anwenden).

## Weitere Plattformen

- **ChatGPT / Codex**: Skills landen in `.codex/skills/`, MCP-Server in
  `.codex/config.toml` — die Codex-CLI und der Coding-Agent von ChatGPT
  übernehmen sie automatisch.
- **Google Antigravity**: liest Projekt-Skills aus `.agents/skills/` — genau
  dem portablen Speicher von AgentPlaybooks; ein gezogenes Playbook ist ohne
  Zusatzschritt Antigravity-bereit.
- **Hermes Agent**: hat keinen projektbezogenen Speicher, daher schreibt der
  Adapter nach `~/.hermes/skills/` (im Plan als Home-Pfad sichtbar); Hermes
  liest zudem `AGENTS.md`-Anweisungen nativ.
- **Cursor**: Skills in `.cursor/skills/`, MCP-Server in `.cursor/mcp.json`.
