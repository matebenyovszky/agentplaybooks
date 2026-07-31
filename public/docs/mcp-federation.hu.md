# Federált MCP- és OpenAPI-eszközök

Az AgentPlaybooks a külső MCP- vagy OpenAPI-kapcsolatot magában a playbookban tárolja, majd a playbook egyetlen élő MCP-végpontján keresztül teszi elérhetővé:

```text
https://agentplaybooks.ai/api/mcp/PLAYBOOK_GUID
```

A végpont élőben felderíti az upstream eszközöket, `ext__SERVER_ID__TOOL` névtérbe helyezi őket, és a hívást a megfelelő szerverhez proxyzza. Az MCP-erőforrások visszafejthető `mcp-proxy://` URI-t kapnak.

## Támogatott kapcsolatok

- MCP Streamable HTTP JSON- vagy SSE-válasszal
- Beágyazott vagy `spec_url` címről betöltött OpenAPI 3.x leírás
- Bearer token, API-kulcs és OAuth 2.0 client credentials
- 100 ms és 60 másodperc közötti timeout
- Opcionális playbook API-kulcsos hozzáférés
- AES-GCM-mel titkosított secret-tárolás
- Auditlog művelettel, céllal, státusszal, késleltetéssel, hibakóddal és request ID-val

A privát, loopback, link-local, `.local` és `.internal` célok tiltottak. Alapértelmezetten csak HTTPS engedélyezett.

## MCP-konfiguráció OAuth-val

Az **MCP Servers → Connection** részen:

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

Az **Encrypted secrets** mezőbe külön kerüljön:

```json
{ "client_secret": "titkos-ertek" }
```

Bearer hitelesítésnél `token_secret`, API-kulcsnál `header`, `prefix` és `api_key_secret` használható.

## OpenAPI-konfiguráció

```json
{
  "spec_url": "https://api.example.com/openapi.json",
  "base_url": "https://api.example.com/v1/",
  "timeout_ms": 10000,
  "access": "playbook_api_key",
  "auth": { "type": "api_key", "header": "X-API-Key", "api_key_secret": "api_key" }
}
```

Minden OpenAPI `operationId` namespacelt MCP-eszközzé válik. A path/query/header paraméterek a tool argumentumaiból, a JSON request body a `body` argumentumból készül.

## Hívási szemantika

A `tools/list` a beépített playbookműveleteket és a federált eszközöket listázza. A skillek utasítások: a `list_skills` és `get_skill` művelettel olvashatók, nem jelennek meg hamis végrehajtható toolként. Ugyanezek az eszközök a generált OpenAPI export `POST /api/mcp/PLAYBOOK_GUID/tools/TOOL_NAME` útvonalán is hívhatók.

## Telepítés és biztonság

Állíts be legalább 32 karakteres, véletlen `MCP_SECRET_ENCRYPTION_KEY` értéket, és futtasd a `supabase/migrations/20260730_federated_mcp_proxy.sql` migrációt. A secret plaintext csak íráskor érkezik be, AES-GCM-mel titkosítva tárolódik, és az API soha nem adja vissza.

Az `access: "public"` upstream költséget tehet nyilvánosan elérhetővé. Javasolt a `playbook_api_key`; ehhez a kliensnek `tools:call` vagy `full` jogosultságú playbookkulcs kell.

A tulajdonos a metaadat-alapú hívástörténetet a `GET /api/mcp/audit/PLAYBOOK_GUID?limit=100` végponton olvashatja munkamenettel vagy `playbooks:read` jogosultságú felhasználói API-kulccsal.
