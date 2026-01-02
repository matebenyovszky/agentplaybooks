# Memory

Memory is a persistent key-value storage system that AI agents can read from and write to. It enables agents to maintain context across sessions and share information between different AI platforms.

## What is Memory?

Memory in AgentPlaybooks is:

- **Persistent** - Data survives across sessions
- **Key-Value** - Simple, flexible storage model
- **JSON** - Values are stored as structured JSON
- **Scoped** - Each playbook has its own memory namespace
- **Secure** - API key authentication for write operations

## Use Cases

### Personal Information

Store information about yourself that AI agents should know:

```json
{
  "user_profile": {
    "name": "John Smith",
    "role": "Senior Developer",
    "company": "TechCorp",
    "preferences": {
      "language": "TypeScript",
      "framework": "React",
      "style": "functional"
    }
  }
}
```

### Project Context

Share project details across AI platforms:

```json
{
  "current_project": {
    "name": "E-commerce Platform",
    "stack": ["Next.js", "Supabase", "Stripe"],
    "conventions": {
      "naming": "camelCase",
      "testing": "Jest + React Testing Library",
      "commits": "Conventional Commits"
    }
  }
}
```

### Conversation History

Enable AI agents to remember previous interactions:

```json
{
  "conversation_summary": {
    "last_topic": "API authentication refactoring",
    "decisions_made": [
      "Use JWT with refresh tokens",
      "Store tokens in httpOnly cookies"
    ],
    "pending_tasks": [
      "Implement token rotation",
      "Add rate limiting"
    ]
  }
}
```

## Reading Memory

### Via Web Interface

Navigate to your playbook dashboard to view and edit memory entries.

### Via API (Public Read)

```bash
GET /api/playbooks/:guid/memory
```

Response:
```json
{
  "user_profile": { "name": "John Smith", ... },
  "current_project": { ... },
  "conversation_summary": { ... }
}
```

### Via API (Specific Key)

```bash
GET /api/playbooks/:guid/memory/:key
```

## Writing Memory

Writing requires an API key with `memory:write` permission.

### Set/Update a Value

```bash
PUT /api/playbooks/:guid/memory/:key
Authorization: Bearer apb_live_xxx
Content-Type: application/json

{
  "value": {
    "name": "Updated Name",
    "role": "Lead Developer"
  }
}
```

### Delete a Value

```bash
DELETE /api/playbooks/:guid/memory/:key
Authorization: Bearer apb_live_xxx
```

### Append to Array

```bash
POST /api/playbooks/:guid/memory/:key/append
Authorization: Bearer apb_live_xxx
Content-Type: application/json

{
  "item": "New task to add to pending_tasks array"
}
```

## AI Agent Integration

### Claude (via System Prompt)

```
You have access to a memory system. At the start of each conversation:
1. Fetch memory from https://agentplaybooks.ai/api/playbooks/YOUR_GUID/memory
2. Use the context to personalize responses
3. After important decisions, update memory via PUT request
```

### ChatGPT (via GPT Actions)

Configure a GPT Action with the OpenAPI spec from:
```
https://agentplaybooks.ai/api/playbooks/YOUR_GUID?format=openapi
```

### Custom Agents

```python
import requests

class AgentPlaybooksMemory:
    def __init__(self, guid, api_key=None):
        self.base_url = f"https://agentplaybooks.ai/api/playbooks/{guid}"
        self.api_key = api_key
    
    def read(self, key=None):
        url = f"{self.base_url}/memory"
        if key:
            url += f"/{key}"
        return requests.get(url).json()
    
    def write(self, key, value):
        if not self.api_key:
            raise ValueError("API key required for write operations")
        return requests.put(
            f"{self.base_url}/memory/{key}",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={"value": value}
        )

# Usage
memory = AgentPlaybooksMemory("your-guid", "apb_live_xxx")
profile = memory.read("user_profile")
memory.write("last_session", {"timestamp": "2026-01-02", "topic": "Memory docs"})
```

## Memory Limits

| Plan | Keys per Playbook | Value Size | Total Storage |
|------|-------------------|------------|---------------|
| Free | 100 | 64 KB | 1 MB |
| Pro | 1,000 | 256 KB | 10 MB |
| Enterprise | Unlimited | 1 MB | 100 MB |

## Best Practices

1. **Structure your data** - Use nested objects for organization
2. **Keep keys descriptive** - `user_profile` vs `data1`
3. **Avoid sensitive data** - Don't store passwords or API keys
4. **Version important data** - Include timestamps for history
5. **Clean up regularly** - Delete outdated entries
6. **Use arrays for lists** - Easier to append/manage

## Security

- Memory is **public read** by default for public playbooks
- Memory is **private** for non-public playbooks
- **Write operations always require API key**
- API keys are hashed before storage
- Keys can have granular permissions

