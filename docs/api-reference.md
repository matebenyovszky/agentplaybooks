# API Reference

Complete reference for all AgentPlaybooks API endpoints.

## Base URL

```
https://agentplaybooks.com/api
```

For self-hosted instances, replace with your domain.

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
| `format` | string | `json` | Output format: `json`, `openapi`, `mcp`, `markdown` |

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

**Response (Markdown):**

Returns a human-readable Markdown document.

### Get Personas

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

### Get Skills

```http
GET /api/playbooks/:guid/skills
```

**Response:**

```json
[
  {
    "id": "uuid",
    "name": "code_review",
    "description": "Review code for issues",
    "definition": {
      "parameters": {
        "type": "object",
        "properties": {
          "code": { "type": "string" }
        }
      }
    },
    "examples": []
  }
]
```

---

## Agent Endpoints (API Key Required)

These endpoints require a valid API key in the Authorization header.

```http
Authorization: Bearer apb_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Read Memory

```http
GET /api/agent/:guid/memory
GET /api/agent/:guid/memory?key=specific_key
```

**Response:**

```json
[
  {
    "key": "user_preferences",
    "value": { "theme": "dark" },
    "updated_at": "2024-01-15T10:30:00Z"
  }
]
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

**Response:**

```json
{
  "id": "uuid",
  "playbook_id": "uuid",
  "key": "user_preferences",
  "value": { "theme": "dark", "language": "en" },
  "updated_at": "2024-01-15T10:30:00Z"
}
```

**Note:** If the key already exists, it will be updated (upsert behavior).

### Delete Memory

```http
DELETE /api/agent/:guid/memory/:key
```

**Response:**

```json
{ "success": true }
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
Content-Type: application/json

{
  "description": "Updated description"
}
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
Content-Type: application/json

{
  "system_prompt": "Updated system prompt..."
}
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

### Browse MCP Servers

```http
GET /api/public/mcp
GET /api/public/mcp?tags=database,automation
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
| 400 | Bad Request - Invalid parameters |
| 401 | Unauthorized - Invalid or missing API key |
| 403 | Forbidden - API key doesn't match playbook |
| 404 | Not Found - Playbook doesn't exist or is private |
| 500 | Internal Server Error |

---

## Rate Limits

| Endpoint Type | Limit |
|---------------|-------|
| Public reads | 100 requests/minute/IP |
| Agent writes | 60 requests/minute/API key |
| MCP endpoints | 100 requests/minute/IP |

Rate limit headers are included in responses:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1705312800
```

