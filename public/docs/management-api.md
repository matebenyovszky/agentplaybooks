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

- Create new playbooks (with embedded persona)
- Manage existing playbooks
- Add/update/delete skills and memory
- List all playbooks owned by the user

> **Architecture Note:** AgentPlaybooks uses a **1 Playbook = 1 Persona** model. Each playbook has exactly one persona embedded directly in the playbook record. There's no separate personas table.

### Creating a User API Key

1. Go to your [Dashboard Settings](https://agentplaybooks.ai/dashboard/settings)
2. Click "Create Key"
3. Enter an optional name (e.g., "Claude Desktop", "Cursor")
4. Select permissions:
   - `playbooks:read` - List and read playbooks
   - `playbooks:write` - Create, update, delete playbooks (incl. persona)
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
| POST | `/manage/playbooks` | Create playbook (with persona) |
| GET | `/manage/playbooks/:id` | Get playbook with all contents |
| PUT | `/manage/playbooks/:id` | Update playbook (incl. persona fields) |
| DELETE | `/manage/playbooks/:id` | Delete playbook |
| POST | `/manage/playbooks/:id/skills` | Add skill |
| PUT | `/manage/playbooks/:id/skills/:sid` | Update skill |
| DELETE | `/manage/playbooks/:id/skills/:sid` | Delete skill |
| GET | `/manage/playbooks/:id/memory` | List/search memories |
| GET | `/manage/playbooks/:id/memory/:key` | Get specific memory |
| PUT | `/manage/playbooks/:id/memory/:key` | Write memory with tags |
| DELETE | `/manage/playbooks/:id/memory/:key` | Delete memory |

### Examples

#### Create a Playbook

```bash
curl -X POST https://agentplaybooks.ai/api/manage/playbooks \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Code Review Assistant",
    "description": "Reviews code for bugs and improvements",
    "is_public": false,
    "persona_name": "Senior Developer",
    "persona_system_prompt": "You are a senior software developer with 10+ years of experience. Provide thorough, constructive code reviews."
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
  "persona_name": "Senior Developer",
  "persona_system_prompt": "You are a senior software developer...",
  "persona_metadata": {},
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

#### Update Persona

To update the persona, simply update the playbook:

```bash
curl -X PUT https://agentplaybooks.ai/api/manage/playbooks/$PLAYBOOK_ID \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "persona_name": "Expert Reviewer",
    "persona_system_prompt": "You are an expert code reviewer...",
    "persona_metadata": { "avatar": "👨‍💻" }
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
| `create_playbook` | Create a new playbook (with embedded persona) |
| `get_playbook` | Get playbook with persona, skills, and memory |
| `update_playbook` | Update playbook (incl. persona fields) |
| `delete_playbook` | Delete a playbook (cannot be undone!) |
| `list_skills` | List all skills in a playbook |
| `get_skill` | Get skill details including definition and examples |
| `create_skill` | Add a skill to a playbook |
| `update_skill` | Update a skill |
| `delete_skill` | Delete a skill |
| `read_memory` | Read a specific memory entry by key |
| `search_memory` | Search memories by text and/or tags |
| `write_memory` | Write a memory entry with optional tags and description |
| `delete_memory` | Delete a memory entry |

### Example Tool Calls

#### Create Playbook

```json
{
  "name": "create_playbook",
  "arguments": {
    "name": "My New Assistant",
    "description": "An assistant for helping with daily tasks",
    "is_public": false,
    "persona_name": "Task Helper",
    "persona_system_prompt": "You are a helpful assistant for daily tasks..."
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

Before deleting playbooks, always confirm with the user:

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

Store user preferences, conversation history, or learned patterns in memory. Use **tags** for categorization and easy search, and **descriptions** for clarity:

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
    },
    "tags": ["settings", "user", "coding"],
    "description": "User's coding preferences and style settings"
  }
}
```

#### Search Memory

Use `search_memory` to find memories by tags or text:

```json
{
  "name": "search_memory",
  "arguments": {
    "playbook_id": "xxx",
    "tags": ["user", "settings"],
    "search": "preference"
  }
}
```

This returns all memories that have any of the specified tags AND contain "preference" in the key or description.

Use `read_memory` when you know the exact key:

```json
{
  "name": "read_memory",
  "arguments": {
    "playbook_id": "xxx",
    "key": "user_preferences"
  }
}
```

### 5. Make Playbooks Public Carefully

Only make playbooks public if they're meant to be shared. Public playbooks appear in the marketplace.

---

## Playbook MCP Server

Each public playbook has its own MCP server at `/api/mcp/:guid`. This allows AI clients to:

- Read personas, skills, and memory
- Search memory by tags and text
- Write memory (with API key)
- Access skill attachments

### Available Tools (Playbook MCP)

| Tool | Description | Auth |
|------|-------------|------|
| `list_skills` | List all skills | None |
| `get_skill` | Get skill details with attachments | None |
| `read_memory` | Read specific memory by key | None |
| `search_memory` | Search memories by text/tags | None |
| `write_memory` | Write memory entry | API Key |
| `delete_memory` | Delete memory entry | API Key |

> **Note:** Persona is embedded in the playbook and returned with `GET /api/playbooks/:guid`

### Resources (Playbook MCP)

| URI | Description |
|-----|-------------|
| `playbook://{guid}/skills` | All skills |
| `playbook://{guid}/memory` | All memories |
| `playbook://{guid}/skills/{id}/attachments/{id}` | Skill attachment content |

### Example: Configure Claude Desktop for a Playbook

```json
{
  "mcpServers": {
    "my-playbook": {
      "url": "https://agentplaybooks.ai/api/mcp/abc123def456",
      "transport": "http",
      "headers": {
        "Authorization": "Bearer apb_live_xxx"  // Optional, for write access
      }
    }
  }
}
```

---

## Skill Attachments API

Skills can have file attachments (code files, documentation, etc.) that provide additional context.

### List Attachments

```http
GET /api/manage/skills/:skillId/attachments
```

### Get Attachment Content

```http
GET /api/manage/skills/:skillId/attachments/:attachmentId
GET /api/manage/skills/:skillId/attachments/:attachmentId?raw=true  # Raw text
```

### Upload Attachment

```http
POST /api/manage/skills/:skillId/attachments
Content-Type: application/json

{
  "filename": "helper.ts",
  "content": "export function helper() { ... }",
  "file_type": "typescript",
  "description": "Helper functions for the skill"
}
```

**Supported file types:**
- `typescript`, `javascript`, `python`, `go`, `rust`
- `sql`, `markdown`, `json`, `yaml`
- `text`, `cursorrules`, `shell`

**Limits:**
- Max file size: 50KB
- Max files per skill: 10
- Max filename length: 100 characters

### Update Attachment

```http
PUT /api/manage/skills/:skillId/attachments/:attachmentId
Content-Type: application/json

{
  "content": "updated content...",
  "description": "Updated description"
}
```

### Delete Attachment

```http
DELETE /api/manage/skills/:skillId/attachments/:attachmentId
```

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
