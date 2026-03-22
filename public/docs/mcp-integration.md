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

## Agent Usage Pattern (Recommended)

To match AgentPlaybooks goals (portable, up-to-date, self-improving agents), run MCP in this loop:

1. **Initialize and inspect once**
   - `initialize`
   - `tools/list`
   - `resources/list`
2. **Read the guide first**
   - `resources/read` for `playbook://YOUR_GUID/guide`
3. **Fetch only what you need**
   - `read_memory` for known keys
   - `search_memory` for discovery
   - `read_canvas` / `get_canvas_toc` for longer docs and plans
4. **Execute work with tools**
   - Use built-in playbook tools and skill tools
5. **Write back outcomes**
   - `write_memory` for compact facts/state
   - `write_canvas` / `patch_canvas_section` for detailed runbooks, postmortems, or long plans

This keeps context fresh, avoids token waste, and prevents repeating the same mistakes across sessions.

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

## Secrets Vault

AgentPlaybooks includes a built-in secrets vault for encrypted credential storage. Secrets are encrypted with AES-256-GCM using per-user derived keys.

### Security Design

Secret values are **never exposed to AI agents**. Instead of reading secret values directly, agents use the `use_secret` tool which acts as a server-side proxy:

1. Agent calls `use_secret` with a secret name and target URL
2. Server decrypts the secret internally
3. Server makes the HTTP request with the secret injected as a header
4. Only the HTTP response is returned to the agent

This ensures credentials never appear in agent context, logs, or conversation history.

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `list_secrets` | List secret names and metadata (never values) |
| `use_secret` | Make HTTP request with secret injected server-side |
| `store_secret` | Store a new encrypted secret |
| `rotate_secret` | Replace a secret's value |
| `delete_secret` | Permanently remove a secret |

### Example: Using a Secret

```json
{
  "method": "tools/call",
  "params": {
    "name": "use_secret",
    "arguments": {
      "secret_name": "OPENAI_API_KEY",
      "url": "https://api.openai.com/v1/models",
      "method": "GET",
      "header_name": "Authorization",
      "header_prefix": "Bearer "
    }
  }
}
```

The agent receives only the API response — the secret value stays on the server.

### Example: Storing a Secret

```json
{
  "method": "tools/call",
  "params": {
    "name": "store_secret",
    "arguments": {
      "name": "OPENAI_API_KEY",
      "value": "sk-...",
      "description": "OpenAI API key for GPT-4",
      "category": "api_key"
    }
  }
}
```

## Best Practices

1. **Keep tools focused** - Each tool should do one thing well
2. **Write clear descriptions** - MCP clients use these to understand capabilities
3. **Define schemas carefully** - Well-defined input schemas help AI use tools correctly
4. **Use resources for data** - Resources are better than tools for read-only data access
5. **Start with the guide resource** - Read `playbook://GUID/guide` before complex tasks
6. **Fetch minimally** - Read targeted resources/keys first, not full dumps by default
7. **Close the loop** - Save discovered constraints/workarounds to memory or canvas
8. **Test with Claude Desktop** - Verify your MCP configuration works before deploying

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

