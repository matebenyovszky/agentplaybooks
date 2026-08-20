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

### Cómo se resuelven los nombres de secretos

El nombre en `token_secret`, `api_key_secret` o `client_secret` es una **referencia** que se resuelve en el momento de la llamada en dos pasos:

1. **Los Encrypted secrets propios del servidor** — si el nombre está definido ahí, ese valor gana.
2. **El vault de Secrets del playbook** — el mismo almacén que usan la herramienta `use_secret` y la pestaña Secrets, con coincidencia exacta de nombre.

Así, una credencial solo necesita existir una vez: guardar `SEARCH_TOKEN` en la pestaña Secrets, configurar `"auth": {"type": "bearer", "token_secret": "SEARCH_TOKEN"}` en cualquier número de servidores, y todos lo resuelven desde el vault — el editor de servidores autocompleta los nombres del vault y muestra de dónde vendrá cada nombre referenciado. El almacén por servidor sigue siendo útil como override, o para una credencial que nunca deba ser accesible por nombre desde otros servidores.

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

Configurar `MCP_SECRET_ENCRYPTION_KEY` con un valor aleatorio de al menos 32 caracteres —preferiblemente una cadena hexadecimal de 64 caracteres, porque el valor se usa como material de clave en bruto en vez de hashearse— y aplicar `supabase/migrations/20260730_federated_mcp_proxy.sql`. El secreto en claro solo se acepta al escribir, se cifra con AES-256-GCM y nunca se devuelve.

Las credenciales de cada servidor se cifran con una clave derivada de ese valor mediante HKDF, usando el id del servidor como salt, y ese id se autentica como parte del texto cifrado. Por eso el material de clave de un servidor no puede descifrar la carga de otro, y una carga copiada a la fila de otro servidor no se descifra en absoluto. Las filas escritas antes de este cambio (sin el prefijo `v2:`) siguen siendo legibles y se actualizan la próxima vez que se guardan los secretos de ese servidor.

`access: "public"` puede permitir que cualquiera genere costes upstream. Se recomienda `playbook_api_key`; el cliente necesita permiso `tools:call` o `full`.

El propietario puede consultar el historial de auditoría en `GET /api/playbooks/PLAYBOOK_GUID/audit?limit=100` (el anterior `GET /api/mcp/audit/PLAYBOOK_GUID` sigue respondiendo igual) con una sesión o una API key de usuario con permiso `playbooks:read`.
