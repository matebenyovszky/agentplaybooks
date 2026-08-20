# Föderierte MCP- und OpenAPI-Werkzeuge

AgentPlaybooks speichert externe MCP- oder OpenAPI-Verbindungen im Playbook und stellt sie über einen einzigen Live-MCP-Endpunkt bereit:

```text
https://agentplaybooks.ai/api/mcp/PLAYBOOK_GUID
```

Der Endpunkt entdeckt Upstream-Werkzeuge, versieht sie mit `ext__SERVER_ID__TOOL` und leitet Aufrufe an den richtigen Server weiter. MCP-Ressourcen erhalten reversible `mcp-proxy://`-URIs.

## Unterstützte Funktionen

- MCP Streamable HTTP mit JSON- oder SSE-Antworten
- Eingebettete oder über `spec_url` geladene OpenAPI-3.x-Spezifikationen
- Bearer-Token, API-Key und OAuth 2.0 Client Credentials
- Timeout zwischen 100 ms und 60 Sekunden
- Optionale Zugriffskontrolle per Playbook-API-Key
- AES-GCM-verschlüsselte Secrets
- Auditlogs für Operation, Ziel, Status, Latenz, Fehlercode und Request-ID

Private, Loopback-, Link-Local-, `.local`- und `.internal`-Ziele sind gesperrt. Standardmäßig ist HTTPS erforderlich.

## MCP-Konfiguration mit OAuth

Unter **MCP Servers → Connection**:

```json
{
  "url": "https://research.example.com/mcp",
  "timeout_ms": 15000,
  "access": "playbook_api_key",
  "auth": {
    "type": "oauth2_client_credentials",
    "token_url": "https://research.example.com/oauth/token",
    "client_id": "agentplaybooks",
    "client_secret": "client_secret",
    "scopes": ["tools:read", "tools:call"]
  }
}
```

Unter **Encrypted secrets** separat speichern:

```json
{ "client_secret": "geheimer-wert" }
```

Bearer-Authentifizierung verwendet `token_secret`; API-Keys verwenden `header`, `prefix` und `api_key_secret`.

### Wie Secret-Namen aufgelöst werden

Der Name in `token_secret`, `api_key_secret` oder `client_secret` ist eine **Referenz**, die zur Aufrufzeit in zwei Schritten aufgelöst wird:

1. **Die eigenen Encrypted secrets des Servers** — ist der Name dort definiert, gewinnt dieser Wert.
2. **Der Secrets-Vault des Playbooks** — derselbe Speicher, den auch das Tool `use_secret` und der Secrets-Tab verwenden, abgeglichen über den exakten Namen.

Ein Zugangsdatum muss so nur einmal existieren: Speichern Sie `SEARCH_TOKEN` im Secrets-Tab, setzen Sie `"auth": {"type": "bearer", "token_secret": "SEARCH_TOKEN"}` auf beliebig vielen Servern, und alle lösen es aus dem Vault auf — der Server-Editor vervollständigt Vault-Namen automatisch und zeigt an, woher jeder referenzierte Name kommen wird. Der Speicher pro Server bleibt als Override nützlich, oder für Zugangsdaten, die von anderen Servern niemals per Name erreichbar sein sollen.

Die Auflösung aus dem Vault ist eine Proxy-Nutzung: Der entschlüsselte Wert wird serverseitig in die ausgehende Anfrage injiziert und nie an den Aufrufer zurückgegeben; sie funktioniert daher unabhängig vom Reveal-Flag des Secrets — genau wie `use_secret`. Deklariert das Vault-Secret `allowed_hosts`, wird diese Liste gegen jedes Ziel in der Transportkonfiguration des Servers durchgesetzt (`url`, `spec_url`, `base_url`); ein anderswo gepinntes Secret bleibt unaufgelöst, und der Aufruf schlägt mit `MISSING_SECRET` unter Nennung des Namens fehl, statt die Zugangsdaten an ein Ziel zu senden, das ihr Besitzer ausgeschlossen hat.

## OpenAPI-Konfiguration

```json
{
  "spec_url": "https://api.example.com/openapi.json",
  "base_url": "https://api.example.com/v1/",
  "timeout_ms": 10000,
  "access": "playbook_api_key",
  "auth": { "type": "api_key", "header": "X-API-Key", "api_key_secret": "api_key" }
}
```

Jede OpenAPI-`operationId` wird zu einem namespaced MCP-Tool. Path-, Query- und Header-Parameter kommen aus den Tool-Argumenten; JSON-Bodies aus dem Argument `body`.

## Aufrufsemantik

`tools/list` liefert eingebaute Playbook-Operationen und föderierte Werkzeuge. Skills sind Anweisungen und werden über `list_skills` und `get_skill` gelesen; sie werden nicht als unechte ausführbare Tools veröffentlicht. Die generierte OpenAPI-Ausgabe stellt dieselben Tools unter `POST /api/mcp/PLAYBOOK_GUID/tools/TOOL_NAME` bereit.

## Bereitstellung und Sicherheit

`MCP_SECRET_ENCRYPTION_KEY` muss ein zufälliger Wert mit mindestens 32 Zeichen sein – vorzugsweise eine 64 Zeichen lange Hex-Zeichenkette, da der Wert als rohes Schlüsselmaterial und nicht gehasht verwendet wird. Danach `supabase/migrations/20260730_federated_mcp_proxy.sql` anwenden. Secret-Klartext wird nur beim Schreiben angenommen, mit AES-256-GCM gespeichert und nie zurückgegeben.

Die Zugangsdaten jedes Servers werden mit einem Schlüssel verschlüsselt, der über HKDF aus diesem Wert abgeleitet und mit der Server-ID gesalzen wird; die ID ist als Teil des Chiffrats authentifiziert. Das Schlüsselmaterial eines Servers kann daher die Daten eines anderen Servers nicht entschlüsseln, und ein in eine andere Serverzeile kopiertes Chiffrat lässt sich überhaupt nicht entschlüsseln. Vor dieser Änderung geschriebene Zeilen (ohne `v2:`-Präfix) bleiben lesbar und werden beim nächsten Speichern der Secrets des betreffenden Servers aktualisiert.

`access: "public"` kann Upstream-Kosten öffentlich auslösbar machen. Empfohlen ist `playbook_api_key`; der Client benötigt dann `tools:call` oder `full`.

Eigentümer lesen den Metadaten-Auditverlauf über `GET /api/playbooks/PLAYBOOK_GUID/audit?limit=100` (der frühere `GET /api/mcp/audit/PLAYBOOK_GUID` antwortet weiterhin gleich) mit einer Sitzung oder einem User-API-Key mit `playbooks:read`.
