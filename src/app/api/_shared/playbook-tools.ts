import type { McpTool } from "@/lib/supabase/types";
import {
  DESTRUCTIVE_CLOSED,
  IDEMPOTENT_WRITE_CLOSED,
  OPEN_WORLD_CALL,
  OPEN_WORLD_READ,
  READ_CLOSED,
  WRITE_CLOSED,
  canvasListOutputSchema,
  canvasTocOutputSchema,
  findToolsOutputSchema,
  memoryContextOutputSchema,
  memoryRecordOutputSchema,
  memoryTreeOutputSchema,
  secretListOutputSchema,
  skillListOutputSchema,
  skillRecordOutputSchema,
} from "@/app/api/_shared/mcp-tool-hints";

export const PLAYBOOK_TOOLS: McpTool[] = [
  {
    name: "find_tools",
    title: "Find tools",
    description: "Search this playbook's complete tool catalog by keyword: the built-in playbook tools (memory, skills, canvas, workflow runs, secrets) and every connected server's federated tools (names like supabase__execute_sql or cloudflare__search). Matches against tool names and descriptions; a name match ranks above a description match. Returns up to `limit` (default 10, max 25) entries with name, description, and full input schema. Every returned tool can be called directly by name even when it is absent from tools/list — the advertised list is a view, not a boundary, unless this connection was pinned with ?toolset=. Read-only and free of side effects. Use this when the tool you need is not in your current list, before concluding a capability is missing.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Keywords to match against tool names and descriptions, e.g. 'sql tables' or 'archive memory'" },
        limit: { type: "number", description: "Maximum matches to return (default 10, max 25)" },
      },
      required: ["query"],
    },
    outputSchema: findToolsOutputSchema,
    annotations: READ_CLOSED,
  },
  {
    name: "list_skills",
    title: "List skills",
    description: "List every skill currently attached to this playbook, returning id, name, description, content, licence, and priority ordered by priority descending. Read-only; it does not create or change skills. Use this to discover skill_id values before get_skill, update_skill, or delete_skill. Do not use list_skill_versions, which lists historical revisions of a single skill, or get_playbook, which only summarizes skills.",
    inputSchema: { type: "object", properties: {} },
    outputSchema: skillListOutputSchema,
    annotations: READ_CLOSED,
  },
  {
    name: "get_skill",
    title: "Get skill",
    description: "Return the full definition of one skill in this playbook, including name, description, content, priority, and attachments. Identify the skill with skill_id, which may be a UUID or the skill's kebab-case name. This lookup does not modify the skill. Use list_skills first to discover IDs and names. Do not use list_skill_versions (historical revisions) or get_playbook (persona and summaries, not full skill content).",
    inputSchema: {
      type: "object",
      properties: {
        skill_id: { type: "string", description: "Skill ID or name" },
      },
      required: ["skill_id"],
    },
    outputSchema: skillRecordOutputSchema,
    annotations: READ_CLOSED,
  },
  {
    name: "read_memory",
    title: "Read memory",
    description: "Read one memory entry by key and return its value, tags, tier, summary, and metadata. This is not a pure read: it increments access_count and updates last_accessed_at as a side effect, without changing the stored value. There is no update_memory; use write_memory to overwrite a key. Use search_memory to find keys, get_memory_context for a tiered summary, or get_memory_tree for hierarchical task graphs. Do not pass memory_type; that filter belongs to search_memory.",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string", description: "Memory key to read" },
      },
      required: ["key"],
    },
    outputSchema: memoryRecordOutputSchema,
    annotations: WRITE_CLOSED,
  },
  {
    name: "search_memory",
    title: "Search memory",
    description: "Search memories by text, tags, tier, or type. Returns summaries for large memories. Use tags for categorical search; use tier to focus on active vs archived data; use memory_type to find task graphs. Read-only aside from returning matches; it does not write entries. Use read_memory for one key, get_memory_context for a compact tiered view, and get_memory_tree for parent-child task graphs.",
    inputSchema: {
      type: "object",
      properties: {
        search: { type: "string", description: "Search in keys, descriptions, and summaries" },
        tags: { type: "array", items: { type: "string" }, description: "Filter by tags (any match)" },
        tier: { type: "string", enum: ["working", "contextual", "longterm"], description: "Filter by memory tier" },
        memory_type: { type: "string", enum: ["flat", "hierarchical"], description: "Filter by memory type" },
        status: { type: "string", enum: ["pending", "running", "completed", "failed", "blocked"], description: "Filter by task status (hierarchical only)" },
        include_children: { type: "boolean", description: "Include child memories in results", default: false },
      },
    },
    annotations: READ_CLOSED,
  },
  {
    name: "write_memory",
    title: "Write memory",
    description: "Create or overwrite a memory entry by key. There is no separate update_memory; a second write to the same key replaces the previous value and cannot be undone. Use tier='working' for active tasks, 'contextual' for background context, 'longterm' for completed work. Set memory_type='hierarchical' and parent_key to build task graphs. Requires memory:write or full permission. Use delete_memory to remove a key, archive_memories to move it to longterm without deleting, and read_memory to fetch without replacing.",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string", description: "Memory key" },
        value: { type: "object", description: "Value to store" },
        tags: { type: "array", items: { type: "string" }, description: "Tags for categorization" },
        description: { type: "string", description: "Human-readable description" },
        tier: { type: "string", enum: ["working", "contextual", "longterm"], description: "Memory tier (default: contextual)" },
        priority: { type: "number", description: "Priority 1-100 (default: 50)" },
        parent_key: { type: "string", description: "Parent memory key for hierarchical organization" },
        summary: { type: "string", description: "Compact summary for context views" },
        memory_type: { type: "string", enum: ["flat", "hierarchical"], description: "flat (default) or hierarchical for task graphs" },
        status: { type: "string", enum: ["pending", "running", "completed", "failed", "blocked"], description: "Task status (for hierarchical task tracking)" },
        metadata: { type: "object", description: "Graph metadata: dependencies, thread assignment, progress, etc." },
      },
      required: ["key", "value"],
    },
    annotations: DESTRUCTIVE_CLOSED,
  },
  {
    name: "delete_memory",
    title: "Delete memory",
    description: "Permanently delete one memory entry by key from this playbook. The row is removed from storage, not moved to another tier, and cannot be recovered. Requires a credential with memory:write or full permission. Use archive_memories to keep the entry in the longterm tier, or consolidate_memories to retain child detail under a parent summary. Do not call this when you only want to hide completed work.",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string", description: "Memory key to delete" },
      },
      required: ["key"],
    },
    annotations: DESTRUCTIVE_CLOSED,
  },
  {
    name: "consolidate_memories",
    title: "Consolidate memories",
    description: "Consolidate related memories under a new parent memory with a summary. Child rows stay readable; by default they are archived to the longterm tier rather than deleted. Requires memory:write or full permission. Use delete_memory only when a key should be destroyed, and archive_memories to move entries to longterm without creating a parent.",
    inputSchema: {
      type: "object",
      properties: {
        memory_keys: { type: "array", items: { type: "string" }, description: "Keys of memories to consolidate" },
        parent_key: { type: "string", description: "New parent memory key" },
        summary: { type: "string", description: "Summary of consolidated memories" },
        parent_tags: { type: "array", items: { type: "string" }, description: "Tags for parent memory" },
        archive_children: { type: "boolean", description: "Move children to longterm tier", default: true },
      },
      required: ["memory_keys", "parent_key", "summary"],
    },
    annotations: WRITE_CLOSED,
  },
  {
    name: "promote_memory",
    title: "Promote memory",
    description: "Promote a memory to a higher tier or boost its priority for active use. This tool cannot demote; use archive_memories to move working or contextual entries to longterm. Repeating the call with priority_boost increases priority again. Requires memory:write or full permission.",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string", description: "Memory key to promote" },
        target_tier: { type: "string", enum: ["working", "contextual"], description: "Target tier (cannot demote with this tool)" },
        priority_boost: { type: "number", description: "Amount to increase priority (0-50)", default: 10 },
      },
      required: ["key"],
    },
    annotations: WRITE_CLOSED,
  },
  {
    name: "get_memory_context",
    title: "Get memory context",
    description: "Get a context-optimized view of memories: full working memory, summaries for contextual, and keys only for longterm. Read-only. Use this to pack a prompt; use read_memory for one key, search_memory to filter, and get_memory_tree for parent-child task graphs.",
    inputSchema: {
      type: "object",
      properties: {
        include_tiers: {
          type: "array",
          items: { type: "string", enum: ["working", "contextual", "longterm"] },
          description: "Tiers to include (default: working, contextual)"
        },
        max_items: { type: "number", description: "Maximum items per tier", default: 20 },
        expand_keys: { type: "array", items: { type: "string" }, description: "Keys to show full content regardless of tier" },
        tags_filter: { type: "array", items: { type: "string" }, description: "Only include memories with these tags" },
      },
    },
    outputSchema: memoryContextOutputSchema,
    annotations: READ_CLOSED,
  },
  {
    name: "archive_memories",
    title: "Archive memories",
    description: "Archive memories from the working or contextual tier into longterm. Entries are kept, not deleted; filters (keys, tags, from_tier, older_than_hours) combine as AND. Requires memory:write or full permission. Use delete_memory for irreversible removal, promote_memory to move a key the other way, and consolidate_memories when you also want a parent summary.",
    inputSchema: {
      type: "object",
      properties: {
        keys: { type: "array", items: { type: "string" }, description: "Specific keys to archive" },
        older_than_hours: { type: "number", description: "Archive memories older than X hours" },
        from_tier: { type: "string", enum: ["working", "contextual"], description: "Only archive from this tier" },
        tags: { type: "array", items: { type: "string" }, description: "Only archive memories with these tags" },
        generate_summaries: { type: "boolean", description: "Auto-generate summaries if missing", default: false },
      },
    },
    annotations: IDEMPOTENT_WRITE_CLOSED,
  },
  {
    name: "get_memory_tree",
    title: "Get memory tree",
    description: "Get a hierarchical tree of memories showing parent-child relationships and per-node status. Read-only. Use this to visualize task graphs; use search_memory to filter flat lists, get_memory_context for a tiered prompt view, and read_memory for a single key's full value.",
    inputSchema: {
      type: "object",
      properties: {
        root_key: { type: "string", description: "Start from this key (omit for all roots)" },
        max_depth: { type: "number", description: "Maximum tree depth", default: 3 },
        include_values: { type: "boolean", description: "Include full values (false = summaries only)", default: false },
      },
    },
    outputSchema: memoryTreeOutputSchema,
    annotations: READ_CLOSED,
  },
  {
    name: "create_task_graph",
    title: "Create task graph",
    description: "Create a hierarchical task plan in one call: a parent plan memory plus a child node per subtask. Upserts by key, so repeating the same plan_key overwrites the previous graph. Requires memory:write or full permission. Use write_memory for a single node, update_task_status to move a node through pending/running/completed, and get_memory_tree to inspect the graph.",
    inputSchema: {
      type: "object",
      properties: {
        plan_key: { type: "string", description: "Key for the root plan memory" },
        plan_summary: { type: "string", description: "High-level summary of the entire plan" },
        tasks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              key: { type: "string", description: "Task key (will be prefixed with plan_key/)" },
              description: { type: "string", description: "What this task does" },
              value: { type: "object", description: "Task data (instructions, params, etc.)" },
              depends_on: { type: "array", items: { type: "string" }, description: "Keys of tasks this depends on" },
              tags: { type: "array", items: { type: "string" }, description: "Task tags" },
            },
            required: ["key", "description"],
          },
          description: "List of subtasks to create",
        },
        tags: { type: "array", items: { type: "string" }, description: "Tags for the plan" },
      },
      required: ["plan_key", "plan_summary", "tasks"],
    },
    annotations: DESTRUCTIVE_CLOSED,
  },
  {
    name: "update_task_status",
    title: "Update task status",
    description: "Update the status of a task node in a hierarchical plan. When all children of a parent are completed, the parent is auto-updated. Returns the current subtree state. Requires memory:write or full permission. Use create_task_graph to build the plan, not this tool.",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string", description: "Task memory key to update" },
        status: { type: "string", enum: ["pending", "running", "completed", "failed", "blocked"], description: "New status" },
        result: { type: "object", description: "Task result data to store in value" },
        summary: { type: "string", description: "Updated summary with results" },
      },
      required: ["key", "status"],
    },
    annotations: IDEMPOTENT_WRITE_CLOSED,
  },
  {
    name: "list_canvas",
    title: "List canvas documents",
    description: "List canvas documents in a workflow run. Canvas documents are collaborative markdown files that multiple agents can edit in parallel. Omit run_id to list documents across all runs. Read-only. Use read_canvas for content and get_canvas_toc for section IDs. There is no get_run; list_runs returns run records.",
    inputSchema: {
      type: "object",
      properties: {
        run_id: { type: "string", description: "Workflow run UUID. Omit to list documents across all runs." },
      },
    },
    outputSchema: canvasListOutputSchema,
    annotations: READ_CLOSED,
  },
  {
    name: "read_canvas",
    title: "Read canvas document",
    description: "Read a canvas document. Returns full content, sections structure, and metadata. Optionally read a specific section by ID. Read-only. Use get_canvas_toc to discover section IDs before patch_canvas_section, and list_canvas to find slugs.",
    inputSchema: {
      type: "object",
      properties: {
        run_id: { type: "string", description: "Workflow run UUID" },
        slug: { type: "string", description: "Document slug" },
        section_id: { type: "string", description: "Optional: read only this section" },
      },
      required: ["run_id", "slug"],
    },
    annotations: READ_CLOSED,
  },
  {
    name: "write_canvas",
    title: "Write canvas document",
    description: "Create or fully replace a canvas document. Markdown headings are auto-parsed into sections for parallel editing. A replace overwrites prior content and cannot be undone. Requires canvas:write or full permission. Use patch_canvas_section for partial updates and lock_canvas_section before multi-agent edits.",
    inputSchema: {
      type: "object",
      properties: {
        run_id: { type: "string", description: "Workflow run UUID" },
        slug: { type: "string", description: "URL-friendly document identifier" },
        name: { type: "string", description: "Document title" },
        content: { type: "string", description: "Full markdown content" },
        metadata: { type: "object", description: "Custom document metadata" },
      },
      required: ["run_id", "slug", "name", "content"],
    },
    annotations: DESTRUCTIVE_CLOSED,
  },
  {
    name: "patch_canvas_section",
    title: "Patch canvas section",
    description: "Edit a specific section of a canvas document. Parallel-safe: only the targeted section is updated. Requires canvas:write or full permission. Lock the section first in multi-agent scenarios. Use write_canvas only when replacing the whole document, and get_canvas_toc to obtain section_id.",
    inputSchema: {
      type: "object",
      properties: {
        run_id: { type: "string", description: "Workflow run UUID" },
        slug: { type: "string", description: "Document slug" },
        section_id: { type: "string", description: "Section ID from get_canvas_toc" },
        content: { type: "string", description: "New section content (markdown)" },
        heading: { type: "string", description: "Optional: new heading text" },
      },
      required: ["run_id", "slug", "section_id", "content"],
    },
    annotations: IDEMPOTENT_WRITE_CLOSED,
  },
  {
    name: "get_canvas_toc",
    title: "Canvas table of contents",
    description: "Get the table of contents for a canvas document. Returns section IDs, headings, and levels for navigation and patch_canvas_section. Read-only. Use read_canvas for full markdown and list_canvas to discover slugs.",
    inputSchema: {
      type: "object",
      properties: {
        run_id: { type: "string", description: "Workflow run UUID" },
        slug: { type: "string", description: "Document slug" },
      },
      required: ["run_id", "slug"],
    },
    outputSchema: canvasTocOutputSchema,
    annotations: READ_CLOSED,
  },
  {
    name: "lock_canvas_section",
    title: "Lock canvas section",
    description: "Lock a section for exclusive editing so other agents cannot modify it. Requires canvas:write or full permission. Always unlock_canvas_section when finished. Do not use this to edit content; pair it with patch_canvas_section.",
    inputSchema: {
      type: "object",
      properties: {
        run_id: { type: "string", description: "Workflow run UUID" },
        slug: { type: "string", description: "Document slug" },
        section_id: { type: "string", description: "Section ID to lock" },
        locked_by: { type: "string", description: "Agent identifier" },
      },
      required: ["run_id", "slug", "section_id", "locked_by"],
    },
    annotations: IDEMPOTENT_WRITE_CLOSED,
  },
  {
    name: "unlock_canvas_section",
    title: "Unlock canvas section",
    description: "Unlock a previously locked canvas section so other agents can edit it. Requires canvas:write or full permission. Use lock_canvas_section to take the lock; this tool does not change section content.",
    inputSchema: {
      type: "object",
      properties: {
        run_id: { type: "string", description: "Workflow run UUID" },
        slug: { type: "string", description: "Document slug" },
        section_id: { type: "string", description: "Section ID to unlock" },
      },
      required: ["run_id", "slug", "section_id"],
    },
    annotations: IDEMPOTENT_WRITE_CLOSED,
  },
  {
    name: "create_skill",
    title: "Create skill",
    description: "Create a new skill for this playbook. Use this to expand capabilities. Requires full or skills:write permission. Use update_skill to change an existing skill and list_skills to check for name collisions first.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Agent Skills-compatible name (lowercase kebab-case, e.g. data-analyzer)" },
        description: { type: "string", description: "What the skill does and when the agent should use it" },
        content: { type: "string", description: "The instructions/prompt/code for the skill" },
        priority: { type: "number", description: "Priority level (default 50)" },
      },
      required: ["name", "content"],
    },
    annotations: WRITE_CLOSED,
  },
  {
    name: "update_skill",
    title: "Update skill",
    description: "Update an existing skill in this playbook. Requires full or skills:write permission. Use create_skill to add a skill, list_skill_versions before a risky edit, and rollback_skill to restore a previous version. Do not use this to delete a skill.",
    inputSchema: {
      type: "object",
      properties: {
        skill_id: { type: "string", description: "ID or name of the skill to update" },
        name: { type: "string", description: "New name" },
        description: { type: "string", description: "New description" },
        content: { type: "string", description: "New content/instructions" },
        priority: { type: "number", description: "New priority level" },
      },
      required: ["skill_id"],
    },
    annotations: IDEMPOTENT_WRITE_CLOSED,
  },
  {
    name: "delete_skill",
    title: "Delete skill",
    description: "Permanently delete a skill from this playbook. This cannot be undone except by recreating the skill. Requires full or skills:write permission. Use rollback_skill to restore a previous version instead of deleting, and update_skill to change content in place.",
    inputSchema: {
      type: "object",
      properties: {
        skill_id: { type: "string", description: "ID or name of the skill to delete" },
      },
      required: ["skill_id"],
    },
    annotations: DESTRUCTIVE_CLOSED,
  },
  {
    name: "list_skill_versions",
    title: "List skill versions",
    description: "List historical versions of a skill for auditing or rollback. Read-only. Use this before rollback_skill; use get_skill for the current definition and list_skills for every skill in the playbook.",
    inputSchema: {
      type: "object",
      properties: {
        skill_id: { type: "string", description: "ID or name of the skill" },
        limit: { type: "number", description: "Max versions to return (default 10)" },
      },
      required: ["skill_id"],
    },
    annotations: READ_CLOSED,
  },
  {
    name: "rollback_skill",
    title: "Roll back skill",
    description: "Rollback a skill to a previous version recorded by list_skill_versions. The current definition is replaced and cannot be recovered except by rolling forward to another stored version. Requires full or skills:write permission. Do not use delete_skill when you only need to revert.",
    inputSchema: {
      type: "object",
      properties: {
        version_id: { type: "string", description: "The specific version ID from list_skill_versions to rollback to" },
      },
      required: ["version_id"],
    },
    annotations: DESTRUCTIVE_CLOSED,
  },
  {
    name: "update_playbook",
    title: "Update playbook",
    description: "Update this playbook's name, description, visibility, tags, config, singleton persona fields, or always-on project instructions. Replacement fields overwrite previous values. Handle with extreme care. Requires full or playbooks:write permission. Changing persona_system_prompt here overlaps with update_persona and create_persona; use those when only the persona should change. There is no separate get_persona: read the persona via get_playbook.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "New playbook name" },
        description: { type: "string", description: "New playbook description" },
        visibility: { type: "string", enum: ["public", "private", "unlisted"], description: "New visibility" },
        tags: { type: "array", items: { type: "string" }, description: "Replacement discovery tags" },
        config: { type: "object", description: "Replacement playbook configuration" },
        persona_name: { type: "string", description: "New persona name" },
        persona_system_prompt: { type: "string", description: "New core system instructions" },
        persona_metadata: { type: "object", description: "New metadata JSON" },
        instructions: { type: "string", description: "New always-on project instructions (the AGENTS.md / CLAUDE.md content). Kept separate from the persona: the persona is who the agent is, these are the rules of this project." },
      },
    },
    annotations: DESTRUCTIVE_CLOSED,
  },
  // ===== Connected MCP Servers =====
  {
    name: "list_mcp_servers",
    title: "List MCP servers",
    description: "List the MCP and OpenAPI servers connected to this playbook, including transport metadata and discovered capability counts. Read-only. There is no get_mcp_server; this list is the detail view. Do not use this to invoke a connected tool—use call_connected_tool.",
    inputSchema: { type: "object", properties: {} },
    annotations: READ_CLOSED,
  },
  {
    name: "call_connected_tool",
    title: "Call a connected tool",
    description: "Call a tool on one of this playbook's connected MCP or OpenAPI servers. Arguments are forwarded as-is and the result mirrors the connected tool, including any side effects that tool has in the outside world. Requires tools:call or full permission. Use list_mcp_servers to discover server_id and tool_name. Do not use this to manage connection records; use create_mcp_server, update_mcp_server, or delete_mcp_server.",
    inputSchema: {
      type: "object",
      properties: {
        server_id: { type: "string", description: "Connected server UUID or name" },
        tool_name: { type: "string", description: "Tool name exposed by the connected server" },
        arguments: { type: "object", description: "Arguments passed to the connected tool" },
      },
      required: ["server_id", "tool_name"],
    },
    annotations: OPEN_WORLD_CALL,
  },
  {
    name: "create_mcp_server",
    title: "Add MCP server",
    description: "Connect an MCP or OpenAPI server to this playbook by storing its transport configuration. This writes playbook state; it does not by itself invoke remote tools. Requires playbooks:write or full permission. Use call_connected_tool to invoke a discovered tool, and list_mcp_servers to inspect connections.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Display name of the connected server" },
        description: { type: "string", description: "What this server provides" },
        tools: { type: "array", items: { type: "object" }, description: "Known tool definitions, if already discovered" },
        resources: { type: "array", items: { type: "object" }, description: "Known resource definitions, if already discovered" },
        transport_type: { type: "string", enum: ["stdio", "http", "sse", "openapi"], description: "Connection type (default: http)" },
        transport_config: { type: "object", description: "Transport-specific configuration. Do not put plaintext secrets here." },
      },
      required: ["name"],
    },
    annotations: WRITE_CLOSED,
  },
  {
    name: "update_mcp_server",
    title: "Update MCP server",
    description: "Update a connected MCP or OpenAPI server's stored name, description, tools, resources, or transport. Requires playbooks:write or full permission. Use call_connected_tool to invoke a tool, and delete_mcp_server to disconnect.",
    inputSchema: {
      type: "object",
      properties: {
        server_id: { type: "string", description: "Connected server UUID" },
        name: { type: "string", description: "New display name" },
        description: { type: "string", description: "New description" },
        tools: { type: "array", items: { type: "object" }, description: "Updated tool definitions" },
        resources: { type: "array", items: { type: "object" }, description: "Updated resource definitions" },
        transport_type: { type: "string", enum: ["stdio", "http", "sse", "openapi"], description: "Connection type" },
        transport_config: { type: "object", description: "Updated transport-specific configuration" },
      },
      required: ["server_id"],
    },
    annotations: IDEMPOTENT_WRITE_CLOSED,
  },
  {
    name: "delete_mcp_server",
    title: "Remove MCP server",
    description: "Disconnect an MCP or OpenAPI server from this playbook. The remote server is not shut down; only this playbook's connection record is removed. Requires playbooks:write or full permission. Use update_mcp_server to change configuration without disconnecting.",
    inputSchema: {
      type: "object",
      properties: {
        server_id: { type: "string", description: "Connected server UUID" },
      },
      required: ["server_id"],
    },
    annotations: DESTRUCTIVE_CLOSED,
  },
  // ===== Workflow Runs =====
  {
    name: "list_runs",
    title: "List runs",
    description: "List workflow runs for this playbook. Runs isolate canvas artifacts and execution context. Read-only. There is no get_run; this list returns the run records. Use create_run to start isolated canvas context and list_canvas to see documents in a run.",
    inputSchema: { type: "object", properties: {} },
    annotations: READ_CLOSED,
  },
  {
    name: "create_run",
    title: "Create run",
    description: "Create a workflow run so this playbook can be applied immediately with isolated context and canvas artifacts. Requires canvas:write or full permission. Use list_runs to inspect existing runs (there is no get_run) and update_run to change status.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Human-readable run name" },
        context: { type: "object", description: "Initial execution context" },
      },
      required: ["name"],
    },
    annotations: WRITE_CLOSED,
  },
  {
    name: "update_run",
    title: "Update run",
    description: "Update a workflow run's name, status, or context. Requires canvas:write or full permission. Use list_runs to find run_id (there is no get_run) and delete_run to remove the run and its canvas artifacts.",
    inputSchema: {
      type: "object",
      properties: {
        run_id: { type: "string", description: "Workflow run UUID" },
        name: { type: "string", description: "New run name" },
        status: { type: "string", enum: ["active", "completed", "archived"], description: "New run status" },
        context: { type: "object", description: "Replacement execution context" },
      },
      required: ["run_id"],
    },
    annotations: IDEMPOTENT_WRITE_CLOSED,
  },
  {
    name: "delete_run",
    title: "Delete run",
    description: "Permanently delete a workflow run and its isolated canvas artifacts. This cannot be undone. Requires canvas:write or full permission. Use update_run with status=archived to keep artifacts, and delete_playbook only when the whole playbook should go.",
    inputSchema: {
      type: "object",
      properties: {
        run_id: { type: "string", description: "Workflow run UUID" },
      },
      required: ["run_id"],
    },
    annotations: DESTRUCTIVE_CLOSED,
  },
  // ===== Secrets Tools =====
  // Security: agents NEVER see secret values. They reference secrets by name
  // and use_secret injects them server-side into HTTP requests.
  {
    name: "list_secrets",
    title: "List secrets",
    description: "List all secret names and metadata in this playbook. Does not return values — secret values are never exposed to agents. Requires secrets:read or full permission. Use use_secret to make an authenticated HTTP request, store_secret to add a value, and rotate_secret to replace one. Do not use this tool expecting plaintext credentials.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", enum: ["api_key", "password", "token", "certificate", "connection_string", "general"], description: "Filter by category" },
      },
    },
    outputSchema: secretListOutputSchema,
    annotations: READ_CLOSED,
  },
  {
    name: "use_secret",
    title: "Read through a secret",
    description: "Send a GET or HEAD request with a secret injected as a header, and return the response. The secret value is never returned to the agent — it is decrypted and used server-side only. Reads the remote API; it cannot change anything there, because only safe methods are accepted. The URL is chosen by the caller, so the target is whichever API the secret belongs to — see that API's own documentation for paths. Requires secrets:read or full permission. Example: use_secret({secret_name: 'OPENAI_API_KEY', url: 'https://api.openai.com/v1/models'}) sends GET with 'Authorization: Bearer <key>'. Use list_secrets to discover names, use_secret_write to send POST/PUT/PATCH/DELETE, and store_secret or rotate_secret to change a stored value.",
    inputSchema: {
      type: "object",
      properties: {
        secret_name: { type: "string", description: "Name of the secret to use (e.g. OPENAI_API_KEY)" },
        url: { type: "string", description: "The URL to send the HTTP request to" },
        method: { type: "string", enum: ["GET", "HEAD"], description: "HTTP method (default: GET). For POST/PUT/PATCH/DELETE use use_secret_write." },
        header_name: { type: "string", description: "Header name to inject the secret into (default: Authorization)" },
        header_prefix: { type: "string", description: "Prefix before the secret value (default: 'Bearer '). Use empty string for raw value." },
        extra_headers: { type: "object", description: "Additional headers (e.g. {\"Accept\": \"application/json\"})" },
        timeout_ms: { type: "number", description: "Request timeout in milliseconds (default: 30000, max: 60000)" },
      },
      required: ["secret_name", "url"],
    },
    annotations: OPEN_WORLD_READ,
  },
  {
    name: "use_secret_write",
    title: "Write through a secret",
    description: "Send a POST, PUT, PATCH or DELETE request with a secret injected as a header, and return the response. The secret value is never returned to the agent — it is decrypted and used server-side only. This changes state in the remote API and cannot be undone from here. The URL is chosen by the caller, so the target is whichever API the secret belongs to — see that API's own documentation for paths and payloads. Requires secrets:read or full permission. Use use_secret for GET and HEAD, list_secrets to discover names, and store_secret or rotate_secret to change a stored value rather than send a request.",
    inputSchema: {
      type: "object",
      properties: {
        secret_name: { type: "string", description: "Name of the secret to use (e.g. DEPLOY_API_KEY)" },
        url: { type: "string", description: "The URL to send the HTTP request to" },
        method: { type: "string", enum: ["POST", "PUT", "PATCH", "DELETE"], description: "HTTP method (default: POST). For GET/HEAD use use_secret." },
        header_name: { type: "string", description: "Header name to inject the secret into (default: Authorization)" },
        header_prefix: { type: "string", description: "Prefix before the secret value (default: 'Bearer '). Use empty string for raw value." },
        body: { type: "object", description: "JSON request body (for POST/PUT/PATCH)" },
        extra_headers: { type: "object", description: "Additional headers (e.g. {\"Content-Type\": \"application/json\"})" },
        timeout_ms: { type: "number", description: "Request timeout in milliseconds (default: 30000, max: 60000)" },
      },
      required: ["secret_name", "url"],
    },
    annotations: OPEN_WORLD_CALL,
  },
  {
    name: "store_secret",
    title: "Store secret",
    description: "Store a new encrypted secret. The value is encrypted with AES-256-GCM using a per-user derived key and never stored or returned in plaintext. Requires secrets:write or full permission. Use rotate_secret to replace an existing value and list_secrets to confirm the name. Do not use this to send an authenticated request; use use_secret.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Secret name (letters, numbers, hyphens, underscores)" },
        value: { type: "string", description: "The secret value to encrypt and store" },
        description: { type: "string", description: "What this secret is used for" },
        category: { type: "string", enum: ["api_key", "password", "token", "certificate", "connection_string", "general"], description: "Secret type (default: general)" },
        expires_at: { type: "string", description: "ISO 8601 expiration date (optional)" },
      },
      required: ["name", "value"],
    },
    annotations: WRITE_CLOSED,
  },
  {
    name: "rotate_secret",
    title: "Rotate secret",
    description: "Rotate an existing secret with a new value. The old value is permanently replaced and cannot be recovered. Requires secrets:write or full permission. Use store_secret to create a name that does not exist yet, and delete_secret to remove the secret entirely.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Secret name to rotate" },
        value: { type: "string", description: "New secret value" },
      },
      required: ["name", "value"],
    },
    annotations: DESTRUCTIVE_CLOSED,
  },
  {
    name: "delete_secret",
    title: "Delete secret",
    description: "Permanently delete a secret. Cannot be undone. Requires secrets:write or full permission. Use rotate_secret to replace the value without removing the name, and list_secrets to confirm the name first. This does not revoke the credential at the upstream provider.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Secret name to delete" },
      },
      required: ["name"],
    },
    annotations: DESTRUCTIVE_CLOSED,
  },
];

const PLAYBOOK_ID_PROPERTY = {
  type: "string",
  description: "UUID or GUID of the target playbook",
};

/**
 * The playbook-scoped endpoint binds the playbook in its URL. The user-level
 * control plane exposes the exact same operations, but lifts the target into
 * an explicit argument so an agent can create a playbook and use it at once.
 */
export function projectPlaybookToolsForUser(tools: McpTool[] = PLAYBOOK_TOOLS): McpTool[] {
  return tools.map((tool) => {
    const schema = tool.inputSchema || { type: "object", properties: {} };
    const properties = (
      typeof schema.properties === "object" && schema.properties !== null
        ? schema.properties
        : {}
    ) as Record<string, unknown>;
    const required = Array.isArray(schema.required)
      ? schema.required.filter((name): name is string => typeof name === "string")
      : [];

    return {
      ...tool,
      description: `${asCompleteSentence(tool.description || tool.name)} Pass playbook_id as the UUID or GUID of the playbook this call should target.`,
      inputSchema: {
        ...schema,
        type: "object",
        properties: {
          playbook_id: PLAYBOOK_ID_PROPERTY,
          ...properties,
        },
        required: ["playbook_id", ...required.filter((name) => name !== "playbook_id")],
      },
    };
  });
}

export function asCompleteSentence(description: string): string {
  const trimmed = description.trim();
  if (!trimmed) return trimmed;
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

const PLAYBOOK_TOOL_NAMES = new Set(PLAYBOOK_TOOLS.map((tool) => tool.name));

export function isPlaybookTool(name: string): boolean {
  return PLAYBOOK_TOOL_NAMES.has(name);
}
