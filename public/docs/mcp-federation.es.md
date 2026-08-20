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

`client_secret` también es un **nombre de secreto**, no un valor: guarda el valor con ese mismo nombre en la pestaña Secrets del playbook.

```json
{ "client_secret": "valor-secreto" }
```

Bearer usa `token_secret`; una API key usa `header`, `prefix` y `api_key_secret`.

### Cómo se resuelven los nombres de secretos

El nombre en `token_secret`, `api_key_secret` o `client_secret` es una **referencia**, no un valor. En el momento de la llamada se resuelve por coincidencia exacta de nombre contra el **vault de Secrets del playbook**, el mismo almacén que usan la herramienta `use_secret` y la pestaña Secrets. No hay un segundo lugar donde buscar: existió un almacén por servidor y se eliminó, porque guardaba las credenciales más valiosas con criptografía más débil que la del vault, sin rotación, caducidad ni registro de auditoría.

Así, una credencial solo necesita existir una vez: guardar `SEARCH_TOKEN` en la pestaña Secrets, configurar `"auth": {"type": "bearer", "token_secret": "SEARCH_TOKEN"}` en cualquier número de servidores, y todos lo resuelven desde el vault — el editor de servidores autocompleta los nombres del vault y muestra de dónde vendrá cada nombre referenciado.

La resolución desde el vault es un uso de tipo proxy: el valor descifrado se inyecta del lado del servidor en la petición saliente y nunca se devuelve al llamante, por lo que funciona con independencia del flag de reveal del secreto — exactamente igual que `use_secret`. Si el secreto del vault declara `allowed_hosts`, esa lista se aplica a cada destino de la configuración de transporte del servidor (`url`, `spec_url`, `base_url`); un secreto fijado a otros hosts queda sin resolver y la llamada falla con `MISSING_SECRET` indicando su nombre, en lugar de enviar la credencial a un destino que su propietario excluyó.

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

Guarda la credencial en la pestaña **Secrets** del playbook y referénciala por nombre desde la configuración de transporte del servidor (`auth.token_secret`, `auth.api_key_secret`, `auth.client_secret`). No hay un almacén de secretos de MCP aparte ni una clave de cifrado aparte: el vault lo guarda, cifrado con AES-256-GCM bajo una clave derivada por propietario, y nunca devuelve el texto en claro. La lista `allowed_hosts` de un secreto, si está definida, se aplica a todo destino que la configuración del servidor pueda alcanzar.

`access: "public"` puede permitir que cualquiera genere costes upstream. Se recomienda `playbook_api_key`; el cliente necesita permiso `tools:call` o `full`.

El propietario puede consultar el historial de auditoría en `GET /api/playbooks/PLAYBOOK_GUID/audit?limit=100` (el anterior `GET /api/mcp/audit/PLAYBOOK_GUID` sigue respondiendo igual) con una sesión o una API key de usuario con permiso `playbooks:read`.
