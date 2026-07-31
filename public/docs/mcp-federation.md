# Federated MCP & OpenAPI Tools

AgentPlaybooks can store an external MCP or OpenAPI connection inside a playbook and expose it through the playbook's live MCP endpoint. An agent configures only:

```text
https://agentplaybooks.ai/api/mcp/PLAYBOOK_GUID
```

The endpoint discovers upstream tools, namespaces them as `ext__SERVER_ID__TOOL`, and proxies calls to the correct upstream. MCP resources use reversible `mcp-proxy://` URIs.

## Supported connections

- MCP Streamable HTTP with JSON or SSE responses
- OpenAPI 3.x specifications embedded in the playbook or loaded from `spec_url`
- Bearer token and API-key authentication
- OAuth 2.0 client credentials with token caching
- Configurable timeouts from 100 ms to 60 seconds
- Optional playbook API-key access control
- AES-GCM encrypted secret storage
- Metadata-only audit logs (operation, target, status, latency, error code, request ID)

Private, loopback, link-local, `.local`, and `.internal` targets are blocked. HTTPS is required unless `allow_insecure_http` is explicitly enabled for development.

## MCP configuration

Select **MCP Servers → Connection → MCP Streamable HTTP**:

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

Save the sensitive value separately in **Encrypted secrets**:

```json
{ "client_secret": "replace-me" }
```

For bearer auth use `{"type":"bearer","token_secret":"token"}` and store `{"token":"..."}`. For an API key, configure `type`, `header`, `prefix`, and `api_key_secret`.

## OpenAPI configuration

```json
{
  "spec_url": "https://api.example.com/openapi.json",
  "base_url": "https://api.example.com/v1/",
  "timeout_ms": 10000,
  "access": "playbook_api_key",
  "auth": {
    "type": "api_key",
    "header": "X-API-Key",
    "api_key_secret": "api_key"
  }
}
```

Every OpenAPI `operationId` becomes a namespaced MCP tool. Path, query, and header parameters are mapped from tool arguments; JSON request bodies use the `body` argument.

## Discovery and calls

`tools/list` returns built-in playbook tools plus live federated tools. Skills remain instructional resources and are read with `list_skills` and `get_skill`; they are not advertised as fake executable tools.

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "ext__SERVER_ID__search",
    "arguments": { "query": "federated MCP" }
  }
}
```

The generated OpenAPI export exposes the same operation at `POST /api/mcp/PLAYBOOK_GUID/tools/TOOL_NAME`.

## Secrets and deployment

Set `MCP_SECRET_ENCRYPTION_KEY` to a random value of at least 32 characters. Apply `supabase/migrations/20260730_federated_mcp_proxy.sql`. Secret plaintext is accepted only on write, encrypted with AES-GCM, and never returned by the API.

`access: "public"` allows anyone who can access the public playbook to incur upstream calls. Omitted access and `playbook_api_key` both require a playbook key with `tools:call` or `full` permission.

Owners can inspect metadata-only call history at `GET /api/mcp/audit/PLAYBOOK_GUID?limit=100` using their session or a user API key with `playbooks:read`.
