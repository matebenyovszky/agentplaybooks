# MCP Integration

This guide explains how to use AgentPlaybooks with the Model Context Protocol (MCP).

## What is MCP?

The [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) is an open standard developed by Anthropic that enables AI assistants to securely connect to external data sources and tools.

AgentPlaybooks provides an MCP-compatible server endpoint for each public playbook.

## Quick Start

### 1. Get Your MCP Endpoint

After creating and publishing a playbook, your MCP endpoint is:

```
https://agentplaybooks.ai/api/mcp/YOUR_GUID
```

### 2. Configure Your MCP Client

#### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "my-playbook": {
      "command": "curl",
      "args": ["-s", "https://agentplaybooks.ai/api/mcp/YOUR_GUID"]
    }
  }
}
```

Or use an MCP HTTP transport:

```json
{
  "mcpServers": {
    "my-playbook": {
      "transport": "http",
      "url": "https://agentplaybooks.ai/api/mcp/YOUR_GUID"
    }
  }
}
```

#### Custom MCP Client

```typescript
import { Client } from "@modelcontextprotocol/sdk/client";

const client = new Client({
  name: "my-app",
  version: "1.0.0"
});

// Connect to playbook
await client.connect({
  transport: "http",
  url: "https://agentplaybooks.ai/api/mcp/YOUR_GUID"
});

// List available tools
const tools = await client.listTools();

// Read resources
const memory = await client.readResource({
  uri: "playbook://YOUR_GUID/memory"
});
```

## MCP Server Manifest

When you access the MCP endpoint, it returns a server manifest:

```json
{
  "protocolVersion": "2024-11-05",
  "serverInfo": {
    "name": "My AI Assistant",
    "version": "1.0.0",
    "description": "A helpful coding assistant"
  },
  "capabilities": {
    "tools": {},
    "resources": {}
  },
  "tools": [
    {
      "name": "code_review",
      "description": "Review code for bugs and improvements",
      "inputSchema": {
        "type": "object",
        "properties": {
          "code": { "type": "string" },
          "language": { "type": "string" }
        }
      }
    }
  ],
  "resources": [
    {
      "uri": "playbook://abc123/personas",
      "name": "Personas",
      "description": "AI personalities and system prompts",
      "mimeType": "application/json"
    },
    {
      "uri": "playbook://abc123/memory",
      "name": "Memory",
      "description": "Persistent key-value memory storage",
      "mimeType": "application/json"
    }
  ],
  "_playbook": {
    "guid": "abc123",
    "personas": [
      {
        "name": "Coder",
        "systemPrompt": "You are a helpful coding assistant..."
      }
    ]
  }
}
```

## Available Tools

Tools are generated from your playbook's skills. Each skill becomes an MCP tool:

| Skill Property | MCP Tool Property |
|----------------|-------------------|
| `name` | `name` (snake_case) |
| `description` | `description` |
| `definition.parameters` | `inputSchema` |

## Available Resources

Each playbook exposes these resources:

| Resource URI | Description |
|--------------|-------------|
| `playbook://GUID/personas` | All personas with system prompts |
| `playbook://GUID/memory` | All stored memories |
| `playbook://GUID/skills` | All skills with definitions |

## JSON-RPC Methods

The MCP endpoint supports standard JSON-RPC 2.0:

### Initialize

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "clientInfo": {
      "name": "my-client",
      "version": "1.0.0"
    }
  }
}
```

### List Tools

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list"
}
```

### List Resources

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "resources/list"
}
```

### Read Resource

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "resources/read",
  "params": {
    "uri": "playbook://abc123/memory"
  }
}
```

## Adding MCP Servers to Your Playbook

You can define custom MCP server configurations within your playbook:

1. Go to the **MCP Servers** tab in the Playbook Editor
2. Click **"Add MCP Server"**
3. Define tools and resources

These will be merged into your playbook's MCP manifest.

### Example MCP Server Definition

```json
{
  "name": "file_tools",
  "tools": [
    {
      "name": "read_file",
      "description": "Read contents of a file",
      "inputSchema": {
        "type": "object",
        "properties": {
          "path": { "type": "string" }
        },
        "required": ["path"]
      }
    }
  ],
  "resources": [
    {
      "uri": "file:///workspace",
      "name": "Workspace",
      "mimeType": "text/plain"
    }
  ]
}
```

## Best Practices

1. **Keep tools focused** - Each tool should do one thing well
2. **Write clear descriptions** - MCP clients use these to understand capabilities
3. **Define schemas carefully** - Well-defined input schemas help AI use tools correctly
4. **Use resources for data** - Resources are better than tools for read-only data access
5. **Test with Claude Desktop** - Verify your MCP configuration works before deploying

---

## Clawdbot Integration

[Clawdbot](https://github.com/steipete/clawdbot) is a popular open-source, self-hosted AI assistant that connects messaging platforms (WhatsApp, Telegram, Discord) with LLM APIs. It has full MCP support.

### Connecting AgentPlaybooks to Clawdbot

Add to Clawdbot's `config.yaml`:

```yaml
mcp_servers:
  - name: agent-playbook
    transport: http
    url: https://agentplaybooks.ai/api/mcp/YOUR_GUID
    description: My custom AI playbook with skills and memory

messaging:
  whatsapp:
    enabled: true
    phone_number: "+1234567890"
  telegram:
    enabled: true
    bot_token: "your_bot_token"
```

### With Authentication (for Memory Write-back)

```yaml
mcp_servers:
  - name: agent-playbook
    transport: http
    url: https://agentplaybooks.ai/api/mcp/YOUR_GUID
    auth:
      type: bearer
      token: apb_live_xxx
    write_enabled: true
```

### Benefits of Clawdbot + AgentPlaybooks

| Feature | Description |
|---------|-------------|
| **Multi-platform** | Same playbook across WhatsApp, Telegram, Discord |
| **Shared memory** | Updates sync across all platforms instantly |
| **Self-hosted privacy** | Runs on your own hardware |
| **Flexible backend** | Switch between Claude, ChatGPT, Gemini |

See [Platform Integrations](./platform-integrations.md) for Claude Coworker and other integrations.

