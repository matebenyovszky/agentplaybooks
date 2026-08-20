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

### How secret names resolve

The name in `token_secret`, `api_key_secret`, or `client_secret` is a **reference**, resolved at call time in two steps:

1. **This server's own Encrypted secrets** — when the name is defined there, that value wins.
2. **The playbook's Secrets vault** — the same store the `use_secret` tool and the Secrets tab use, matched by exact name.

So a credential only needs to exist once. Store `SEARCH_TOKEN` on the Secrets tab, set `"auth": {"type": "bearer", "token_secret": "SEARCH_TOKEN"}` on any number of servers, and they all resolve it from the vault — the server editor autocompletes vault names and shows where each referenced name will come from. The per-server store remains useful as an override, or for a credential that should never be reachable by name from other servers.

Vault resolution is proxy-style use: the decrypted value is injected into the outbound request server-side and is never returned to the caller, so it works regardless of the secret's reveal flag — exactly like `use_secret`. If the vault secret declares `allowed_hosts`, that list is enforced against every destination in the server's transport config (`url`, `spec_url`, `base_url`); a pinned-elsewhere secret stays unresolved and the call fails with `MISSING_SECRET` naming it, rather than sending the credential somewhere its owner excluded.

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

Set `MCP_SECRET_ENCRYPTION_KEY` to a random value of at least 32 characters — a 64-character hex string is preferred, because it is used as raw key material instead of being hashed. Apply `supabase/migrations/20260730_federated_mcp_proxy.sql`. Secret plaintext is accepted only on write, encrypted with AES-256-GCM, and never returned by the API.

Each server's credentials are encrypted with a key derived from that value via HKDF, salted with the server's id, and the id is authenticated as part of the ciphertext. One server's key material therefore cannot decrypt another's payload, and a payload copied into a different server row will not decrypt at all. Rows written before this change (no `v2:` prefix) are still readable and are upgraded the next time that server's secrets are saved.

`access: "public"` allows anyone who can access the public playbook to incur upstream calls. Omitted access and `playbook_api_key` both require a playbook key with `tools:call` or `full` permission.

Owners can inspect metadata-only call history at `GET /api/playbooks/PLAYBOOK_GUID/audit?limit=100` (the earlier `GET /api/mcp/audit/PLAYBOOK_GUID` still answers the same) using their session or a user API key with `playbooks:read`.
