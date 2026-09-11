# Memory

Memory is a persistent, hierarchical storage system that AI agents can read from and write to. It enables agents to maintain context across sessions, manage complex task plans, and share information between AI platforms.

## Memory Tiers

Memory uses a 3-tier hierarchy inspired by human memory:

| Tier | Purpose | Default Priority |
|------|---------|-----------------|
| **working** | Active scratch pad for current tasks | Highest |
| **contextual** | Background context and recent information (default) | Medium |
| **longterm** | Durable knowledge and completed work | Lowest |

Tier and archive status are independent. An active long-term memory is still searchable; an archived memory is hidden from normal search and context.

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

### Via API (Search and List)

```bash
GET /api/playbooks/:guid/memory
GET /api/playbooks/:guid/memory?tier=working
GET /api/playbooks/:guid/memory?memory_type=hierarchical
GET /api/playbooks/:guid/memory?search=coffee&limit=50&offset=0
GET /api/playbooks/:guid/memory?after=2026-09-01T00:00:00Z&before=2026-09-30T23:59:59Z
```

Search covers keys, full JSON values, descriptions and summaries. It is case-insensitive and treats search text literally, including `%` and `_`. Tag filters match any requested tag. Results default to the latest 100 **current, non-archived** entries, ordered by `memory_at` descending; `limit` accepts 1–200 and `offset` enables pagination. `after` and `before` are inclusive bounds on `memory_at` and require an ISO timestamp with a timezone. REST includes children by default; MCP `search_memory` defaults to root entries (`include_children: true` includes children).

The migration adds playbook/time indexes on both storage engines. Standard Postgres heap tables also get trigram search indexes; OrioleDB uses the same literal search semantics with the supported B-tree filters, without changing the existing storage engine.

### Via API (Specific Key)

```bash
GET /api/playbooks/:guid/memory?key=user_profile
```

A direct key read returns the current entry even if it is archived. Other searches return an array.

## Memory Time

`memory_at` is the single writable memory timestamp. Supply it when the memory refers to a specific time; omit it when writing a value to use the time of saving. Reads return it, and the editor displays it in local time. Archive-only and administrative changes preserve it. Context such as confidence, source or additional dates belongs in the JSON value if the agent needs it.

```json
{
  "value": { "location": "hallway drawer" },
  "memory_at": "2026-09-11T10:21:00+02:00"
}
```

Existing entries receive their previous `updated_at` as `memory_at` during migration. History starts when the migration is applied; past overwritten values cannot be recovered.

## Archive and History

Content edits save the previous version automatically in the same database transaction. Reading a memory or changing only its tier, priority or archive status does not generate a revision. Explicit changes to `memory_at` do. The entry keeps its identity, and history is linked to it.

```text
GET /api/playbooks/:guid/memory?scope=archived&search=drawer
GET /api/playbooks/:guid/memory?scope=all&search=drawer
GET /api/playbooks/:guid/memory?history_key=user_profile
```

- `scope=active` (default): current, non-archived entries.
- `scope=archived`: manually archived entries **and** previous versions.
- `scope=all`: both groups.
- `history_key`: previous versions of one entry, identified by its current key. Do not combine with `key` or `id`.

Search results include `memory_id` (the original entry) and `history_id` (null for a current entry, a revision ID for a previous version). Scope searches are ordered by memory time; per-entry history is ordered by the saved versions' update times. History follows the same playbook read permissions as current memory. Archiving is not a privacy boundary.

Use the editor's **Archive**, **Memory history** and **Restore this version** actions to maintain entries. MCP clients can archive selected keys with `archive_memories`, inspect versions with `get_memory_history`, and restore a version by writing its contents and original `memory_at` to the current key with `is_archived: false`. This also saves the replaced contents as history. `promote_memory` restores visibility without replacing the contents.

The management API accepts an archive-only change without resending the value:

```text
PUT /api/manage/playbooks/:id/memory/:key
{ "is_archived": true }
```

The public key write endpoint and MCP `write_memory` require `value`; they also accept `is_archived`. A permanent delete removes the entry **and its history**. Use archive to keep both.

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
| `search_memory` | Search by text, tags, tier, type, status, memory time and archive scope |
| `get_memory_history` | Read the previous versions of one current key |
| `write_memory` | Write a value with optional memory time and archive status; preserve previous contents |
| `delete_memory` | Permanently delete a memory entry and its history |
| `create_task_graph` | Create a full task plan with subtasks |
| `update_task_status` | Update task status (auto-completes parent) |
| `consolidate_memories` | Combine related memories into a parent |
| `promote_memory` | Move to higher tier or boost priority |
| `get_memory_context` | Context-optimized view across tiers |
| `archive_memories` | Hide memories from normal search/context and move to longterm tier |
| `get_memory_tree` | Visualize hierarchical structure |

## Memory Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `key` | string | required | Unique identifier |
| `value` | JSON | required | Stored data |
| `memory_at` | ISO timestamp with timezone | save time | Time represented by this memory; returned and searchable |
| `is_archived` | boolean | false | Hidden from default searches and context; retained for explicit reads |
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

1. **Use tiers intentionally** — `working` for active tasks, `longterm` for durable knowledge; archive status controls visibility
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
