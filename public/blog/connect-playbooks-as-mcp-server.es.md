---
title: Conecta cualquier playbook como servidor MCP — Cursor, Claude y más allá
description: Guía paso a paso para conectar AgentPlaybooks a Cursor IDE, Claude Desktop, Claude Code y otras herramientas compatibles con MCP. Una URL: copias y pegas la configuración y tienes herramientas de IA al instante.
date: 2026-04-05
author: Mate Benyovszky
---

# Conecta cualquier playbook como servidor MCP

Cada playbook en AgentPlaybooks es también un **servidor MCP (Model Context Protocol)** en vivo. Eso significa que puedes enchufarlo directamente en Cursor, Claude Desktop, Claude Code o cualquier cliente compatible con MCP — y tu agente de IA obtiene al instante acceso a las herramientas, la memoria, el canvas y las personas del playbook.

Hoy lo hacemos aún más fácil con una nueva pestaña **Integraciones** en el dashboard del playbook y documentación actualizada con la configuración de Cursor IDE en primer plano.

## Actualización (octubre de 2026): tres formas de entrar

Desde que se escribió este artículo, un playbook es accesible de tres maneras.
Elige según el *alcance* y el *cliente*:

| Quieres | Usa | Autenticación |
|---|---|---|
| **Toda tu cuenta** — todos los playbooks, incluido crearlos y gestionarlos desde el agente | `https://apbks.com/api/mcp/manage` | Inicio de sesión OAuth (el cliente abre una pantalla de consentimiento) o una user API key |
| **Un solo playbook** — exactamente sus herramientas, memoria y skills | `https://apbks.com/api/mcp/YOUR_GUID` | Una playbook API key — ninguna para leer un playbook público |
| **Scripts y agentes que ejecutan código** — sin MCP | `https://apbks.com/api/mcp/YOUR_GUID/llms.txt` | La misma playbook API key |

**Endpoint de cuenta.** Una sola conexión cubre todos los playbooks a los que
tienes acceso; las herramientas reciben un argumento `playbook_id`. Es un recurso
protegido OAuth 2.1 real, así que en el diálogo *Add custom connector* de Claude
elige **Always required** e inicia sesión — sin clave que copiar. La automatización
sin interfaz puede enviar una user API key en su lugar.

**Endpoint de playbook.** Ligado a un único playbook por su URL y autenticado con
una playbook API key. La clave puede ir en `Authorization` (con o sin el prefijo
`Bearer `) o en `X-API-Key`, útil cuando un cliente reserva `Authorization` para
sí mismo. Añade `?toolset=runtime` (o `memory`, `admin`) para anunciar menos
herramientas; en una conexión sin fijar, el agente sigue alcanzando todo a través
de `find_tools`.

**Scripts.** Algunos agentes escriben código en lugar de llamar herramientas una a
una, y algunos no pueden llamar herramientas MCP desde sus scripts. Para ellos,
`llms.txt` es una única descarga que explica la autenticación y la convención de
un solo POST (`POST .../tools/TOOL_NAME` con argumentos JSON), y da a cada
herramienta un ejemplo one-shot; después el agente encadena tantas llamadas como
necesite en un script, manteniendo los resultados intermedios fuera de su
contexto.

La pestaña **Integraciones** del dashboard ahora muestra las tres, cada una con
su botón de copiar.

## ¿Qué es MCP?

El [Model Context Protocol](https://modelcontextprotocol.io/) es un estándar abierto (desarrollado originalmente por Anthropic) que permite a los asistentes de IA conectarse a herramientas y fuentes de datos externas mediante una interfaz JSON-RPC sencilla. Piensa en él como un sistema universal de plugins para la IA.

AgentPlaybooks implementa la especificación del servidor MCP para cada playbook. Tus skills pasan a ser herramientas invocables, tu memoria a estado legible/escribible y tus personas aportan contexto de prompt de sistema — todo a través de un único endpoint HTTP.

## La nueva pestaña Integraciones

Hemos reorganizado el editor del playbook. La antigua pestaña "Claves API" ahora se llama **Integraciones** e incluye todo lo que necesitas para conectar tu playbook a plataformas externas:

1. **Connect as MCP Server** — Configuraciones JSON listas para copiar para Cursor, Claude Desktop y Claude Code. Las configs vienen rellenadas con el GUID y el nombre de tu playbook.
2. **Use with AI Platforms** — Botones de acción rápida (Open in Claude, Open in ChatGPT, export as ZIP) más referencia del endpoint API.
3. **Platform Cards** — Enlaces de un clic a guías paso a paso para Cursor, ChatGPT, Claude, Gemini, Claude Code e integración API genérica.
4. **Claves API** — Genera y gestiona claves de autenticación para acceso de escritura.

## Conectar con Cursor IDE

Cursor tiene soporte MCP nativo. Así se conecta:

### 1. Abre la pestaña Integraciones

Ve a tu playbook en el dashboard y haz clic en la pestaña **Integraciones** (el icono de puzzle).

### 2. Copia la config de Cursor

Verás un bloque JSON listo para copiar. Se parece a esto:

```json
{
  "mcpServers": {
    "apb-my-assistant": {
      "url": "https://apbks.com/api/mcp/YOUR_GUID"
    }
  }
}
```

### 3. Pégalo en la configuración de Cursor

Guarda el JSON en uno de estos sitios:
- **A nivel de proyecto**: `.cursor/mcp.json` en la raíz del proyecto
- **Global**: `~/.cursor/mcp.json` para todos los proyectos

### 4. Reinicia y verifica

Reinicia Cursor (o recarga la ventana). Las herramientas de tu playbook aparecerán en el panel de herramientas MCP de Cursor.

## Conectar con Claude Desktop

```json
{
  "mcpServers": {
    "apb-my-assistant": {
      "transport": "http",
      "url": "https://apbks.com/api/mcp/YOUR_GUID"
    }
  }
}
```

Guarda esto en tu `claude_desktop_config.json` y reinicia Claude Desktop.

## Conectar con Claude Code

Un solo comando:

```bash
claude mcp add apb-my-assistant https://apbks.com/api/mcp/YOUR_GUID --transport http
```

Verifica con `claude mcp list`.

## Autenticación

Los **playbooks públicos** no requieren autenticación para acceso de lectura. Cualquiera puede conectarse y usar las herramientas.

Los **playbooks privados** necesitan una API key. Genera una desde la pestaña Integraciones y añádela a tu config:

```json
{
  "mcpServers": {
    "my-playbook": {
      "url": "https://apbks.com/api/mcp/YOUR_GUID",
      "headers": {
        "Authorization": "Bearer apb_live_your_key_here"
      }
    }
  }
}
```

La **escritura de vuelta** (guardar en memoria o canvas) siempre requiere una API key, incluso en playbooks públicos. Las claves tienen tres roles:
- **Viewer** — Solo lectura
- **Coworker** — Lectura + escritura
- **Admin** — Acceso completo

## Qué obtiene tu agente de IA

Una vez conectado, tu agente de IA tiene acceso a:

| Componente | Capacidad MCP |
|---|---|
| **Skills** | Herramientas invocables con esquemas de entrada definidos |
| **Memory** | Almacén clave-valor persistente de lectura/escritura/búsqueda |
| **Canvas** | Documentos markdown estructurados de lectura/escritura |
| **Personas** | Prompt de sistema y contexto de personalidad |
| **Secrets** | Proxy de credenciales en el servidor (los valores nunca se exponen) |

Las herramientas integradas incluyen `read_memory`, `write_memory`, `search_memory`, `read_canvas`, `write_canvas`, `patch_canvas_section`, `get_canvas_toc`, `list_secrets`, `use_secret`, y más.

## Probar tu conexión

Desde la pestaña Integraciones, copia el comando de prueba:

```bash
curl -s https://apbks.com/api/mcp/YOUR_GUID | head -c 200
```

Si ves JSON con `protocolVersion` y `serverInfo`, todo está bien.

## Qué viene después

- **Cursor Marketplace** — Estamos trabajando en listar AgentPlaybooks en el marketplace de extensiones/MCP de Cursor
- **Windsurf** y otros IDE compatibles con MCP — El mismo endpoint funciona en todas partes
- **Management MCP Server** — Disponible: consulta el endpoint de cuenta con inicio de sesión OAuth en *Actualización (octubre de 2026)*, más arriba

Consulta la [documentación de integración MCP](/docs/mcp-integration) y la [guía de integraciones de plataforma](/docs/platform-integrations) para la referencia completa.

---

*AgentPlaybooks — La memoria y el kit de herramientas universal de tu IA. Un playbook, todas las plataformas.*
