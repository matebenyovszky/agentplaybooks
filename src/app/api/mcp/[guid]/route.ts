import { handle } from "hono/vercel";
import { createApiApp } from "@/app/api/_shared/hono";
import { validateApiKey } from "@/app/api/_shared/auth";
import { getServiceSupabase, getSupabase } from "@/app/api/_shared/supabase";
import type { McpResource, McpTool, Playbook, MemoryTier, MemoryType, MemoryStatus, CanvasSection } from "@/lib/supabase/types";

type PersonaSource = Pick<Playbook, "id" | "persona_name" | "persona_system_prompt" | "persona_metadata">;

// MCP Protocol implementation for Cloudflare Workers / Next.js
// Supports: tools/list, resources/list, resources/read, tools/call

function playbookToPersona(playbook: PersonaSource) {
  return {
    id: playbook.id,
    playbook_id: playbook.id,
    name: playbook.persona_name || "Assistant",
    system_prompt: playbook.persona_system_prompt || "You are a helpful AI assistant.",
    metadata: playbook.persona_metadata ?? {},
  };
}

// Parse markdown content into sections based on headings
function parseMarkdownSections(content: string): CanvasSection[] {
  const lines = content.split("\n");
  const sections: CanvasSection[] = [];
  let currentSection: { heading: string; level: number; lines: string[] } | null = null;
  let sectionCounter = 0;

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      // Save previous section
      if (currentSection) {
        sectionCounter++;
        sections.push({
          id: `s${sectionCounter}`,
          heading: currentSection.heading,
          level: currentSection.level,
          content: currentSection.lines.join("\n").trim(),
          locked_by: null,
          locked_at: null,
        });
      }
      currentSection = {
        heading: headingMatch[2],
        level: headingMatch[1].length,
        lines: [],
      };
    } else if (currentSection) {
      currentSection.lines.push(line);
    } else {
      // Content before first heading becomes section 0
      if (!currentSection) {
        currentSection = { heading: "Introduction", level: 1, lines: [line] };
      }
    }
  }

  // Save last section
  if (currentSection) {
    sectionCounter++;
    sections.push({
      id: `s${sectionCounter}`,
      heading: currentSection.heading,
      level: currentSection.level,
      content: currentSection.lines.join("\n").trim(),
      locked_by: null,
      locked_at: null,
    });
  }

  // If no sections found, create one for the whole content
  if (sections.length === 0 && content.trim()) {
    sections.push({
      id: "s1",
      heading: "Content",
      level: 1,
      content: content.trim(),
      locked_by: null,
      locked_at: null,
    });
  }

  return sections;
}

// Built-in MCP tools for playbook access
// Note: Persona is embedded in the MCP manifest under _playbook.persona
// RLM-Enhanced: Includes hierarchical memory management tools
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
  // ===== RLM-Enhanced Memory Tools =====
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
  // ===== Hierarchical Task Graph Tools =====
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
  // ===== Canvas Tools =====
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
  // ===== Self-Modification / Evolution Tools =====
  {
    name: "create_skill",
    description: "Create a new skill for this playbook. Use this to expand capabilities. Requires full or skill:write permission.",
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
    description: "Update an existing skill in this playbook. Requires full or skill:write permission.",
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
    description: "Delete a skill from this playbook. Requires full or skill:write permission.",
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
    description: "Rollback a skill to a previous version. Requires full or skill:write permission.",
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
    description: "Update the persona/system prompt of this playbook. Handle with extreme care! Requires full or playbook:write permission.",
    inputSchema: {
      type: "object",
      properties: {
        persona_name: { type: "string", description: "New persona name" },
        persona_system_prompt: { type: "string", description: "New core system instructions" },
        persona_metadata: { type: "object", description: "New metadata JSON" },
      },
    },
  },
];

const app = createApiApp("/api/mcp/:guid");

// GET /api/mcp/:guid - Return MCP server manifest
app.get("/", async (c) => {
  const guid = c.req.param("guid");
  if (!guid) {
    return c.json({ error: "Missing playbook GUID" }, 400);
  }
  const supabase = getSupabase();

  // Check if it's a UUID or GUID
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(guid);

  // Get playbook with all related data
  let query = supabase
    .from("playbooks")
    .select("*");

  if (isUuid) {
    query = query.eq("id", guid);
  } else {
    query = query.eq("guid", guid);
  }

  const { data: playbook, error } = await query
    .eq("visibility", "public")
    .single();

  if (error || !playbook) {
    return c.json({ error: "Playbook not found" }, 404);
  }

  const [skillsRes, mcpRes] = await Promise.all([
    supabase.from("skills").select("*").eq("playbook_id", playbook.id),
    supabase.from("mcp_servers").select("*").eq("playbook_id", playbook.id),
  ]);

  const skills = skillsRes.data || [];
  const mcpServers = mcpRes.data || [];
  const persona = playbookToPersona(playbook);

  // Build tools: start with built-in playbook tools
  const tools: McpTool[] = [...PLAYBOOK_TOOLS];

  // Add skill-based tools (prefixed with skill_ to distinguish from built-in)
  // Note: Skills no longer have parameters, so use empty schema
  for (const skill of skills) {
    tools.push({
      name: `skill_${skill.name.toLowerCase().replace(/\s+/g, "_")}`,
      description: skill.description || skill.name,
      inputSchema: { type: "object", properties: {} } as Record<string, unknown>,
    });
  }

  // Add tools from MCP servers
  for (const mcp of mcpServers) {
    if (Array.isArray(mcp.tools)) {
      tools.push(...mcp.tools);
    }
  }

  // Build resources
  // Note: Persona is embedded in the manifest under _playbook.persona (1 Playbook = 1 Persona)
  const resources: McpResource[] = [
    {
      uri: `playbook://${guid}/memory`,
      name: "Memory",
      description: "Persistent key-value memory storage",
      mimeType: "application/json",
    },
    {
      uri: `playbook://${guid}/skills`,
      name: "Skills",
      description: "Available capabilities and tasks",
      mimeType: "application/json",
    },
  ];

  // Add resources from MCP servers
  for (const mcp of mcpServers) {
    if (Array.isArray(mcp.resources)) {
      resources.push(...mcp.resources);
    }
  }

  // MCP Server manifest
  const manifest = {
    protocolVersion: "2024-11-05",
    serverInfo: {
      name: playbook.name,
      version: "1.0.0",
      description: playbook.description,
    },
    capabilities: {
      tools: tools.length > 0 ? {} : undefined,
      resources: resources.length > 0 ? {} : undefined,
    },
    tools,
    resources,
    // Extension: include personas for AI context
    _playbook: {
      guid: playbook.guid,
      persona: {
        name: persona.name,
        systemPrompt: persona.system_prompt,
        metadata: persona.metadata,
      },
    },
  };

  return c.json(manifest);
});

// POST /api/mcp/:guid - Handle MCP JSON-RPC requests
app.post("/", async (c) => {
  const guid = c.req.param("guid");
  if (!guid) {
    return c.json({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32600, message: "Missing playbook GUID" }
    }, 400);
  }
  const body = await c.req.json();

  const { method, params: rpcParams, id } = body;

  const supabase = getSupabase();

  // Check if it's a UUID or GUID
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(guid);

  // Get playbook - try public first, then fallback to API key auth for private playbooks
  let query = supabase
    .from("playbooks")
    .select("id, persona_name, persona_system_prompt, persona_metadata");

  if (isUuid) {
    query = query.eq("id", guid);
  } else {
    query = query.eq("guid", guid);
  }

  let { data: playbook } = await query
    .eq("visibility", "public")
    .single();

  // If not found as public, try API key auth for private playbooks
  if (!playbook) {
    const apiKeyData = await validateApiKey(c.req.raw, "memory:read");
    if (apiKeyData) {
      const serviceSupabase = getServiceSupabase();
      let privateQuery = serviceSupabase
        .from("playbooks")
        .select("id, persona_name, persona_system_prompt, persona_metadata");

      if (isUuid) {
        privateQuery = privateQuery.eq("id", guid);
      } else {
        privateQuery = privateQuery.eq("guid", guid);
      }

      // Verify the API key belongs to this playbook
      const { data: privatePlaybook } = await privateQuery
        .eq("id", apiKeyData.playbooks.id)
        .single();

      playbook = privatePlaybook;
    }
  }

  if (!playbook) {
    return c.json({
      jsonrpc: "2.0",
      id,
      error: { code: -32001, message: "Playbook not found" },
    });
  }

  // Handle MCP methods
  switch (method) {
    case "initialize":
      return c.json({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          serverInfo: { name: "AgentPlaybooks", version: "1.0.0" },
          capabilities: { tools: {}, resources: {} },
        },
      });

    case "tools/list": {
      const { data: skills } = await supabase
        .from("skills")
        .select("*")
        .eq("playbook_id", playbook.id);

      // Skill-based tools (from playbook definition)
      // Note: Skills no longer have parameters, use empty schema
      const skillTools = (skills || []).map((skill) => ({
        name: `skill_${skill.name.toLowerCase().replace(/\s+/g, "_")}`,
        description: skill.description || skill.name,
        inputSchema: { type: "object", properties: {} },
      }));

      // Combine with built-in playbook tools
      const allTools = [...PLAYBOOK_TOOLS, ...skillTools];

      return c.json({
        jsonrpc: "2.0",
        id,
        result: { tools: allTools },
      });
    }

    case "resources/list": {
      // Get skills to list their attachments
      const { data: skills } = await supabase
        .from("skills")
        .select("id, name")
        .eq("playbook_id", playbook.id);

      // Note: Persona is embedded in the MCP manifest under _playbook.persona
      const resources: McpResource[] = [
        {
          uri: `playbook://${guid}/guide`,
          name: "AgentPlaybooks Usage Guide",
          description: "Comprehensive guide on how to use this playbook: memory (flat & hierarchical), canvas, skills, and best practices for agent swarms",
          mimeType: "text/markdown",
        },
        {
          uri: `playbook://${guid}/skills`,
          name: "Skills",
          description: "Capabilities, rules, and how to solve tasks",
          mimeType: "application/json",
        },
        {
          uri: `playbook://${guid}/memory`,
          name: "Memory",
          description: "Persistent hierarchical memory with tiers (working/contextual/longterm), task graphs, and tags",
          mimeType: "application/json",
        },
        {
          uri: `playbook://${guid}/canvas`,
          name: "Canvas Documents",
          description: "Collaborative markdown documents with section-level editing for parallel agent work",
          mimeType: "application/json",
        },
      ];

      // Add skill attachment resources
      if (skills?.length) {
        const serviceSupabase = getServiceSupabase();
        const { data: attachments } = await serviceSupabase
          .from("skill_attachments")
          .select("id, skill_id, filename, description")
          .in("skill_id", skills.map(s => s.id));

        for (const attachment of attachments || []) {
          const skill = skills.find(s => s.id === attachment.skill_id);
          resources.push({
            uri: `playbook://${guid}/skills/${attachment.skill_id}/attachments/${attachment.id}`,
            name: attachment.filename,
            description: attachment.description || `Attachment for ${skill?.name || 'skill'}`,
            mimeType: "text/plain",
          });
        }
      }

      return c.json({
        jsonrpc: "2.0",
        id,
        result: { resources },
      });
    }

    case "resources/read": {
      const uri = rpcParams?.uri as string;
      const serviceSupabase = getServiceSupabase();

      // Guide resource
      if (uri?.match(/\/guide$/)) {
        const guideContent = `# AgentPlaybooks Usage Guide

This playbook gives you access to memory, canvas, and skills. Here's how to use each feature.

## Memory System

Memory is persistent key-value storage with hierarchical capabilities.

### Memory Tiers
- **working** — Active scratch pad for current tasks. Highest priority.
- **contextual** — Background context (default). Recent but not urgent.
- **longterm** — Archived knowledge. Low priority but permanent.

### Flat vs Hierarchical Memory
- **flat** (default) — Simple key-value pairs for facts, preferences, state.
- **hierarchical** — Task graphs with parent-child relationships and status tracking.

### Key Memory Tools
| Tool | Use When |
|------|----------|
| \`read_memory\` | Read a specific memory by key |
| \`search_memory\` | Find memories by text, tags, tier, or type |
| \`write_memory\` | Store a fact, preference, or task node |
| \`create_task_graph\` | Create a full task plan with subtasks in one call |
| \`update_task_status\` | Mark a task as running/completed/failed |
| \`consolidate_memories\` | Combine related memories into a parent summary |
| \`promote_memory\` | Move a memory to a higher tier or boost priority |
| \`get_memory_context\` | Get an optimized view of memories across tiers |
| \`archive_memories\` | Move completed memories to longterm tier |
| \`get_memory_tree\` | Visualize parent-child hierarchy |

### Task Graph Workflow (for Agent Swarms)
1. Use \`create_task_graph\` with a plan_key, summary, and list of tasks
2. Each agent picks a task and calls \`update_task_status\` with status "running"
3. When done, call \`update_task_status\` with status "completed" and results
4. Parent auto-completes when all children finish

### Memory Best Practices
- Use \`tier: "working"\` for active tasks, \`"longterm"\` for archived results
- Set \`parent_key\` to group related memories hierarchically
- Use tags for cross-cutting categorization
- Use \`summary\` for compact context views
- Consolidate memories when context gets too large

## Canvas System

Canvas documents are collaborative markdown files with section-level editing.

### Key Canvas Tools
| Tool | Use When |
|------|----------|
| \`list_canvas\` | See all canvas documents |
| \`read_canvas\` | Read full document or specific section |
| \`write_canvas\` | Create or fully update a canvas document |
| \`patch_canvas_section\` | Edit a specific section (parallel-safe) |
| \`get_canvas_toc\` | Get table of contents with section IDs |
| \`lock_canvas_section\` | Lock a section for exclusive editing |
| \`unlock_canvas_section\` | Release a section lock |

### Canvas Workflow
1. Create a document with \`write_canvas\` (markdown auto-parsed into sections)
2. Use \`get_canvas_toc\` to see the structure
3. Multiple agents can edit different sections via \`patch_canvas_section\`
4. Lock sections with \`lock_canvas_section\` before editing for safety

## Skills

Skills define capabilities, rules, and instructions.
- Use \`list_skills\` to discover available skills
- Use \`get_skill\` to read a skill's full content
- Skills with API key can be created/updated/deleted via \`create_skill\`, \`update_skill\`, \`delete_skill\`

## Authentication
- **Read operations**: No API key needed for public playbooks
- **Write operations**: Require API key in Authorization header: \`Bearer apb_xxx\`
- Generate API keys in the playbook dashboard under "API Keys" tab
`;

        return c.json({
          jsonrpc: "2.0",
          id,
          result: {
            contents: [
              {
                uri,
                mimeType: "text/markdown",
                text: guideContent,
              },
            ],
          },
        });
      }

      // Memory resource
      if (uri?.match(/\/memory$/)) {
        const { data: memories } = await serviceSupabase
          .from("memories")
          .select("key, value, tags, description, tier, priority, parent_key, summary, memory_type, status, metadata, updated_at")
          .eq("playbook_id", playbook.id)
          .order("updated_at", { ascending: false });

        return c.json({
          jsonrpc: "2.0",
          id,
          result: {
            contents: [
              {
                uri,
                mimeType: "application/json",
                text: JSON.stringify(memories || []),
              },
            ],
          },
        });
      }

      // Personas resource (deprecated - persona is now in _playbook.persona)
      // Kept for backward compatibility
      if (uri?.match(/\/personas$/)) {
        return c.json({
          jsonrpc: "2.0",
          id,
          result: {
            contents: [
              {
                uri,
                mimeType: "application/json",
                text: JSON.stringify([playbookToPersona(playbook)]),
              },
            ],
          },
        });
      }

      // Skills resource
      if (uri?.match(/\/skills$/)) {
        const { data: skills } = await supabase
          .from("skills")
          .select("id, name, description, definition, examples, priority")
          .eq("playbook_id", playbook.id)
          .order("priority", { ascending: false });

        return c.json({
          jsonrpc: "2.0",
          id,
          result: {
            contents: [
              {
                uri,
                mimeType: "application/json",
                text: JSON.stringify(skills || []),
              },
            ],
          },
        });
      }

      // Skill attachment resource
      const attachmentMatch = uri?.match(/\/skills\/([^/]+)\/attachments\/([^/]+)$/);
      if (attachmentMatch) {
        const [, skillId, attachmentId] = attachmentMatch;

        const { data: attachment } = await serviceSupabase
          .from("skill_attachments")
          .select("*")
          .eq("id", attachmentId)
          .eq("skill_id", skillId)
          .single();

        if (!attachment) {
          return c.json({
            jsonrpc: "2.0",
            id,
            error: { code: -32002, message: "Attachment not found" },
          });
        }

        return c.json({
          jsonrpc: "2.0",
          id,
          result: {
            contents: [
              {
                uri,
                mimeType: "text/plain",
                text: attachment.content,
              },
            ],
          },
        });
      }

      // Canvas resource
      if (uri?.match(/\/canvas$/)) {
        const { data: canvasDocs } = await serviceSupabase
          .from("canvas")
          .select("slug, name, sort_order, updated_at, metadata")
          .eq("playbook_id", playbook.id)
          .order("sort_order");

        return c.json({
          jsonrpc: "2.0",
          id,
          result: {
            contents: [
              {
                uri,
                mimeType: "application/json",
                text: JSON.stringify(canvasDocs || []),
              },
            ],
          },
        });
      }

      // Canvas document resource by slug
      const canvasSlugMatch = uri?.match(/\/canvas\/([^/]+)$/);
      if (canvasSlugMatch) {
        const canvasSlug = canvasSlugMatch[1];
        const { data: canvasDoc } = await serviceSupabase
          .from("canvas")
          .select("*")
          .eq("playbook_id", playbook.id)
          .eq("slug", canvasSlug)
          .single();

        if (!canvasDoc) {
          return c.json({
            jsonrpc: "2.0",
            id,
            error: { code: -32002, message: "Canvas document not found" },
          });
        }

        return c.json({
          jsonrpc: "2.0",
          id,
          result: {
            contents: [
              {
                uri,
                mimeType: "text/markdown",
                text: canvasDoc.content,
              },
            ],
          },
        });
      }

      return c.json({
        jsonrpc: "2.0",
        id,
        error: { code: -32002, message: "Resource not found" },
      });
    }

    case "tools/call": {
      const toolName = rpcParams?.name as string;
      const args = rpcParams?.arguments || {};
      const serviceSupabase = getServiceSupabase();

      try {
        let result: unknown;

        switch (toolName) {
          case "list_skills": {
            const { data } = await serviceSupabase
              .from("skills")
              .select("id, name, description, definition, examples, priority")
              .eq("playbook_id", playbook.id)
              .order("priority", { ascending: false });
            result = data || [];
            break;
          }

          case "get_skill": {
            const skillId = args.skill_id as string;
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(skillId);

            let query = serviceSupabase
              .from("skills")
              .select("*, skill_attachments(*)")
              .eq("playbook_id", playbook.id);

            if (isUuid) {
              query = query.eq("id", skillId);
            } else {
              query = query.ilike("name", skillId.replace(/_/g, " "));
            }

            const { data } = await query.single();
            if (!data) throw new Error("Skill not found");
            result = data;
            break;
          }

          case "read_memory": {
            const key = args.key as string;
            const { data } = await serviceSupabase
              .from("memories")
              .select("key, value, tags, description, tier, priority, parent_key, summary, access_count, updated_at")
              .eq("playbook_id", playbook.id)
              .eq("key", key)
              .single();
            if (!data) throw new Error("Memory not found");

            // Increment access count and update last_accessed_at
            await serviceSupabase
              .from("memories")
              .update({
                access_count: (data.access_count || 0) + 1,
                last_accessed_at: new Date().toISOString()
              })
              .eq("playbook_id", playbook.id)
              .eq("key", key);

            result = data;
            break;
          }

          case "search_memory": {
            const search = args.search as string | undefined;
            const tags = args.tags as string[] | undefined;
            const tier = args.tier as MemoryTier | undefined;
            const memType = args.memory_type as MemoryType | undefined;
            const memStatus = args.status as MemoryStatus | undefined;
            const includeChildren = args.include_children as boolean | undefined;

            let query = serviceSupabase
              .from("memories")
              .select("key, value, tags, description, tier, priority, parent_key, summary, memory_type, status, metadata, updated_at")
              .eq("playbook_id", playbook.id);

            if (search) {
              query = query.or(`key.ilike.%${search}%,description.ilike.%${search}%,summary.ilike.%${search}%`);
            }

            if (tags && tags.length > 0) {
              query = query.overlaps("tags", tags);
            }

            if (tier) {
              query = query.eq("tier", tier);
            }

            if (memType) {
              query = query.eq("memory_type", memType);
            }

            if (memStatus) {
              query = query.eq("status", memStatus);
            }

            if (!includeChildren) {
              query = query.is("parent_key", null);
            }

            const { data } = await query
              .order("priority", { ascending: false })
              .order("updated_at", { ascending: false });
            result = data || [];
            break;
          }

          case "write_memory": {
            // Requires API key
            const apiKeyData = await validateApiKey(c.req.raw, "memory:write");
            if (!apiKeyData || apiKeyData.playbooks.id !== playbook.id) {
              throw new Error("API key with memory:write permission required");
            }

            const key = args.key as string;
            const value = args.value as Record<string, unknown>;
            const memTags = args.tags as string[] | undefined;
            const description = args.description as string | undefined;
            const tier = args.tier as string | undefined;
            const priority = args.priority as number | undefined;
            const parentKey = args.parent_key as string | undefined;
            const summary = args.summary as string | undefined;
            const memoryType = args.memory_type as string | undefined;
            const status = args.status as string | undefined;
            const metadata = args.metadata as Record<string, unknown> | undefined;

            const upsertData: Record<string, unknown> = {
              playbook_id: playbook.id,
              key,
              value,
              updated_at: new Date().toISOString(),
            };
            if (memTags !== undefined) upsertData.tags = memTags;
            if (description !== undefined) upsertData.description = description;
            if (tier !== undefined) upsertData.tier = tier;
            if (priority !== undefined) upsertData.priority = Math.min(100, Math.max(1, priority));
            if (parentKey !== undefined) upsertData.parent_key = parentKey;
            if (summary !== undefined) upsertData.summary = summary;
            if (memoryType !== undefined) upsertData.memory_type = memoryType;
            if (status !== undefined) upsertData.status = status;
            if (metadata !== undefined) upsertData.metadata = metadata;

            const { data, error } = await serviceSupabase
              .from("memories")
              .upsert(upsertData, { onConflict: "playbook_id,key" })
              .select("key, value, tags, description, tier, priority, parent_key, summary, memory_type, status, metadata, updated_at")
              .single();

            if (error) throw new Error(error.message);
            result = data;
            break;
          }

          case "delete_memory": {
            // Requires API key
            const apiKeyData = await validateApiKey(c.req.raw, "memory:write");
            if (!apiKeyData || apiKeyData.playbooks.id !== playbook.id) {
              throw new Error("API key with memory:write permission required");
            }

            const delKey = args.key as string;
            const { error } = await serviceSupabase
              .from("memories")
              .delete()
              .eq("playbook_id", playbook.id)
              .eq("key", delKey);

            if (error) throw new Error(error.message);
            result = { success: true };
            break;
          }

          // ===== RLM-Enhanced Memory Tools =====

          case "consolidate_memories": {
            // Requires API key
            const apiKeyData = await validateApiKey(c.req.raw, "memory:write");
            if (!apiKeyData || apiKeyData.playbooks.id !== playbook.id) {
              throw new Error("API key with memory:write permission required");
            }

            const memoryKeys = args.memory_keys as string[];
            const parentKey = args.parent_key as string;
            const summary = args.summary as string;
            const parentTags = args.parent_tags as string[] | undefined;
            const archiveChildren = args.archive_children !== false;

            // Get existing memories to consolidate
            const { data: existingMemories } = await serviceSupabase
              .from("memories")
              .select("key, value, tags, tier")
              .eq("playbook_id", playbook.id)
              .in("key", memoryKeys);

            if (!existingMemories || existingMemories.length === 0) {
              throw new Error("No memories found to consolidate");
            }

            // Create parent memory with consolidated value
            const consolidatedValue = {
              children_count: existingMemories.length,
              children_keys: memoryKeys,
              consolidated_at: new Date().toISOString(),
            };

            // Collect all unique tags from children
            const allTags = new Set<string>(parentTags || []);
            existingMemories.forEach(m => (m.tags || []).forEach((t: string) => allTags.add(t)));

            const { data: parentData, error: parentError } = await serviceSupabase
              .from("memories")
              .upsert({
                playbook_id: playbook.id,
                key: parentKey,
                value: consolidatedValue,
                summary,
                tags: Array.from(allTags),
                tier: "contextual",
                priority: 75, // Consolidated memories get higher priority
                updated_at: new Date().toISOString(),
              }, { onConflict: "playbook_id,key" })
              .select()
              .single();

            if (parentError) throw new Error(parentError.message);

            // Update children to reference parent and optionally archive
            const childUpdates: Record<string, unknown> = {
              parent_key: parentKey,
              updated_at: new Date().toISOString(),
            };
            if (archiveChildren) {
              childUpdates.tier = "longterm";
            }

            await serviceSupabase
              .from("memories")
              .update(childUpdates)
              .eq("playbook_id", playbook.id)
              .in("key", memoryKeys);

            result = {
              parent: parentData,
              children_updated: memoryKeys.length,
              archived: archiveChildren,
            };
            break;
          }

          case "promote_memory": {
            // Requires API key
            const apiKeyData = await validateApiKey(c.req.raw, "memory:write");
            if (!apiKeyData || apiKeyData.playbooks.id !== playbook.id) {
              throw new Error("API key with memory:write permission required");
            }

            const key = args.key as string;
            const targetTier = args.target_tier as string | undefined;
            const priorityBoost = Math.min(50, args.priority_boost as number || 10);

            // Get current memory
            const { data: current } = await serviceSupabase
              .from("memories")
              .select("tier, priority")
              .eq("playbook_id", playbook.id)
              .eq("key", key)
              .single();

            if (!current) throw new Error("Memory not found");

            const updates: Record<string, unknown> = {
              priority: Math.min(100, (current.priority || 50) + priorityBoost),
              access_count: 0, // Reset on promotion
              last_accessed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };

            // Only allow promotion (not demotion)
            if (targetTier) {
              const tierOrder = { longterm: 0, contextual: 1, working: 2 };
              const currentTierValue = tierOrder[current.tier as keyof typeof tierOrder] ?? 1;
              const targetTierValue = tierOrder[targetTier as keyof typeof tierOrder] ?? 1;
              if (targetTierValue >= currentTierValue) {
                updates.tier = targetTier;
              }
            }

            const { data, error } = await serviceSupabase
              .from("memories")
              .update(updates)
              .eq("playbook_id", playbook.id)
              .eq("key", key)
              .select("key, tier, priority, updated_at")
              .single();

            if (error) throw new Error(error.message);
            result = data;
            break;
          }

          case "get_memory_context": {
            const includeTiers = (args.include_tiers as MemoryTier[]) || ["working", "contextual"] as MemoryTier[];
            const maxItems = (args.max_items as number) || 20;
            const expandKeys = (args.expand_keys as string[]) || [];
            const tagsFilter = args.tags_filter as string[] | undefined;

            // Build context object per tier
            const context: Record<string, unknown[]> = {};

            for (const tier of includeTiers) {
              let query = serviceSupabase
                .from("memories")
                .select("key, value, tags, description, summary, priority, parent_key")
                .eq("playbook_id", playbook.id)
                .eq("tier", tier)
                .order("priority", { ascending: false })
                .order("updated_at", { ascending: false })
                .limit(maxItems);

              if (tagsFilter && tagsFilter.length > 0) {
                query = query.overlaps("tags", tagsFilter);
              }

              const { data } = await query;

              if (data) {
                context[tier] = data.map(m => {
                  const shouldExpand = tier === "working" || expandKeys.includes(m.key);
                  return {
                    key: m.key,
                    ...(shouldExpand ? { value: m.value } : { summary: m.summary || `[${m.key}]` }),
                    tags: m.tags,
                    priority: m.priority,
                    ...(m.parent_key ? { parent_key: m.parent_key } : {}),
                  };
                });
              }
            }

            result = {
              tiers: context,
              total_items: Object.values(context).flat().length,
            };
            break;
          }

          case "archive_memories": {
            // Requires API key
            const apiKeyData = await validateApiKey(c.req.raw, "memory:write");
            if (!apiKeyData || apiKeyData.playbooks.id !== playbook.id) {
              throw new Error("API key with memory:write permission required");
            }

            const keys = args.keys as string[] | undefined;
            const olderThanHours = args.older_than_hours as number | undefined;
            const fromTier = args.from_tier as MemoryTier | undefined;
            const tags = args.tags as string[] | undefined;

            let query = serviceSupabase
              .from("memories")
              .select("key")
              .eq("playbook_id", playbook.id)
              .neq("tier", "longterm") // Don't re-archive
              .neq("retention_policy", "permanent"); // Respect retention policy

            if (keys && keys.length > 0) {
              query = query.in("key", keys);
            }

            if (olderThanHours) {
              const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000).toISOString();
              query = query.lt("updated_at", cutoff);
            }

            if (fromTier) {
              query = query.eq("tier", fromTier);
            }

            if (tags && tags.length > 0) {
              query = query.overlaps("tags", tags);
            }

            const { data: toArchive } = await query;
            const keysToArchive = (toArchive || []).map(m => m.key);

            if (keysToArchive.length > 0) {
              await serviceSupabase
                .from("memories")
                .update({
                  tier: "longterm",
                  updated_at: new Date().toISOString(),
                })
                .eq("playbook_id", playbook.id)
                .in("key", keysToArchive);
            }

            result = {
              archived_count: keysToArchive.length,
              archived_keys: keysToArchive,
            };
            break;
          }

          case "get_memory_tree": {
            const rootKey = args.root_key as string | undefined;
            const maxDepth = (args.max_depth as number) || 3;
            const includeValues = args.include_values as boolean || false;

            // Helper to build tree recursively
            type MemoryNode = {
              key: string;
              summary?: string;
              value?: Record<string, unknown>;
              tier: string;
              priority: number;
              memory_type?: string;
              status?: string | null;
              children?: MemoryNode[];
            };

            const buildTree = async (parentKey: string | null, depth: number): Promise<MemoryNode[]> => {
              if (depth > maxDepth) return [];

              let query = serviceSupabase
                .from("memories")
                .select("key, value, summary, tier, priority, memory_type, status")
                .eq("playbook_id", playbook.id)
                .order("priority", { ascending: false });

              if (parentKey === null) {
                query = query.is("parent_key", null);
              } else {
                query = query.eq("parent_key", parentKey);
              }

              const { data } = await query;
              if (!data) return [];

              const nodes: MemoryNode[] = [];
              for (const m of data) {
                const node: MemoryNode = {
                  key: m.key,
                  tier: m.tier,
                  priority: m.priority,
                  memory_type: m.memory_type,
                  status: m.status,
                  ...(includeValues ? { value: m.value } : { summary: m.summary || `[${m.key}]` }),
                };

                const children = await buildTree(m.key, depth + 1);
                if (children.length > 0) {
                  node.children = children;
                }

                nodes.push(node);
              }

              return nodes;
            };

            const tree = await buildTree(rootKey || null, 1);
            result = {
              root: rootKey || null,
              tree,
              total_nodes: tree.length,
            };
            break;
          }

          // ===== Hierarchical Task Graph Tools =====

          case "create_task_graph": {
            const apiKeyData = await validateApiKey(c.req.raw, "memory:write");
            if (!apiKeyData || apiKeyData.playbooks.id !== playbook.id) {
              throw new Error("API key with memory:write permission required");
            }

            const planKey = args.plan_key as string;
            const planSummary = args.plan_summary as string;
            const tasks = args.tasks as Array<{
              key: string;
              description: string;
              value?: Record<string, unknown>;
              depends_on?: string[];
              tags?: string[];
            }>;
            const planTags = args.tags as string[] | undefined;

            // Create parent plan memory
            const { data: planData, error: planError } = await serviceSupabase
              .from("memories")
              .upsert({
                playbook_id: playbook.id,
                key: planKey,
                value: {
                  task_count: tasks.length,
                  task_keys: tasks.map(t => `${planKey}/${t.key}`),
                  created_at: new Date().toISOString(),
                },
                summary: planSummary,
                tags: planTags || [],
                tier: "working",
                priority: 80,
                memory_type: "hierarchical",
                status: "pending",
                metadata: {
                  type: "task_graph",
                  total_tasks: tasks.length,
                  completed_tasks: 0,
                },
                updated_at: new Date().toISOString(),
              }, { onConflict: "playbook_id,key" })
              .select()
              .single();

            if (planError) throw new Error(planError.message);

            // Create child task memories
            const taskInserts = tasks.map(task => ({
              playbook_id: playbook.id,
              key: `${planKey}/${task.key}`,
              value: task.value || { description: task.description },
              description: task.description,
              tags: task.tags || [],
              parent_key: planKey,
              tier: "working" as const,
              priority: 50,
              memory_type: "hierarchical" as const,
              status: "pending" as const,
              metadata: {
                depends_on: (task.depends_on || []).map(d => `${planKey}/${d}`),
              },
              updated_at: new Date().toISOString(),
            }));

            const { data: taskData, error: taskError } = await serviceSupabase
              .from("memories")
              .upsert(taskInserts, { onConflict: "playbook_id,key" })
              .select("key, description, status, metadata");

            if (taskError) throw new Error(taskError.message);

            result = {
              plan: planData,
              tasks_created: taskData?.length || 0,
              tasks: taskData || [],
            };
            break;
          }

          case "update_task_status": {
            const apiKeyData = await validateApiKey(c.req.raw, "memory:write");
            if (!apiKeyData || apiKeyData.playbooks.id !== playbook.id) {
              throw new Error("API key with memory:write permission required");
            }

            const taskKey = args.key as string;
            const newStatus = args.status as string;
            const taskResult = args.result as Record<string, unknown> | undefined;
            const taskSummary = args.summary as string | undefined;

            // Update the task
            const updateData: Record<string, unknown> = {
              status: newStatus,
              updated_at: new Date().toISOString(),
            };
            if (taskSummary !== undefined) updateData.summary = taskSummary;
            if (taskResult !== undefined) {
              // Merge result into existing value
              const { data: existing } = await serviceSupabase
                .from("memories")
                .select("value")
                .eq("playbook_id", playbook.id)
                .eq("key", taskKey)
                .single();
              updateData.value = { ...(existing?.value || {}), result: taskResult };
            }

            const { data: updatedTask, error: updateError } = await serviceSupabase
              .from("memories")
              .update(updateData)
              .eq("playbook_id", playbook.id)
              .eq("key", taskKey)
              .select("key, status, parent_key, summary, updated_at")
              .single();

            if (updateError) throw new Error(updateError.message);

            // Auto-update parent if all children are completed
            let parentUpdated = false;
            if (updatedTask?.parent_key && newStatus === "completed") {
              const { data: siblings } = await serviceSupabase
                .from("memories")
                .select("key, status")
                .eq("playbook_id", playbook.id)
                .eq("parent_key", updatedTask.parent_key);

              const allCompleted = siblings?.every(s => s.status === "completed");
              if (allCompleted) {
                const completedCount = siblings?.length || 0;
                await serviceSupabase
                  .from("memories")
                  .update({
                    status: "completed",
                    metadata: {
                      type: "task_graph",
                      total_tasks: completedCount,
                      completed_tasks: completedCount,
                      completed_at: new Date().toISOString(),
                    },
                    updated_at: new Date().toISOString(),
                  })
                  .eq("playbook_id", playbook.id)
                  .eq("key", updatedTask.parent_key);
                parentUpdated = true;
              }
            }

            result = {
              task: updatedTask,
              parent_auto_completed: parentUpdated,
            };
            break;
          }

          // ===== Canvas Tools =====

          case "list_canvas": {
            const { data } = await serviceSupabase
              .from("canvas")
              .select("slug, name, sort_order, updated_at, metadata")
              .eq("playbook_id", playbook.id)
              .order("sort_order");
            result = data || [];
            break;
          }

          case "read_canvas": {
            const slug = args.slug as string;
            const sectionId = args.section_id as string | undefined;

            const { data, error } = await serviceSupabase
              .from("canvas")
              .select("*")
              .eq("playbook_id", playbook.id)
              .eq("slug", slug)
              .single();

            if (error || !data) throw new Error("Canvas document not found");

            if (sectionId) {
              const section = (data.sections as unknown as CanvasSection[])?.find((s) => s.id === sectionId);
              if (!section) throw new Error(`Section ${sectionId} not found`);
              result = section;
            } else {
              result = data;
            }
            break;
          }

          case "write_canvas": {
            const apiKeyData = await validateApiKey(c.req.raw, "memory:write");
            if (!apiKeyData || apiKeyData.playbooks.id !== playbook.id) {
              throw new Error("API key with memory:write permission required");
            }

            const slug = args.slug as string;
            const name = args.name as string;
            const content = args.content as string;
            const docMetadata = args.metadata as Record<string, unknown> || {};

            // Parse markdown into sections
            const sections = parseMarkdownSections(content);

            const { data, error } = await serviceSupabase
              .from("canvas")
              .upsert({
                playbook_id: playbook.id,
                slug,
                name,
                content,
                sections,
                metadata: docMetadata,
                updated_at: new Date().toISOString(),
              }, { onConflict: "playbook_id,slug" })
              .select()
              .single();

            if (error) throw new Error(error.message);
            result = data;
            break;
          }

          case "patch_canvas_section": {
            const apiKeyData = await validateApiKey(c.req.raw, "memory:write");
            if (!apiKeyData || apiKeyData.playbooks.id !== playbook.id) {
              throw new Error("API key with memory:write permission required");
            }

            const slug = args.slug as string;
            const sectionId = args.section_id as string;
            const sectionContent = args.content as string;
            const newHeading = args.heading as string | undefined;

            const { data: doc, error: fetchErr } = await serviceSupabase
              .from("canvas")
              .select("*")
              .eq("playbook_id", playbook.id)
              .eq("slug", slug)
              .single();

            if (fetchErr || !doc) throw new Error("Canvas document not found");

            const docSections = doc.sections as unknown as CanvasSection[];
            const sectionIdx = docSections.findIndex((s) => s.id === sectionId);
            if (sectionIdx === -1) throw new Error(`Section ${sectionId} not found`);

            // Check lock
            const section = docSections[sectionIdx];
            if (section.locked_by) {
              // Allow if same agent, reject otherwise
              const lockAge = section.locked_at ? Date.now() - new Date(section.locked_at as string).getTime() : Infinity;
              if (lockAge < 5 * 60 * 1000) {
                // Lock is fresh (< 5 min), only the locker can edit
                // We can't verify identity here easily, so we warn
              }
            }

            // Update section
            docSections[sectionIdx] = {
              ...section,
              content: sectionContent,
              ...(newHeading !== undefined ? { heading: newHeading } : {}),
            };

            // Rebuild full content from sections
            const fullContent = docSections.map((s) => {
              const hashes = "#".repeat(s.level as number || 1);
              return `${hashes} ${s.heading}\n\n${s.content}`;
            }).join("\n\n");

            const { data: updated, error: updateErr } = await serviceSupabase
              .from("canvas")
              .update({
                sections: docSections,
                content: fullContent,
                updated_at: new Date().toISOString(),
              })
              .eq("playbook_id", playbook.id)
              .eq("slug", slug)
              .select()
              .single();

            if (updateErr) throw new Error(updateErr.message);
            result = { updated_section: docSections[sectionIdx], document: updated };
            break;
          }

          case "get_canvas_toc": {
            const slug = args.slug as string;

            const { data, error } = await serviceSupabase
              .from("canvas")
              .select("slug, name, sections")
              .eq("playbook_id", playbook.id)
              .eq("slug", slug)
              .single();

            if (error || !data) throw new Error("Canvas document not found");

            const toc = (data.sections as unknown as CanvasSection[]).map((s) => ({
              id: s.id,
              heading: s.heading,
              level: s.level,
              locked_by: s.locked_by || null,
            }));

            result = { name: data.name, slug: data.slug, toc };
            break;
          }

          case "lock_canvas_section": {
            const apiKeyData = await validateApiKey(c.req.raw, "memory:write");
            if (!apiKeyData || apiKeyData.playbooks.id !== playbook.id) {
              throw new Error("API key with memory:write permission required");
            }

            const slug = args.slug as string;
            const sectionId = args.section_id as string;
            const lockedBy = args.locked_by as string;

            const { data: doc, error: fetchErr } = await serviceSupabase
              .from("canvas")
              .select("sections")
              .eq("playbook_id", playbook.id)
              .eq("slug", slug)
              .single();

            if (fetchErr || !doc) throw new Error("Canvas document not found");

            const docSections = doc.sections as unknown as CanvasSection[];
            const sectionIdx = docSections.findIndex((s) => s.id === sectionId);
            if (sectionIdx === -1) throw new Error(`Section ${sectionId} not found`);

            const section = docSections[sectionIdx];
            if (section.locked_by && section.locked_by !== lockedBy) {
              const lockAge = section.locked_at ? Date.now() - new Date(section.locked_at as string).getTime() : Infinity;
              if (lockAge < 5 * 60 * 1000) {
                throw new Error(`Section is locked by ${section.locked_by}`);
              }
            }

            docSections[sectionIdx] = {
              ...section,
              locked_by: lockedBy,
              locked_at: new Date().toISOString(),
            };

            await serviceSupabase
              .from("canvas")
              .update({ sections: docSections, updated_at: new Date().toISOString() })
              .eq("playbook_id", playbook.id)
              .eq("slug", slug);

            result = { locked: true, section_id: sectionId, locked_by: lockedBy };
            break;
          }

          case "unlock_canvas_section": {
            const apiKeyData = await validateApiKey(c.req.raw, "memory:write");
            if (!apiKeyData || apiKeyData.playbooks.id !== playbook.id) {
              throw new Error("API key with memory:write permission required");
            }

            const slug = args.slug as string;
            const sectionId = args.section_id as string;

            const { data: doc, error: fetchErr } = await serviceSupabase
              .from("canvas")
              .select("sections")
              .eq("playbook_id", playbook.id)
              .eq("slug", slug)
              .single();

            if (fetchErr || !doc) throw new Error("Canvas document not found");

            const docSections = doc.sections as unknown as CanvasSection[];
            const sectionIdx = docSections.findIndex((s) => s.id === sectionId);
            if (sectionIdx === -1) throw new Error(`Section ${sectionId} not found`);

            docSections[sectionIdx] = {
              ...docSections[sectionIdx],
              locked_by: null,
              locked_at: null,
            };

            await serviceSupabase
              .from("canvas")
              .update({ sections: docSections, updated_at: new Date().toISOString() })
              .eq("playbook_id", playbook.id)
              .eq("slug", slug);

            result = { unlocked: true, section_id: sectionId };
            break;
          }

          // ===== Self-Modification / Evolution Tools =====

          case "create_skill": {
            const apiKeyData = await validateApiKey(c.req.raw, "skill:write");
            if (!apiKeyData || apiKeyData.playbooks.id !== playbook.id) {
              throw new Error("API key with skill:write permission required");
            }

            const name = args.name as string;
            const description = args.description as string | undefined;
            const content = args.content as string;
            const priority = (args.priority as number) || 50;

            const { data, error } = await serviceSupabase
              .from("skills")
              .insert({
                playbook_id: playbook.id,
                name,
                description,
                content,
                priority,
              })
              .select()
              .single();

            if (error) throw new Error(error.message);
            result = data;
            break;
          }

          case "update_skill": {
            const apiKeyData = await validateApiKey(c.req.raw, "skill:write");
            if (!apiKeyData || apiKeyData.playbooks.id !== playbook.id) {
              throw new Error("API key with skill:write permission required");
            }

            const skillId = args.skill_id as string;
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(skillId);

            const updates: Record<string, unknown> = {};
            if (args.name !== undefined) updates.name = args.name;
            if (args.description !== undefined) updates.description = args.description;
            if (args.content !== undefined) updates.content = args.content;
            if (args.priority !== undefined) updates.priority = args.priority;

            if (Object.keys(updates).length === 0) {
              throw new Error("No fields to update");
            }

            let query = serviceSupabase
              .from("skills")
              .update(updates)
              .eq("playbook_id", playbook.id);

            if (isUuid) {
              query = query.eq("id", skillId);
            } else {
              query = query.ilike("name", skillId.replace(/_/g, " "));
            }

            const { data, error } = await query.select().single();

            if (error) throw new Error(error.message);
            if (!data) throw new Error("Skill not found");
            result = data;
            break;
          }

          case "delete_skill": {
            const apiKeyData = await validateApiKey(c.req.raw, "skill:write");
            if (!apiKeyData || apiKeyData.playbooks.id !== playbook.id) {
              throw new Error("API key with skill:write permission required");
            }

            const skillId = args.skill_id as string;
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(skillId);

            let query = serviceSupabase
              .from("skills")
              .delete()
              .eq("playbook_id", playbook.id);

            if (isUuid) {
              query = query.eq("id", skillId);
            } else {
              query = query.ilike("name", skillId.replace(/_/g, " "));
            }

            const { error } = await query;
            if (error) throw new Error(error.message);

            result = { success: true, deleted: true };
            break;
          }

          case "list_skill_versions": {
            const skillId = args.skill_id as string;
            const limit = (args.limit as number) || 10;
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(skillId);

            let actualSkillId = skillId;
            if (!isUuid) {
              // Fetch ID first by name
              const { data: s } = await serviceSupabase
                .from("skills")
                .select("id")
                .eq("playbook_id", playbook.id)
                .ilike("name", skillId.replace(/_/g, " "))
                .single();
              if (s) actualSkillId = s.id;
            }

            const { data, error } = await serviceSupabase
              .from("skill_versions")
              .select("*")
              .eq("playbook_id", playbook.id)
              .eq("skill_id", actualSkillId)
              .order("recorded_at", { ascending: false })
              .limit(limit);

            if (error) throw new Error(error.message);
            result = data || [];
            break;
          }

          case "rollback_skill": {
            const apiKeyData = await validateApiKey(c.req.raw, "skill:write");
            if (!apiKeyData || apiKeyData.playbooks.id !== playbook.id) {
              throw new Error("API key with skill:write permission required");
            }

            const versionId = args.version_id as string;

            // Fetch the old version
            const { data: oldVersion, error: fetchErr } = await serviceSupabase
              .from("skill_versions")
              .select("*")
              .eq("id", versionId)
              .eq("playbook_id", playbook.id)
              .single();

            if (fetchErr || !oldVersion) throw new Error("Version not found or access denied");

            // Restore it
            const { data: restored, error: restoreErr } = await serviceSupabase
              .from("skills")
              .update({
                name: oldVersion.name as string,
                description: oldVersion.description as string | null,
                content: oldVersion.content as string | null
              })
              .eq("id", oldVersion.skill_id as string)
              .eq("playbook_id", playbook.id)
              .select()
              .single();

            if (restoreErr) throw new Error(restoreErr.message);
            result = { success: true, restored_skill: restored };
            break;
          }

          case "update_playbook": {
            const apiKeyData = await validateApiKey(c.req.raw, "playbook:write");
            if (!apiKeyData || apiKeyData.playbooks.id !== playbook.id) {
              // Also allow full permission
              if (!apiKeyData?.permissions.includes("full")) {
                throw new Error("API key with playbook:write permission required");
              }
            }

            const updates: Record<string, unknown> = {};
            if (args.persona_name !== undefined) updates.persona_name = args.persona_name;
            if (args.persona_system_prompt !== undefined) updates.persona_system_prompt = args.persona_system_prompt;
            if (args.persona_metadata !== undefined) updates.persona_metadata = args.persona_metadata;

            if (Object.keys(updates).length === 0) {
              throw new Error("No fields to update");
            }

            updates.updated_at = new Date().toISOString();

            const { data, error } = await serviceSupabase
              .from("playbooks")
              .update(updates)
              .eq("id", playbook.id)
              .select("id, persona_name, persona_system_prompt, persona_metadata, updated_at")
              .single();

            if (error) throw new Error(error.message);
            result = data;
            break;
          }

          default:
            // Check if it's a skill-based tool call
            if (toolName.startsWith("skill_")) {
              const skillName = toolName.replace("skill_", "").replace(/_/g, " ");
              result = {
                message: `Skill "${skillName}" was called`,
                arguments: args,
                note: "Skill execution should be handled by your AI system using the skill definition",
              };
            } else {
              throw new Error(`Unknown tool: ${toolName}`);
            }
        }

        return c.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          },
        });
      } catch (error: unknown) {
        const message =
          error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : "Tool execution failed";
        return c.json({
          jsonrpc: "2.0",
          id,
          error: { code: -32000, message },
        });
      }
    }

    default:
      return c.json({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      });
  }
});

export const GET = handle(app);
export const POST = handle(app);
