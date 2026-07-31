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

`MCP_SECRET_ENCRYPTION_KEY` muss ein zufälliger Wert mit mindestens 32 Zeichen sein. Danach `supabase/migrations/20260730_federated_mcp_proxy.sql` anwenden. Secret-Klartext wird nur beim Schreiben angenommen, mit AES-GCM gespeichert und nie zurückgegeben.

`access: "public"` kann Upstream-Kosten öffentlich auslösbar machen. Empfohlen ist `playbook_api_key`; der Client benötigt dann `tools:call` oder `full`.

Eigentümer lesen den Metadaten-Auditverlauf über `GET /api/mcp/audit/PLAYBOOK_GUID?limit=100` mit einer Sitzung oder einem User-API-Key mit `playbooks:read`.
