# Herramientas MCP y OpenAPI federadas

AgentPlaybooks guarda conexiones MCP u OpenAPI externas dentro del playbook y las publica mediante un único endpoint MCP activo:

```text
https://agentplaybooks.ai/api/mcp/PLAYBOOK_GUID
```

El endpoint descubre herramientas upstream, les asigna el espacio `ext__SERVER_ID__TOOL` y reenvía cada llamada al servidor correcto. Los recursos MCP usan URI reversibles `mcp-proxy://`.

## Funciones compatibles

- MCP Streamable HTTP con respuestas JSON o SSE
- OpenAPI 3.x embebido o cargado mediante `spec_url`
- Bearer token, API key y OAuth 2.0 client credentials
- Timeout entre 100 ms y 60 segundos
- Control de acceso opcional con API key del playbook
- Secretos cifrados con AES-GCM
- Auditoría de operación, destino, estado, latencia, código de error y request ID

Se bloquean destinos privados, loopback, link-local, `.local` e `.internal`. HTTPS es obligatorio por defecto.

## Configuración MCP con OAuth

En **MCP Servers → Connection**:

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

Guardar por separado en **Encrypted secrets**:

```json
{ "client_secret": "valor-secreto" }
```

Bearer usa `token_secret`; una API key usa `header`, `prefix` y `api_key_secret`.

## Configuración OpenAPI

```json
{
  "spec_url": "https://api.example.com/openapi.json",
  "base_url": "https://api.example.com/v1/",
  "timeout_ms": 10000,
  "access": "playbook_api_key",
  "auth": { "type": "api_key", "header": "X-API-Key", "api_key_secret": "api_key" }
}
```

Cada `operationId` de OpenAPI se convierte en una herramienta MCP con namespace. Los parámetros path/query/header provienen de los argumentos; el body JSON usa el argumento `body`.

## Semántica de llamadas

`tools/list` devuelve operaciones internas del playbook y herramientas federadas. Las skills son instrucciones que se leen con `list_skills` y `get_skill`; no se anuncian como herramientas ejecutables falsas. La exportación OpenAPI ofrece las mismas herramientas en `POST /api/mcp/PLAYBOOK_GUID/tools/TOOL_NAME`.

## Despliegue y seguridad

Configurar `MCP_SECRET_ENCRYPTION_KEY` con un valor aleatorio de al menos 32 caracteres y aplicar `supabase/migrations/20260730_federated_mcp_proxy.sql`. El secreto en claro solo se acepta al escribir, se cifra con AES-GCM y nunca se devuelve.

`access: "public"` puede permitir que cualquiera genere costes upstream. Se recomienda `playbook_api_key`; el cliente necesita permiso `tools:call` o `full`.

El propietario puede consultar el historial de auditoría en `GET /api/mcp/audit/PLAYBOOK_GUID?limit=100` con una sesión o una API key de usuario con permiso `playbooks:read`.
