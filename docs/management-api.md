# Management API & MCP Server

This guide explains how to programmatically manage AgentPlaybooks using the Management API or MCP Server. This enables AI agents to create, update, and delete playbooks on behalf of users.

## Overview

AgentPlaybooks provides two ways for AI agents to manage playbooks:

1. **REST API** - Standard HTTP endpoints with OpenAPI specification
2. **MCP Server** - Model Context Protocol server for Claude, Cursor, and other MCP clients

Both methods require a **User API Key** for authentication.

---

## User API Keys

Unlike Playbook API Keys (which only work for a single playbook), **User API Keys** provide access to all of a user's playbooks. This allows AI agents to:

- Create new playbooks
- Manage existing playbooks
- Add/update/delete personas, skills, and memory
- List all playbooks owned by the user

### Creating a User API Key

1. Go to your Dashboard → Settings → API Keys
2. Click "Create User API Key"
3. Select permissions:
   - `playbooks:read` - List and read playbooks
   - `playbooks:write` - Create, update, delete playbooks
   - `personas:write` - Manage personas
   - `skills:write` - Manage skills
   - `memory:read` - Read memory
   - `memory:write` - Write/delete memory
   - `full` - All permissions
4. Copy the key immediately (it won't be shown again!)

### API Key Format

```
apb_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Via API

```http
POST /api/user/api-keys
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "name": "AI Assistant Key",
  "permissions": ["playbooks:read", "playbooks:write", "skills:write", "memory:read", "memory:write"]
}
```

Response includes the plain key only once:

```json
{
  "id": "uuid",
  "key_prefix": "apb_live_xxx...",
  "key": "apb_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "warning": "Save this key now! It will not be shown again."
}
```

---

## REST API

### Base URL

```
https://agentplaybooks.ai/api/manage
```

### Authentication

Include the User API Key in the Authorization header:

```http
Authorization: Bearer apb_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### OpenAPI Specification

Get the full OpenAPI spec:

```http
GET /api/manage/openapi.json
```

This can be used with:
- ChatGPT Custom Actions
- OpenAPI-compatible tools
- API documentation generators

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/manage/playbooks` | List all playbooks |
| POST | `/manage/playbooks` | Create playbook |
| GET | `/manage/playbooks/:id` | Get playbook with all contents |
| PUT | `/manage/playbooks/:id` | Update playbook |
| DELETE | `/manage/playbooks/:id` | Delete playbook |
| POST | `/manage/playbooks/:id/personas` | Add persona |
| PUT | `/manage/playbooks/:id/personas/:pid` | Update persona |
| DELETE | `/manage/playbooks/:id/personas/:pid` | Delete persona |
| POST | `/manage/playbooks/:id/skills` | Add skill |
| PUT | `/manage/playbooks/:id/skills/:sid` | Update skill |
| DELETE | `/manage/playbooks/:id/skills/:sid` | Delete skill |

### Examples

#### Create a Playbook

```bash
curl -X POST https://agentplaybooks.ai/api/manage/playbooks \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Code Review Assistant",
    "description": "Reviews code for bugs and improvements",
    "is_public": false
  }'
```

Response:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "guid": "abc123def456",
  "name": "Code Review Assistant",
  "description": "Reviews code for bugs and improvements",
  "is_public": false,
  "created_at": "2024-01-15T10:00:00Z",
  "updated_at": "2024-01-15T10:00:00Z"
}
```

#### Add a Skill

```bash
curl -X POST https://agentplaybooks.ai/api/manage/playbooks/$PLAYBOOK_ID/skills \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "review_code",
    "description": "Review code for bugs, style issues, and improvements",
    "definition": {
      "parameters": {
        "type": "object",
        "properties": {
          "code": {
            "type": "string",
            "description": "The code to review"
          },
          "language": {
            "type": "string",
            "description": "Programming language"
          },
          "focus": {
            "type": "array",
            "items": { "type": "string" },
            "description": "Areas to focus on: bugs, performance, style"
          }
        },
        "required": ["code"]
      }
    }
  }'
```

#### Add a Persona

```bash
curl -X POST https://agentplaybooks.ai/api/manage/playbooks/$PLAYBOOK_ID/personas \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Senior Developer",
    "system_prompt": "You are a senior software developer with 10+ years of experience. You provide thorough, constructive code reviews focusing on:\n- Bug detection\n- Performance optimization\n- Code maintainability\n- Best practices\n\nBe helpful and educational. Explain why something is an issue, not just that it is."
  }'
```

---

## MCP Server

The Management MCP Server allows AI agents using the Model Context Protocol to manage playbooks directly.

### Server URL

```
https://agentplaybooks.ai/api/mcp/manage
```

### Configuration

#### For Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "agentplaybooks-manage": {
      "url": "https://agentplaybooks.ai/api/mcp/manage",
      "transport": "http",
      "headers": {
        "Authorization": "Bearer apb_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

#### For Cursor

Add to your MCP settings:

```json
{
  "mcpServers": {
    "agentplaybooks-manage": {
      "url": "https://agentplaybooks.ai/api/mcp/manage",
      "headers": {
        "Authorization": "Bearer $AGENTPLAYBOOKS_API_KEY"
      }
    }
  }
}
```

### Available Tools

| Tool | Description |
|------|-------------|
| `list_playbooks` | List all playbooks owned by the user |
| `create_playbook` | Create a new playbook |
| `get_playbook` | Get playbook with all personas, skills, and memory |
| `update_playbook` | Update playbook name, description, or visibility |
| `delete_playbook` | Delete a playbook (cannot be undone!) |
| `create_persona` | Add a persona to a playbook |
| `update_persona` | Update a persona |
| `delete_persona` | Delete a persona |
| `create_skill` | Add a skill to a playbook |
| `update_skill` | Update a skill |
| `delete_skill` | Delete a skill |
| `read_memory` | Read memory entries |
| `write_memory` | Write a memory entry |
| `delete_memory` | Delete a memory entry |

### Example Tool Calls

#### Create Playbook

```json
{
  "name": "create_playbook",
  "arguments": {
    "name": "My New Assistant",
    "description": "An assistant for helping with daily tasks",
    "is_public": false
  }
}
```

#### Add Skill

```json
{
  "name": "create_skill",
  "arguments": {
    "playbook_id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "summarize_text",
    "description": "Summarize a long piece of text",
    "definition": {
      "parameters": {
        "type": "object",
        "properties": {
          "text": { "type": "string", "description": "Text to summarize" },
          "max_length": { "type": "integer", "description": "Maximum summary length in words" }
        },
        "required": ["text"]
      }
    }
  }
}
```

### MCP Protocol

The server implements the standard MCP JSON-RPC protocol:

```http
POST /api/mcp/manage
Authorization: Bearer apb_live_xxx
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "list_playbooks",
    "arguments": {}
  }
}
```

---

## AgentPlaybooks Assistant

We provide a built-in playbook called **AgentPlaybooks Assistant** that helps AI agents learn how to use the platform. Access it at:

```
GET /api/playbooks/agentplaybooks-assistant
```

This playbook includes:
- A persona explaining the platform
- Skills for generating playbook templates
- Documentation and API references

You can use this playbook to bootstrap your AI's understanding of AgentPlaybooks.

---

## Best Practices

### 1. Always Confirm Destructive Actions

Before deleting playbooks or personas, always confirm with the user:

```
"I'm about to delete the playbook 'My Assistant' and all its contents. This cannot be undone. Proceed?"
```

### 2. Use Descriptive Names

```json
// Good
{ "name": "code_review", "description": "Review code for bugs and style issues" }

// Bad
{ "name": "cr", "description": "" }
```

### 3. Include Parameter Descriptions

```json
{
  "parameters": {
    "type": "object",
    "properties": {
      "code": {
        "type": "string",
        "description": "The source code to analyze. Can be any programming language."
      }
    }
  }
}
```

### 4. Use Memory for Context

Store user preferences, conversation history, or learned patterns in memory:

```json
{
  "name": "write_memory",
  "arguments": {
    "playbook_id": "xxx",
    "key": "user_preferences",
    "value": {
      "preferred_language": "Python",
      "code_style": "PEP8",
      "verbosity": "detailed"
    }
  }
}
```

### 5. Make Playbooks Public Carefully

Only make playbooks public if they're meant to be shared. Public playbooks appear in the marketplace.

---

## Error Handling

Common errors:

| Error | Description | Solution |
|-------|-------------|----------|
| 401 Unauthorized | Invalid or missing API key | Check the Authorization header |
| 403 Forbidden | Key doesn't have required permission | Request a key with appropriate permissions |
| 404 Not Found | Playbook not found or not owned | Verify the playbook ID and ownership |
| 400 Bad Request | Missing required field | Check request body for required fields |

---

## Rate Limits

| Endpoint Type | Limit |
|---------------|-------|
| Management API | 120 requests/minute/user |
| MCP Tools | 120 requests/minute/user |

---

## Security Considerations

1. **Never expose User API Keys** in client-side code
2. **Use minimal permissions** - only request permissions you need
3. **Set expiration dates** for temporary keys
4. **Rotate keys regularly** for long-term use
5. **Monitor usage** via the dashboard

