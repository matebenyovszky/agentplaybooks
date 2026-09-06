# Management API & MCP Server

This guide explains how to programmatically manage AgentPlaybooks using the Management API or MCP Server. This enables AI agents to create, update, and delete playbooks on behalf of users.

## Overview

AgentPlaybooks provides protocol projections over one shared account operation model:

1. **REST/OpenAPI** - Standard resource endpoints plus operation endpoints
2. **User MCP control plane** - Account lifecycle plus every playbook operation
3. **Direct playbook MCP** - The same playbook operations with identity in the URL

The browser dashboard calls the REST API with its Supabase login session. Scripts,
the CLI, and agents can call that same REST API with a **User API Key**. MCP clients
use the Management MCP endpoint with AgentPlaybooks OAuth 2.1 account login or the
same User API Key. In every case, the resolved AgentPlaybooks user and permission
checks are identical; these are different transports, not different accounts.

| Consumer | Endpoint | Authentication |
| --- | --- | --- |
| Browser dashboard | `/api/manage/playbooks...` | Supabase session JWT |
| CLI, curl, automation | `/api/manage/playbooks...` | User API Key |
| Cursor, Codex, ChatGPT, Hermes and other MCP clients | `/api/mcp/manage` | OAuth 2.1 account login or User API Key |

A **Playbook API Key** is intentionally different: it is scoped to one playbook
and must not grant account-wide management access.

---

## User API Keys

Unlike Playbook API Keys (which only work for a single playbook), **User API Keys** represent one user account across the Management API. They can access playbooks owned by that account and playbooks shared with it. This allows AI agents to:

- Create new playbooks (with embedded persona)
- Manage existing playbooks
- Add/update/delete skills and memory
- Manage workflow runs, canvas documents, connected MCP/OpenAPI servers, and secrets (when explicitly permitted)
- Apply a newly created playbook immediately through the same control-plane connection
- List owned and shared playbooks, including `current_user_role`

For a shared playbook, the User API Key inherits the account's editor boundaries: it may change content but cannot change visibility, manage collaborators or playbook API keys, access secrets, or delete the playbook. Human invitation endpoints themselves require an interactive JWT session and are not exposed through this API.

> **Architecture Note:** AgentPlaybooks uses a **1 Playbook = 1 Persona** model. Each playbook has exactly one persona embedded directly in the playbook record. There's no separate personas table.

### Creating a User API Key

1. Go to your [Dashboard Settings](https://apbks.com/dashboard/settings)
2. Click "Create Key"
3. Enter an optional name (e.g., "Claude Desktop", "Cursor")
4. Select permissions:
   - `playbooks:read` - List and read playbooks
   - `playbooks:write` - Create, update, delete playbooks (incl. persona)
   - `personas:read` / `personas:write` - Read or update persona data
   - `skills:read` / `skills:write` - Read or manage skills
   - `memory:read` - Read memory
   - `memory:write` - Write/delete memory
   - `canvas:read` / `canvas:write` - Read or manage workflow runs and canvas
   - `tools:call` - Call protected tools on connected MCP servers
   - `secrets:read` / `secrets:write` - Use or manage encrypted secrets (opt-in)
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
https://apbks.com/api/manage
```

### Authentication

The dashboard sends its Supabase session JWT automatically. For CLI, curl, and
other unattended callers, include the User API Key in the Authorization header:

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

The specification also contains the generalized operation projection:

```http
POST /api/control/:operation
Authorization: Bearer apb_live_xxx
Content-Type: application/json
```

Playbook operations require `playbook_id` in the JSON body. For example:

```http
POST /api/control/create_run

{
  "playbook_id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Customer discovery",
  "context": { "customer": "Acme" }
}
```

The equivalent direct route binds the identity instead:

```http
POST /api/playbooks/PLAYBOOK_GUID/operations/create_run

{
  "name": "Customer discovery",
  "context": { "customer": "Acme" }
}
```

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/manage/playbooks` | List owned and shared playbooks |
| POST | `/manage/playbooks` | Create playbook (with persona) |
| GET | `/manage/playbooks/:id` | Get playbook with all contents |
| PUT | `/manage/playbooks/:id` | Update playbook (incl. persona fields) |
| DELETE | `/manage/playbooks/:id` | Delete an owned playbook (owner only) |
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
curl -X POST https://apbks.com/api/manage/playbooks \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Code Review Assistant",
    "description": "Reviews code for bugs and improvements",
    "is_public": false,
    "persona_name": "Senior Developer",
    "persona_system_prompt": "You are a senior software developer with 10+ years of experience. Provide thorough, constructive code reviews.",
    "instructions": "# Project rules\n\n- Use pnpm.\n- Run the tests before committing."
  }'
```

`persona_system_prompt` is the agent's identity and travels between projects.
`instructions` holds the always-on operating rules of one project — the content
local tools keep in `AGENTS.md` or `CLAUDE.md`. Both are stored separately and
accepted on create and update; a client that needs a single system prompt
receives them composed persona-first.

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
  "instructions": "# Project rules\n\n- Use pnpm.\n- Run the tests before committing.",
  "created_at": "2024-01-15T10:00:00Z",
  "updated_at": "2024-01-15T10:00:00Z"
}
```

#### Add a Skill

```bash
curl -X POST https://apbks.com/api/manage/playbooks/$PLAYBOOK_ID/skills \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Code review guide",
    "description": "Use when reviewing code for correctness and security",
    "content": "# Code review\nFollow this checklist...",
    "licence": "MIT",
    "priority": 80
  }'
```

#### Update Persona

To update the persona, simply update the playbook:

```bash
curl -X PUT https://apbks.com/api/manage/playbooks/$PLAYBOOK_ID \
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

The Management MCP Server allows AI agents using the Model Context Protocol to manage the same account and playbooks as the REST API.

### Server URL

```
https://apbks.com/api/mcp/manage
```

### Configuration

Clients with interactive account linking should use OAuth 2.1. Clients that do
not support the login flow can send a User API Key in `Authorization` or
`X-API-Key`. The server advertises OAuth per tool and returns the MCP
`mcp/www_authenticate` challenge when linking is required.

#### For Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "agentplaybooks-manage": {
      "url": "https://apbks.com/api/mcp/manage",
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
      "url": "https://apbks.com/api/mcp/manage",
      "headers": {
        "Authorization": "Bearer $AGENTPLAYBOOKS_API_KEY"
      }
    }
  }
}
```

### Available Tools

The control plane includes account lifecycle tools and the complete canonical
playbook tool catalog. Every playbook-scoped tool below requires
`playbook_id`; the direct `/api/mcp/:guid` endpoint exposes the same schema
without that argument.

| Tool | Description |
|------|-------------|
| `list_playbooks` | List all playbooks owned by the user |
| `create_playbook` | Create a new playbook (with embedded persona) |
| `get_playbook` | Get playbook with persona, skills, and memory |
| `update_playbook` | Update playbook (incl. persona fields) |
| `delete_playbook` | Delete a playbook (cannot be undone!) |
| `list_skills` | List all skills in a playbook |
| `get_skill` | Get skill metadata and SKILL.md content |
| `create_skill` | Add a skill to a playbook |
| `update_skill` | Update a skill |
| `delete_skill` | Delete a skill |
| `read_memory` | Read a specific memory entry by key |
| `search_memory` | Search memories by text and/or tags |
| `write_memory` | Write a memory entry with optional tags and description |
| `delete_memory` | Delete a memory entry |
| `create_run`, `list_runs`, `update_run`, `delete_run` | Manage isolated workflow runs |
| `list_canvas`, `read_canvas`, `write_canvas`, `patch_canvas_section` | Manage run-scoped canvas artifacts |
| `list_mcp_servers`, `create_mcp_server`, `update_mcp_server`, `delete_mcp_server` | Manage connected MCP/OpenAPI servers |
| `call_connected_tool` | Call a dynamic tool on a connected server |
| `list_secrets`, `use_secret`, `store_secret`, `rotate_secret`, `delete_secret` | Zero-exposure secret use and management |

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
    "name": "Summarization guide",
    "description": "Use when condensing a long document",
    "content": "# Summarization\nPreserve facts and cite sections...",
    "priority": 70
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
      "url": "https://apbks.com/api/mcp/abc123def456",
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

Application-level limits are planned and are not currently guaranteed by the API. Clients should
handle `429 Too Many Requests` responses with exponential backoff.

---

## Security Considerations

1. **Never expose User API Keys** in client-side code
2. **Use minimal permissions** - only request permissions you need
3. **Set expiration dates** for temporary keys
4. **Rotate keys regularly** for long-term use
5. **Monitor usage** via the dashboard
