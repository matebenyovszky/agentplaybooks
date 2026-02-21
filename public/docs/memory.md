# Memory

Memory is a persistent, hierarchical storage system that AI agents can read from and write to. It enables agents to maintain context across sessions, manage complex task plans, and share information between AI platforms.

## Memory Tiers

Memory uses a 3-tier hierarchy inspired by human memory:

| Tier | Purpose | Default Priority |
|------|---------|-----------------|
| **working** | Active scratch pad for current tasks | Highest |
| **contextual** | Background context and recent information (default) | Medium |
| **longterm** | Archived knowledge and completed work | Lowest |

## Memory Types

- **flat** (default) — Simple key-value pairs for facts, preferences, and state
- **hierarchical** — Task graphs with parent-child relationships and status tracking

## Use Cases

### Simple Memory (Flat)

Store facts, preferences, and context:

```json
PUT /api/playbooks/:guid/memory/user_profile
{
  "value": {
    "name": "John Smith",
    "role": "Senior Developer",
    "preferences": { "language": "TypeScript" }
  },
  "tier": "contextual",
  "tags": ["profile", "preferences"]
}
```

### Task Graphs (Hierarchical)

Create multi-step task plans that agent swarms can work on in parallel:

```json
// Via MCP tool: create_task_graph
{
  "plan_key": "refactor-auth",
  "plan_summary": "Refactor authentication to use JWT",
  "tasks": [
    { "key": "research", "description": "Research JWT best practices" },
    { "key": "implement", "description": "Implement JWT middleware", "depends_on": ["research"] },
    { "key": "test", "description": "Write integration tests", "depends_on": ["implement"] }
  ]
}
```

Each task gets its own memory node with status tracking (`pending` → `running` → `completed`). When all children complete, the parent auto-completes.

## Reading Memory

### Via API (All Memories)

```bash
GET /api/playbooks/:guid/memory
GET /api/playbooks/:guid/memory?tier=working
GET /api/playbooks/:guid/memory?memory_type=hierarchical
```

### Via API (Specific Key)

```bash
GET /api/playbooks/:guid/memory?key=user_profile
```

## Writing Memory

Writing requires an API key with `memory:write` permission.

### Set/Update a Value

```bash
PUT /api/playbooks/:guid/memory/:key
Authorization: Bearer apb_live_xxx
Content-Type: application/json

{
  "value": { "name": "Updated Name" },
  "tier": "working",
  "priority": 80,
  "tags": ["important"],
  "summary": "Updated user profile",
  "memory_type": "flat",
  "status": null,
  "parent_key": null,
  "metadata": {}
}
```

### Delete a Value

```bash
DELETE /api/playbooks/:guid/memory/:key
Authorization: Bearer apb_live_xxx
```

## MCP Memory Tools

When using AgentPlaybooks via MCP, these tools are available:

| Tool | Description |
|------|-------------|
| `read_memory` | Read a specific memory by key |
| `search_memory` | Search by text, tags, tier, type, status |
| `write_memory` | Write a memory with tier, priority, parent_key, status |
| `delete_memory` | Delete a memory entry |
| `create_task_graph` | Create a full task plan with subtasks |
| `update_task_status` | Update task status (auto-completes parent) |
| `consolidate_memories` | Combine related memories into a parent |
| `promote_memory` | Move to higher tier or boost priority |
| `get_memory_context` | Context-optimized view across tiers |
| `archive_memories` | Move memories to longterm tier |
| `get_memory_tree` | Visualize hierarchical structure |

## Memory Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `key` | string | required | Unique identifier |
| `value` | JSON | required | Stored data |
| `tags` | string[] | `[]` | Categorization tags |
| `description` | string | null | Human-readable description |
| `tier` | working/contextual/longterm | contextual | Memory hierarchy level |
| `priority` | 1-100 | 50 | Importance ranking |
| `parent_key` | string | null | Parent memory for hierarchy |
| `summary` | string | null | Compact text summary |
| `memory_type` | flat/hierarchical | flat | Memory structure type |
| `status` | pending/running/completed/failed/blocked | null | Task status |
| `metadata` | JSON | `{}` | Graph data: dependencies, progress |

## Best Practices

1. **Use tiers intentionally** — `working` for active tasks, `longterm` for archives
2. **Keep keys descriptive** — `user_profile` vs `data1`
3. **Use tags for cross-cutting search** — `["auth", "security"]`
4. **Consolidate when context grows** — Use `consolidate_memories` to merge
5. **Set summaries** — Enables efficient `get_memory_context` views
6. **Use task graphs for complex work** — `create_task_graph` manages the structure

## Security

- Memory is **public read** by default for public playbooks
- Memory is **private** for non-public playbooks
- **Write operations always require API key**
- API keys are hashed before storage
- Keys can have granular permissions
