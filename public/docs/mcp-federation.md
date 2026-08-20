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

## Starting from a template

`GET /api/connections` returns a curated catalogue of connection templates, so
adding a well-known service is picking a name rather than writing transport JSON
from scratch. Filter with `?category=` or fetch one with `?id=`.

A template is not a credential. Every entry references its secrets **by name**
and expects those names on the playbook's Secrets tab — the same resolution a
federated call uses at runtime. The endpoint is public because there is nothing
in it to protect.

Each entry carries:

| Field | Meaning |
|---|---|
| `transport_type`, `transport_config` | Paste-ready, with secret *names* in the auth block |
| `secrets[]` | Every name the config references, with where to get the value |
| `placeholders[]` | Values you must fill in first, such as a project ref |
| `requiresConsent` | True when the credential needs a one-time OAuth consent |
| `source` | `live-config` if taken from a server already working in production, `provider-docs` otherwise |

The catalogue is checked against the real resolver in CI: a template cannot
declare a secret federation would never look up, or reference one it forgot to
document. That is what keeps the data from rotting quietly.

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

Store the sensitive value on the playbook's **Secrets** tab under the name the
config references — here `client_secret` — and it resolves at call time. The
value never appears in the transport config.

### User-scoped APIs: `oauth2_refresh_token`

`client_credentials` covers machine-to-machine APIs. Services that act *as a
user* — Gmail, LinkedIn, X, Facebook — need a token obtained with that user's
consent, and consent needs a browser redirect and a callback URL that a playbook
has nowhere to host.

The way through is that consent is a **one-time** step. Obtain a refresh token
out of band, store it in the vault, and renewal from then on is an ordinary POST
that federation makes for you:

```json
{
  "url": "https://gmail.example.com/mcp",
  "auth": {
    "type": "oauth2_refresh_token",
    "token_url": "https://oauth2.googleapis.com/token",
    "client_id": "your-app.apps.googleusercontent.com",
    "client_secret": "GOOGLE_CLIENT_SECRET",
    "refresh_token_secret": "GMAIL_REFRESH_TOKEN"
  }
}
```

`refresh_token_secret` and `client_secret` are **secret names**, not values;
store both on the Secrets tab. A public client using PKCE has no client secret —
omit `client_secret` and only the refresh token is required.

Access tokens are cached until shortly before they expire. Because some
providers rotate the refresh token on each use, the cache key includes a digest
of the token rather than the token itself, so a renewed token cannot read a stale
entry. If the named secret is absent, the error names it (`Missing secret:
GMAIL_REFRESH_TOKEN`) instead of failing as a generic upstream error.

For bearer auth use `{"type":"bearer","token_secret":"token"}` and store `{"token":"..."}`. For an API key, configure `type`, `header`, `prefix`, and `api_key_secret`.

### How secret names resolve

The name in `token_secret`, `api_key_secret`, or `client_secret` is a **reference**, not a value. At call time it is matched by exact name against the playbook's Secrets vault — the same store the `use_secret` tool and the Secrets tab use. There is no second place to look: a per-server store existed once and was removed, because it kept the credentials most worth stealing under weaker crypto than the vault, with no rotation, expiry, or audit trail.

A credential therefore only needs to exist once. Store `SEARCH_TOKEN` on the Secrets tab, set `"auth": {"type": "bearer", "token_secret": "SEARCH_TOKEN"}` on any number of servers, and they all resolve it from the vault — the server editor autocompletes vault names and shows where each referenced name will come from.

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

Store the credential on the playbook's **Secrets** tab, then reference it by name from the server's transport config (`auth.token_secret`, `auth.api_key_secret`, `auth.client_secret`). There is no separate MCP secret store and no separate encryption key: the vault holds it, encrypted with AES-256-GCM under a per-owner derived key, and never returns the plaintext. A secret's `allowed_hosts` list, if set, is enforced against every destination the server config can reach.

`access: "public"` allows anyone who can access the public playbook to incur upstream calls. Omitted access and `playbook_api_key` both require a playbook key with `tools:call` or `full` permission.

Owners can inspect metadata-only call history at `GET /api/playbooks/PLAYBOOK_GUID/audit?limit=100` (the earlier `GET /api/mcp/audit/PLAYBOOK_GUID` still answers the same) using their session or a user API key with `playbooks:read`.
