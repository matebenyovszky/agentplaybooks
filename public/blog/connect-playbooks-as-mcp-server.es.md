---
title: Conecta cualquier playbook como servidor MCP — Cursor, Claude y más allá
description: Guía paso a paso para conectar AgentPlaybooks a Cursor IDE, Claude Desktop, Claude Code y otras herramientas compatibles con MCP. Una URL: copias y pegas la configuración y tienes herramientas de IA al instante.
date: 2026-04-05
author: Mate Benyovszky
---

# Conecta cualquier playbook como servidor MCP

Cada playbook en AgentPlaybooks es también un **servidor MCP (Model Context Protocol)** en vivo. Eso significa que puedes enchufarlo directamente en Cursor, Claude Desktop, Claude Code o cualquier cliente compatible con MCP — y tu agente de IA obtiene al instante acceso a las herramientas, la memoria, el canvas y las personas del playbook.

Hoy lo hacemos aún más fácil con una nueva pestaña **Integraciones** en el dashboard del playbook y documentación actualizada con la configuración de Cursor IDE en primer plano.

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
    "agentplaybooks-my-assistant": {
      "url": "https://agentplaybooks.ai/api/mcp/YOUR_GUID"
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
    "agentplaybooks-my-assistant": {
      "transport": "http",
      "url": "https://agentplaybooks.ai/api/mcp/YOUR_GUID"
    }
  }
}
```

Guarda esto en tu `claude_desktop_config.json` y reinicia Claude Desktop.

## Conectar con Claude Code

Un solo comando:

```bash
claude mcp add agentplaybooks-my-assistant https://agentplaybooks.ai/api/mcp/YOUR_GUID --transport http
```

Verifica con `claude mcp list`.

## Autenticación

Los **playbooks públicos** no requieren autenticación para acceso de lectura. Cualquiera puede conectarse y usar las herramientas.

Los **playbooks privados** necesitan una API key. Genera una desde la pestaña Integraciones y añádela a tu config:

```json
{
  "mcpServers": {
    "my-playbook": {
      "url": "https://agentplaybooks.ai/api/mcp/YOUR_GUID",
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
curl -s https://agentplaybooks.ai/api/mcp/YOUR_GUID | head -c 200
```

Si ves JSON con `protocolVersion` y `serverInfo`, todo está bien.

## Qué viene después

- **Cursor Marketplace** — Estamos trabajando en listar AgentPlaybooks en el marketplace de extensiones/MCP de Cursor
- **Windsurf** y otros IDE compatibles con MCP — El mismo endpoint funciona en todas partes
- **Management MCP Server** — Usa `https://agentplaybooks.ai/api/mcp/manage` con una User API Key para crear y gestionar playbooks desde tu agente de IA

Consulta la [documentación de integración MCP](/docs/mcp-integration) y la [guía de integraciones de plataforma](/docs/platform-integrations) para la referencia completa.

---

*AgentPlaybooks — La memoria y el kit de herramientas universal de tu IA. Un playbook, todas las plataformas.*
