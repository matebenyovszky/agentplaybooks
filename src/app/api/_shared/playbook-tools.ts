import type { McpTool } from "@/lib/supabase/types";

export const PLAYBOOK_TOOLS: McpTool[] = [
  {
    name: "list_skills",
    description: "List all skills (capabilities/rules) in this playbook",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_skill",
    description: "Get detailed information about a specific skill",
    inputSchema: {
      type: "object",
      properties: {
        skill_id: { type: "string", description: "Skill ID or name" },
      },
      required: ["skill_id"],
    },
  },
  {
    name: "read_memory",
    description: "Read a specific memory entry by key. Automatically increments access count. Memory supports 3 tiers: 'working' (active scratch pad), 'contextual' (recent context), 'longterm' (archived). Use 'hierarchical' memory_type for complex task graphs with parallel threads.",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string", description: "Memory key to read" },
      },
      required: ["key"],
    },
  },
  {
    name: "search_memory",
    description: "Search memories by text, tags, tier, or type. Returns summaries for large memories. Use tags for categorical search; use tier to focus on active vs archived data; use memory_type to find task graphs.",
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
  },
  {
    name: "write_memory",
    description: "Write a memory entry. Use tier='working' for active tasks, 'contextual' for background context, 'longterm' for completed work. Set memory_type='hierarchical' and parent_key to build task graphs. Use status to track task progress in parallel workflows.",
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
  },
  {
    name: "delete_memory",
    description: "Delete a memory entry (requires API key)",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string", description: "Memory key to delete" },
      },
      required: ["key"],
    },
  },
  {
    name: "consolidate_memories",
    description: "Consolidate multiple related memories into a parent memory with summary. Reduces context size while preserving detail access via children.",
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
  },
  {
    name: "promote_memory",
    description: "Promote a memory to a higher tier or boost its priority for active use.",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string", description: "Memory key to promote" },
        target_tier: { type: "string", enum: ["working", "contextual"], description: "Target tier (cannot demote with this tool)" },
        priority_boost: { type: "number", description: "Amount to increase priority (0-50)", default: 10 },
      },
      required: ["key"],
    },
  },
  {
    name: "get_memory_context",
    description: "Get a context-optimized view of memories. Returns full working memory, summaries for contextual, and keys only for longterm.",
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
  },
  {
    name: "archive_memories",
    description: "Archive memories from working/contextual to longterm tier. Useful for cleaning up after completing tasks.",
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
  },
  {
    name: "get_memory_tree",
    description: "Get hierarchical tree view of memories showing parent-child relationships. Use this to visualize task graphs and track parallel operations. Includes status for each node.",
    inputSchema: {
      type: "object",
      properties: {
        root_key: { type: "string", description: "Start from this key (omit for all roots)" },
        max_depth: { type: "number", description: "Maximum tree depth", default: 3 },
        include_values: { type: "boolean", description: "Include full values (false = summaries only)", default: false },
      },
    },
  },
  {
    name: "create_task_graph",
    description: "Create a hierarchical task plan in one call. Creates a parent 'plan' memory with children for each subtask. Use this for complex multi-threaded work that agent swarms can coordinate on. Each subtask gets its own memory node with status tracking.",
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
  },
  {
    name: "update_task_status",
    description: "Update the status of a task node in a hierarchical plan. When all children of a parent are 'completed', the parent is auto-updated. Returns the current subtree state.",
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
  },
  {
    name: "list_canvas",
    description: "List all canvas documents in this playbook. Canvas documents are collaborative markdown files that multiple agents can edit in parallel.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "read_canvas",
    description: "Read a canvas document. Returns full content, sections structure, and metadata. Optionally read a specific section by ID.",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Document slug" },
        section_id: { type: "string", description: "Optional: read only this section" },
      },
      required: ["slug"],
    },
  },
  {
    name: "write_canvas",
    description: "Create or fully replace a canvas document. Markdown headings are auto-parsed into sections for parallel editing. Use patch_canvas_section for partial updates.",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "URL-friendly document identifier" },
        name: { type: "string", description: "Document title" },
        content: { type: "string", description: "Full markdown content" },
        metadata: { type: "object", description: "Custom document metadata" },
      },
      required: ["slug", "name", "content"],
    },
  },
  {
    name: "patch_canvas_section",
    description: "Edit a specific section of a canvas document. Parallel-safe: only updates the targeted section. Lock the section first for safety in multi-agent scenarios.",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Document slug" },
        section_id: { type: "string", description: "Section ID from get_canvas_toc" },
        content: { type: "string", description: "New section content (markdown)" },
        heading: { type: "string", description: "Optional: new heading text" },
      },
      required: ["slug", "section_id", "content"],
    },
  },
  {
    name: "get_canvas_toc",
    description: "Get the table of contents for a canvas document. Returns section IDs, headings, and levels for navigation and patch_canvas_section.",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Document slug" },
      },
      required: ["slug"],
    },
  },
  {
    name: "lock_canvas_section",
    description: "Lock a section for exclusive editing. Prevents other agents from modifying it. Remember to unlock when done.",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Document slug" },
        section_id: { type: "string", description: "Section ID to lock" },
        locked_by: { type: "string", description: "Agent identifier" },
      },
      required: ["slug", "section_id", "locked_by"],
    },
  },
  {
    name: "unlock_canvas_section",
    description: "Unlock a previously locked section so other agents can edit it.",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Document slug" },
        section_id: { type: "string", description: "Section ID to unlock" },
      },
      required: ["slug", "section_id"],
    },
  },
  {
    name: "create_skill",
    description: "Create a new skill for this playbook. Use this to expand capabilities. Requires full or skills:write permission.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name of the skill (e.g. data_analyzer)" },
        description: { type: "string", description: "Brief description of what the skill does" },
        content: { type: "string", description: "The instructions/prompt/code for the skill" },
        priority: { type: "number", description: "Priority level (default 50)" },
      },
      required: ["name", "content"],
    },
  },
  {
    name: "update_skill",
    description: "Update an existing skill in this playbook. Requires full or skills:write permission.",
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
  },
  {
    name: "delete_skill",
    description: "Delete a skill from this playbook. Requires full or skills:write permission.",
    inputSchema: {
      type: "object",
      properties: {
        skill_id: { type: "string", description: "ID or name of the skill to delete" },
      },
      required: ["skill_id"],
    },
  },
  {
    name: "list_skill_versions",
    description: "List historical versions of a skill for auditing or rollback.",
    inputSchema: {
      type: "object",
      properties: {
        skill_id: { type: "string", description: "ID or name of the skill" },
        limit: { type: "number", description: "Max versions to return (default 10)" },
      },
      required: ["skill_id"],
    },
  },
  {
    name: "rollback_skill",
    description: "Rollback a skill to a previous version. Requires full or skills:write permission.",
    inputSchema: {
      type: "object",
      properties: {
        version_id: { type: "string", description: "The specific version ID from list_skill_versions to rollback to" },
      },
      required: ["version_id"],
    },
  },
  {
    name: "update_playbook",
    description: "Update the persona/system prompt of this playbook. Handle with extreme care! Requires full or playbooks:write permission.",
    inputSchema: {
      type: "object",
      properties: {
        persona_name: { type: "string", description: "New persona name" },
        persona_system_prompt: { type: "string", description: "New core system instructions" },
        persona_metadata: { type: "object", description: "New metadata JSON" },
      },
    },
  },
  // ===== Secrets Tools =====
  // Security: agents NEVER see secret values. They reference secrets by name
  // and use_secret injects them server-side into HTTP requests.
  {
    name: "list_secrets",
    description: "List all secret names and metadata in this playbook. Does NOT return values — secret values are never exposed to agents. Requires secrets:read permission.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", enum: ["api_key", "password", "token", "certificate", "connection_string", "general"], description: "Filter by category" },
      },
    },
  },
  {
    name: "use_secret",
    description: "Make an HTTP request with a secret injected as a header. The secret value is NEVER returned to the agent — it is decrypted and used server-side only. Use this to authenticate API calls without exposing credentials. Example: use_secret({secret_name: 'OPENAI_API_KEY', url: 'https://api.openai.com/v1/models'}) sends GET with 'Authorization: Bearer <key>'. Requires secrets:read permission.",
    inputSchema: {
      type: "object",
      properties: {
        secret_name: { type: "string", description: "Name of the secret to use (e.g. OPENAI_API_KEY)" },
        url: { type: "string", description: "The URL to send the HTTP request to" },
        method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"], description: "HTTP method (default: GET)" },
        header_name: { type: "string", description: "Header name to inject the secret into (default: Authorization)" },
        header_prefix: { type: "string", description: "Prefix before the secret value (default: 'Bearer '). Use empty string for raw value." },
        body: { type: "object", description: "JSON request body (for POST/PUT/PATCH)" },
        extra_headers: { type: "object", description: "Additional headers (e.g. {\"Content-Type\": \"application/json\"})" },
        timeout_ms: { type: "number", description: "Request timeout in milliseconds (default: 30000, max: 60000)" },
      },
      required: ["secret_name", "url"],
    },
  },
  {
    name: "store_secret",
    description: "Store a new encrypted secret. The value is encrypted with AES-256-GCM using a per-user derived key and never stored or returned in plaintext. Requires secrets:write permission.",
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
  },
  {
    name: "rotate_secret",
    description: "Rotate (update) an existing secret with a new value. The old value is permanently replaced and cannot be recovered. Requires secrets:write permission.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Secret name to rotate" },
        value: { type: "string", description: "New secret value" },
      },
      required: ["name", "value"],
    },
  },
  {
    name: "delete_secret",
    description: "Permanently delete a secret. Cannot be undone. Requires secrets:write permission.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Secret name to delete" },
      },
      required: ["name"],
    },
  },
];
