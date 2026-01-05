# API Reference

Complete reference for all AgentPlaybooks API endpoints.

## Base URL

```
https://agentplaybooks.ai/api
```

For self-hosted instances, replace with your domain.

---

## Authentication

AgentPlaybooks supports two authentication methods:

### 1. User Authentication (JWT)

For dashboard and management endpoints. Pass Supabase JWT token:

```http
Authorization: Bearer <supabase_jwt_token>
```

### 2. Playbook API Key Authentication

For agent/AI write-back endpoints on a specific playbook:

```http
Authorization: Bearer apb_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 3. User API Key Authentication

For programmatic access to ALL your playbooks (used by AI agents for management):

```http
Authorization: Bearer apb_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

User API Keys work with the Management API (`/api/manage/*`) and Management MCP Server (`/api/mcp/manage`).

See [Management API & MCP](./management-api.md) for details.

---

## Connect with ChatGPT (Custom GPT Actions)

You can connect any public playbook to ChatGPT as a Custom GPT Action. This allows ChatGPT to use your playbook's skills, read/write memory, and follow your persona's instructions.

### Step-by-Step Setup

1. **Open ChatGPT GPT Builder**
   - Go to [chat.openai.com](https://chat.openai.com)
   - Click "Explore GPTs" → "Create"
   - Or edit an existing GPT

2. **Add an Action**
   - Go to **Configure** tab
   - Scroll to **Actions** → Click **Create new action**

3. **Import OpenAPI Specification**
   - Click **Import from URL**
   - Enter your playbook's OpenAPI URL:
   ```
   https://agentplaybooks.ai/api/playbooks/{your-guid}?format=openapi
   ```
   - ChatGPT will automatically parse the available endpoints

4. **Set Up Authentication**
   - Under **Authentication**, select **API Key**
   - **Auth Type**: `Bearer`
   - **API Key**: Your playbook API key (e.g., `apb_live_xxxxx...`)
   
   > 💡 Create an API key at: Dashboard → Your Playbook → Settings → API Keys

5. **Configure Privacy Policy** (optional)
   - Add a privacy policy URL if publishing publicly

6. **Save and Test**
   - Click **Save**
   - Test by asking ChatGPT to use one of your playbook's skills

### What ChatGPT Can Do

Once connected, ChatGPT can:

| Action | Endpoint | Description |
|--------|----------|-------------|
| Read Memory | `GET /memory` | Access stored data |
| Search Memory | `GET /memory?search=...&tags=...` | Find specific entries |
| Write Memory | `PUT /memory/:key` | Save new data (requires API key) |
| Delete Memory | `DELETE /memory/:key` | Remove entries |
| List Skills | `GET /skills` | See available capabilities |
| Get Skill | `GET /skills/:id` | Get skill details & examples |
| List Personas | `GET /personas` | Get AI personality instructions |

### Example: Using Memory

Ask ChatGPT:
> "Save my preference for dark mode to the playbook memory"

ChatGPT will call:
```http
PUT /api/playbooks/your-guid/memory/user_preferences
Authorization: Bearer apb_live_xxxxx
Content-Type: application/json

{
  "value": { "theme": "dark" },
  "tags": ["preferences", "ui"],
  "description": "User's display preferences"
}
```

### Security Notes

- **API Key** is stored encrypted by OpenAI
- Keys only grant access to the specific playbook
- Use separate keys for different integrations
- Rotate keys periodically via Dashboard

### OpenAPI Spec Contents

The `?format=openapi` response includes:

```json
{
  "openapi": "3.1.0",
  "info": {
    "title": "Your Playbook Name",
    "description": "Your playbook description"
  },
  "servers": [{ "url": "https://agentplaybooks.ai/api" }],
  "paths": { /* memory, skills, personas endpoints */ },
  "components": {
    "securitySchemes": {
      "apiKey": {
        "type": "http",
        "scheme": "bearer",
        "description": "API key starting with apb_live_"
      }
    }
  },
  "x-playbook": {
    "guid": "your-guid",
    "personas": [/* full persona data */],
    "skills": [/* full skill definitions */],
    "mcp_servers": [/* MCP server configs */]
  }
}
```

The `x-playbook` extension provides full context to the AI, including system prompts and skill definitions.

---

## Public Endpoints

These endpoints don't require authentication. They only work for playbooks marked as public.

### Get Playbook

Retrieve a playbook with all its contents.

```http
GET /api/playbooks/:guid
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `format` | string | `json` | Output format: `json`, `openapi`, `mcp`, `anthropic`, `markdown` |

**Response (JSON):**

```json
{
  "id": "uuid",
  "guid": "abc123def456",
  "name": "My AI Assistant",
  "description": "A helpful coding assistant",
  "is_public": true,
  "personas": [
    {
      "id": "uuid",
      "name": "Coder",
      "system_prompt": "You are a helpful coding assistant..."
    }
  ],
  "skills": [
    {
      "id": "uuid",
      "name": "code_review",
      "description": "Review code for issues",
      "definition": { ... }
    }
  ],
  "mcp_servers": [
    {
      "id": "uuid",
      "name": "file_tools",
      "tools": [...],
      "resources": [...]
    }
  ]
}
```

**Response (OpenAPI):**

Returns an OpenAPI 3.1 specification suitable for ChatGPT Custom Actions.

**Response (MCP):**

Returns an MCP-compatible server manifest with tools and resources.

**Response (Anthropic):**

Returns Anthropic-compatible tool definitions with system prompt.

```json
{
  "playbook": {
    "name": "My AI Assistant",
    "description": "...",
    "guid": "abc123def456"
  },
  "system_prompt": "## Coder\n\nYou are a helpful...",
  "tools": [
    {
      "name": "code_review",
      "description": "Review code for issues",
      "input_schema": { ... }
    }
  ],
  "mcp_servers": [...]
}
```

**Response (Markdown):**

Returns a human-readable Markdown document.

### Get Memory (Public Read with Search)

```http
GET /api/playbooks/:guid/memory
GET /api/playbooks/:guid/memory?key=specific_key
GET /api/playbooks/:guid/memory?search=user
GET /api/playbooks/:guid/memory?tags=settings,preferences
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `key` | string | Get specific memory by key |
| `search` | string | Search in keys and descriptions |
| `tags` | string | Filter by tags (comma-separated, any match) |

**Response:**

```json
[
  {
    "key": "user_preferences",
    "value": { "theme": "dark" },
    "tags": ["settings", "user"],
    "description": "User preference settings",
    "updated_at": "2024-01-15T10:30:00Z"
  }
]
```

### List Skills (Public Read)

Get all skills (capabilities/rules) for a playbook:

```http
GET /api/playbooks/:guid/skills
```

**Response:**

```json
[
  {
    "id": "uuid",
    "name": "code_review",
    "description": "Review code for issues and improvements",
    "definition": {
      "parameters": {
        "type": "object",
        "properties": {
          "code": { "type": "string" }
        }
      }
    },
    "examples": [],
    "priority": 10
  }
]
```

### Get Skill by ID

```http
GET /api/playbooks/:guid/skills/:skillId
```

Supports lookup by UUID or skill name.

### List Personas (Public Read)

```http
GET /api/playbooks/:guid/personas
```

**Response:**

```json
[
  {
    "id": "uuid",
    "name": "Coder",
    "system_prompt": "You are a helpful coding assistant...",
    "metadata": {}
  }
]
```

---

## Authenticated Endpoints (User JWT Required)

These endpoints require a valid Supabase JWT token for the logged-in user.

### List Playbooks

```http
GET /api/playbooks
```

**Response:**

```json
[
  {
    "id": "uuid",
    "guid": "abc123def456",
    "name": "My AI Assistant",
    "description": "A helpful coding assistant",
    "is_public": false,
    "persona_count": 2,
    "skill_count": 5,
    "mcp_server_count": 1,
    "created_at": "2024-01-15T10:00:00Z",
    "updated_at": "2024-01-15T12:00:00Z"
  }
]
```

### Create Playbook

```http
POST /api/playbooks
Content-Type: application/json

{
  "name": "My New Playbook",
  "description": "Optional description",
  "is_public": false,
  "config": {}
}
```

**Response (201):**

```json
{
  "id": "uuid",
  "guid": "xyz789abc123",
  "name": "My New Playbook",
  "description": "Optional description",
  "is_public": false,
  "config": {},
  "created_at": "2024-01-15T10:00:00Z",
  "updated_at": "2024-01-15T10:00:00Z"
}
```

### Update Playbook

```http
PUT /api/playbooks/:id
Content-Type: application/json

{
  "name": "Updated Name",
  "description": "Updated description",
  "is_public": true
}
```

### Delete Playbook

```http
DELETE /api/playbooks/:id
```

**Response:**

```json
{ "success": true }
```

---

## Personas CRUD (Authenticated)

Manage personas within a playbook you own.

### List Personas

```http
GET /api/playbooks/:id/personas
```

### Create Persona

```http
POST /api/playbooks/:id/personas
Content-Type: application/json

{
  "name": "Coder",
  "system_prompt": "You are a helpful coding assistant...",
  "metadata": {}
}
```

**Response (201):**

```json
{
  "id": "uuid",
  "playbook_id": "uuid",
  "name": "Coder",
  "system_prompt": "You are a helpful coding assistant...",
  "metadata": {},
  "created_at": "2024-01-15T10:00:00Z"
}
```

### Update Persona

```http
PUT /api/playbooks/:id/personas/:pid
Content-Type: application/json

{
  "name": "Updated Name",
  "system_prompt": "Updated prompt..."
}
```

### Delete Persona

```http
DELETE /api/playbooks/:id/personas/:pid
```

---

## Skills CRUD (Authenticated)

Manage skills within a playbook you own.

### List Skills

```http
GET /api/playbooks/:id/skills
```

### Create Skill

```http
POST /api/playbooks/:id/skills
Content-Type: application/json

{
  "name": "code_review",
  "description": "Review code for issues",
  "definition": {
    "parameters": {
      "type": "object",
      "properties": {
        "code": { "type": "string", "description": "Code to review" },
        "language": { "type": "string", "description": "Programming language" }
      },
      "required": ["code"]
    }
  },
  "examples": []
}
```

### Update Skill

```http
PUT /api/playbooks/:id/skills/:sid
Content-Type: application/json

{
  "description": "Updated description",
  "definition": { ... }
}
```

### Delete Skill

```http
DELETE /api/playbooks/:id/skills/:sid
```

---

## Memory Write Endpoints (API Key or Owner)

Write operations require either an API key with `memory:write` permission or owner authentication.

### Write Memory

```http
PUT /api/playbooks/:guid/memory/:key
Authorization: Bearer apb_live_xxx
Content-Type: application/json

{
  "value": { "theme": "dark", "language": "en" },
  "tags": ["settings", "user"],
  "description": "User preference settings"
}
```

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `value` | object | Yes | Any JSON value to store |
| `tags` | string[] | No | Tags for categorization and search |
| `description` | string | No | Human-readable description |

**Response:**

```json
{
  "key": "user_preferences",
  "value": { "theme": "dark", "language": "en" },
  "tags": ["settings", "user"],
  "description": "User preference settings",
  "updated_at": "2024-01-15T10:30:00Z"
}
```

**Note:** If the key already exists, it will be updated (upsert behavior). Tags and description can be updated along with the value.

### Delete Memory

```http
DELETE /api/playbooks/:guid/memory/:key
Authorization: Bearer apb_live_xxx
```

**Response:**

```json
{ "success": true }
```

---

## API Keys Management (Authenticated)

Manage API keys for your playbooks. Only the playbook owner can access these endpoints.

### List API Keys

```http
GET /api/playbooks/:id/api-keys
```

**Response:**

```json
[
  {
    "id": "uuid",
    "key_prefix": "apb_live_xxx...",
    "name": "Production Key",
    "permissions": ["memory:read", "memory:write"],
    "last_used_at": "2024-01-15T10:00:00Z",
    "expires_at": null,
    "is_active": true,
    "created_at": "2024-01-01T00:00:00Z"
  }
]
```

### Create API Key

```http
POST /api/playbooks/:id/api-keys
Content-Type: application/json

{
  "name": "Production Key",
  "permissions": ["memory:read", "memory:write", "skills:write"],
  "expires_at": "2025-01-01T00:00:00Z"
}
```

**Available Permissions:**

| Permission | Description |
|------------|-------------|
| `memory:read` | Read memory entries |
| `memory:write` | Write/delete memory entries |
| `skills:write` | Add/update skills |
| `personas:write` | Add/update personas |
| `full` | All permissions |

**Response (201):**

```json
{
  "id": "uuid",
  "key_prefix": "apb_live_xxx...",
  "name": "Production Key",
  "permissions": ["memory:read", "memory:write", "skills:write"],
  "expires_at": "2025-01-01T00:00:00Z",
  "is_active": true,
  "created_at": "2024-01-15T10:00:00Z",
  "key": "apb_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "warning": "Save this key now! It will not be shown again."
}
```

⚠️ **Important:** The full API key is only returned once at creation. Store it securely!

### Delete API Key

```http
DELETE /api/playbooks/:id/api-keys/:kid
```

---

## User API Keys (Account-level)

User API Keys provide access to ALL your playbooks, enabling AI agents to create and manage playbooks programmatically. Manage these at [Dashboard Settings](https://agentplaybooks.ai/dashboard/settings).

### List User API Keys

```http
GET /api/user/api-keys
```

### Create User API Key

```http
POST /api/user/api-keys
Content-Type: application/json

{
  "name": "Claude Desktop",
  "permissions": ["playbooks:read", "playbooks:write", "skills:write", "memory:read", "memory:write"]
}
```

**Available Permissions:**

| Permission | Description |
|------------|-------------|
| `playbooks:read` | List and view your playbooks |
| `playbooks:write` | Create, update, delete playbooks |
| `personas:write` | Add/update/delete personas |
| `skills:write` | Add/update/delete skills |
| `memory:read` | Read memory entries |
| `memory:write` | Write/delete memory entries |
| `full` | All permissions |

**Response (201):**

```json
{
  "id": "uuid",
  "key_prefix": "apb_live_xxx...",
  "name": "Claude Desktop",
  "permissions": ["playbooks:read", "playbooks:write", "skills:write", "memory:read", "memory:write"],
  "is_active": true,
  "created_at": "2024-01-15T10:00:00Z",
  "key": "apb_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "warning": "Save this key now! It will not be shown again."
}
```

### Delete User API Key

```http
DELETE /api/user/api-keys/:kid
```

---

## Management API (User API Key)

For programmatic playbook management by AI agents. See [Management API Documentation](./management-api.md) for details.

| Endpoint | Description |
|----------|-------------|
| `GET /api/manage/playbooks` | List all playbooks |
| `POST /api/manage/playbooks` | Create playbook |
| `GET /api/manage/playbooks/:id` | Get playbook with contents |
| `PUT /api/manage/playbooks/:id` | Update playbook |
| `DELETE /api/manage/playbooks/:id` | Delete playbook |
| `POST /api/manage/playbooks/:id/personas` | Add persona |
| `PUT/DELETE /api/manage/playbooks/:id/personas/:pid` | Update/Delete persona |
| `POST /api/manage/playbooks/:id/skills` | Add skill |
| `PUT/DELETE /api/manage/playbooks/:id/skills/:sid` | Update/Delete skill |
| `GET /api/manage/playbooks/:id/memory` | List/search memories |
| `GET /api/manage/playbooks/:id/memory/:key` | Get specific memory |
| `PUT /api/manage/playbooks/:id/memory/:key` | Write memory |
| `DELETE /api/manage/playbooks/:id/memory/:key` | Delete memory |
| `GET /api/manage/openapi.json` | OpenAPI specification |

**MCP Server:** `/api/mcp/manage`

---

## Skill Attachments

Skills can have file attachments for additional context (code files, docs, etc.).

### List Attachments

```http
GET /api/manage/skills/:skillId/attachments
```

### Get Attachment

```http
GET /api/manage/skills/:skillId/attachments/:attachmentId
GET /api/manage/skills/:skillId/attachments/:attachmentId?raw=true
```

### Create Attachment

```http
POST /api/manage/skills/:skillId/attachments
Content-Type: application/json

{
  "filename": "helper.py",
  "content": "def helper(): ...",
  "file_type": "python",
  "description": "Helper functions"
}
```

**Supported file types:** `typescript`, `javascript`, `python`, `go`, `rust`, `sql`, `markdown`, `json`, `yaml`, `text`, `cursorrules`, `shell`

**Limits:** 50KB per file, 10 files per skill

### Update Attachment

```http
PUT /api/manage/skills/:skillId/attachments/:attachmentId
```

### Delete Attachment

```http
DELETE /api/manage/skills/:skillId/attachments/:attachmentId
```

---

## Agent Endpoints (Legacy - API Key Required)

These legacy endpoints are maintained for backward compatibility.

```http
Authorization: Bearer apb_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Read Memory

```http
GET /api/agent/:guid/memory
GET /api/agent/:guid/memory?key=specific_key
```

### Write Memory

```http
POST /api/agent/:guid/memory
Content-Type: application/json

{
  "key": "user_preferences",
  "value": { "theme": "dark", "language": "en" }
}
```

### Delete Memory

```http
DELETE /api/agent/:guid/memory/:key
```

### Add Skill

Requires `skills:write` permission.

```http
POST /api/agent/:guid/skills
Content-Type: application/json

{
  "name": "new_skill",
  "description": "Description of the skill",
  "definition": {
    "parameters": {
      "type": "object",
      "properties": {}
    }
  },
  "examples": []
}
```

### Update Skill

```http
PUT /api/agent/:guid/skills/:id
```

### Add Persona

Requires `personas:write` permission.

```http
POST /api/agent/:guid/personas
Content-Type: application/json

{
  "name": "New Persona",
  "system_prompt": "You are a helpful assistant...",
  "metadata": {}
}
```

### Update Persona

```http
PUT /api/agent/:guid/personas/:id
```

---

## MCP Endpoints

Model Context Protocol endpoints for Claude and MCP-compatible clients.

### Get MCP Manifest

```http
GET /api/mcp/:guid
```

**Response:**

```json
{
  "protocolVersion": "2024-11-05",
  "serverInfo": {
    "name": "My AI Assistant",
    "version": "1.0.0"
  },
  "capabilities": {
    "tools": {},
    "resources": {}
  },
  "tools": [
    {
      "name": "code_review",
      "description": "Review code for issues",
      "inputSchema": { ... }
    }
  ],
  "resources": [
    {
      "uri": "playbook://abc123/memory",
      "name": "Memory",
      "mimeType": "application/json"
    }
  ]
}
```

### MCP JSON-RPC

```http
POST /api/mcp/:guid
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list",
  "params": {}
}
```

**Supported Methods:**

| Method | Description |
|--------|-------------|
| `initialize` | Initialize MCP connection |
| `tools/list` | List available tools |
| `resources/list` | List available resources |
| `resources/read` | Read a resource |
| `tools/call` | Call a tool (limited) |

---

## Public Repository

### Browse Skills

```http
GET /api/public/skills
GET /api/public/skills?tags=coding,automation
GET /api/public/skills?search=code+review
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `tags` | string | Comma-separated tags to filter by |
| `search` | string | Search in name and description |

**Response:**

```json
[
  {
    "id": "uuid",
    "name": "Code Reviewer",
    "description": "Reviews code for bugs and improvements",
    "tags": ["coding", "review"],
    "usage_count": 1234,
    "is_verified": true
  }
]
```

### Get Skill Details

```http
GET /api/public/skills/:id
```

### Browse MCP Servers

```http
GET /api/public/mcp
GET /api/public/mcp?tags=database,automation
```

### Get MCP Server Details

```http
GET /api/public/mcp/:id
```

---

## Health Check

```http
GET /api/health
```

**Response:**

```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:00:00.000Z"
}
```

---

## Error Responses

All endpoints return consistent error responses:

```json
{
  "error": "Error message here"
}
```

**HTTP Status Codes:**

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request - Invalid parameters |
| 401 | Unauthorized - Invalid or missing authentication |
| 403 | Forbidden - No permission for this resource |
| 404 | Not Found - Resource doesn't exist or is private |
| 500 | Internal Server Error |

---

## Rate Limits

| Endpoint Type | Limit |
|---------------|-------|
| Public reads | 100 requests/minute/IP |
| Authenticated reads | 200 requests/minute/user |
| Agent writes | 60 requests/minute/API key |
| MCP endpoints | 100 requests/minute/IP |

Rate limit headers are included in responses:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1705312800
```

---

## Endpoint Summary

### Playbook CRUD

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/playbooks` | JWT | List user's playbooks |
| `POST` | `/api/playbooks` | JWT | Create playbook |
| `GET` | `/api/playbooks/:guid` | Public* | Get playbook (format param) |
| `PUT` | `/api/playbooks/:id` | JWT | Update playbook |
| `DELETE` | `/api/playbooks/:id` | JWT | Delete playbook |

### Personas, Skills, Memory

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET/POST` | `/api/playbooks/:id/personas` | JWT/Public* | List/Create personas |
| `PUT/DELETE` | `/api/playbooks/:id/personas/:pid` | JWT | Update/Delete persona |
| `GET/POST` | `/api/playbooks/:id/skills` | JWT/Public* | List/Create skills |
| `PUT/DELETE` | `/api/playbooks/:id/skills/:sid` | JWT | Update/Delete skill |
| `GET` | `/api/playbooks/:guid/memory` | Public* | Read memory |
| `PUT` | `/api/playbooks/:guid/memory/:key` | API Key/JWT | Write memory |
| `DELETE` | `/api/playbooks/:guid/memory/:key` | API Key/JWT | Delete memory |

### API Keys

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/playbooks/:id/api-keys` | JWT | List playbook API keys |
| `POST` | `/api/playbooks/:id/api-keys` | JWT | Create playbook API key |
| `DELETE` | `/api/playbooks/:id/api-keys/:kid` | JWT | Delete playbook API key |
| `GET` | `/api/user/api-keys` | JWT | List user API keys |
| `POST` | `/api/user/api-keys` | JWT | Create user API key |
| `DELETE` | `/api/user/api-keys/:kid` | JWT | Delete user API key |

### Management API (AI Automation)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/manage/playbooks` | User Key | List all playbooks |
| `POST` | `/api/manage/playbooks` | User Key | Create playbook |
| `GET` | `/api/manage/playbooks/:id` | User Key | Get playbook with all contents |
| `PUT` | `/api/manage/playbooks/:id` | User Key | Update playbook |
| `DELETE` | `/api/manage/playbooks/:id` | User Key | Delete playbook |
| `POST` | `/api/manage/playbooks/:id/personas` | User Key | Add persona |
| `PUT/DELETE` | `/api/manage/playbooks/:id/personas/:pid` | User Key | Update/Delete persona |
| `POST` | `/api/manage/playbooks/:id/skills` | User Key | Add skill |
| `PUT/DELETE` | `/api/manage/playbooks/:id/skills/:sid` | User Key | Update/Delete skill |
| `GET` | `/api/manage/playbooks/:id/memory` | User Key | List/search memories |
| `GET` | `/api/manage/playbooks/:id/memory/:key` | User Key | Get specific memory |
| `PUT` | `/api/manage/playbooks/:id/memory/:key` | User Key | Write memory with tags |
| `DELETE` | `/api/manage/playbooks/:id/memory/:key` | User Key | Delete memory |
| `GET` | `/api/manage/openapi.json` | None | OpenAPI specification |
| `GET/POST` | `/api/mcp/manage` | User Key | Management MCP Server |

### Skill Attachments

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/manage/skills/:sid/attachments` | Public*/User Key | List attachments |
| `GET` | `/api/manage/skills/:sid/attachments/:aid` | Public*/User Key | Get attachment |
| `POST` | `/api/manage/skills/:sid/attachments` | User Key | Upload attachment |
| `PUT` | `/api/manage/skills/:sid/attachments/:aid` | User Key | Update attachment |
| `DELETE` | `/api/manage/skills/:sid/attachments/:aid` | User Key | Delete attachment |

### Public Repository & MCP

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/public/skills` | None | Browse public skills |
| `GET` | `/api/public/mcp` | None | Browse public MCP servers |
| `GET` | `/api/public/playbooks` | None | Browse public playbooks |
| `GET/POST` | `/api/mcp/:guid` | Public* | Playbook MCP Server |
| `GET` | `/api/health` | None | Health check |

**Notes:**
- *Public endpoints work without auth for public playbooks, or with JWT for private playbooks you own.
- **User Key** = User API Key (created at /dashboard/settings)
- **API Key** = Playbook-specific API Key
