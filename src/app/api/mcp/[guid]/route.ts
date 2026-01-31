import { handle } from "hono/vercel";
import { createApiApp } from "@/app/api/_shared/hono";
import { validateApiKey } from "@/app/api/_shared/auth";
import { getServiceSupabase, getSupabase } from "@/app/api/_shared/supabase";
import type { McpResource, McpTool, Playbook, MemoryTier } from "@/lib/supabase/types";

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


// Built-in MCP tools for playbook access
// Note: Persona is embedded in the MCP manifest under _playbook.persona
// RLM-Enhanced: Includes hierarchical memory management tools
const PLAYBOOK_TOOLS: McpTool[] = [
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
    description: "Read a specific memory entry by key. Automatically increments access count.",
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
    description: "Search memories by text, tags, or tier. Returns summaries for large memories.",
    inputSchema: {
      type: "object",
      properties: {
        search: { type: "string", description: "Search in keys and descriptions" },
        tags: { type: "array", items: { type: "string" }, description: "Filter by tags (any match)" },
        tier: { type: "string", enum: ["working", "contextual", "longterm"], description: "Filter by memory tier" },
        include_children: { type: "boolean", description: "Include child memories in results", default: false },
      },
    },
  },
  {
    name: "write_memory",
    description: "Write a memory entry with optional tier and priority (requires API key)",
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
    description: "Get hierarchical tree view of memories showing parent-child relationships.",
    inputSchema: {
      type: "object",
      properties: {
        root_key: { type: "string", description: "Start from this key (omit for all roots)" },
        max_depth: { type: "number", description: "Maximum tree depth", default: 3 },
        include_values: { type: "boolean", description: "Include full values (false = summaries only)", default: false },
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

  // Get playbook with all related data
  const { data: playbook, error } = await supabase
    .from("playbooks")
    .select("*")
    .eq("guid", guid)
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

  // Get playbook
  const { data: playbook } = await supabase
    .from("playbooks")
    .select("id, persona_name, persona_system_prompt, persona_metadata")
    .eq("guid", guid)
    .eq("visibility", "public")
    .single();

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
          uri: `playbook://${guid}/skills`,
          name: "Skills",
          description: "Capabilities, rules, and how to solve tasks",
          mimeType: "application/json",
        },
        {
          uri: `playbook://${guid}/memory`,
          name: "Memory",
          description: "Persistent memory storage with tags",
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

      // Memory resource
      if (uri?.match(/\/memory$/)) {
        const { data: memories } = await serviceSupabase
          .from("memories")
          .select("key, value, tags, description, updated_at")
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
            const includeChildren = args.include_children as boolean | undefined;

            let query = serviceSupabase
              .from("memories")
              .select("key, value, tags, description, tier, priority, parent_key, summary, updated_at")
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

            const { data, error } = await serviceSupabase
              .from("memories")
              .upsert(upsertData, { onConflict: "playbook_id,key" })
              .select("key, value, tags, description, tier, priority, parent_key, summary, updated_at")
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
              children?: MemoryNode[];
            };

            const buildTree = async (parentKey: string | null, depth: number): Promise<MemoryNode[]> => {
              if (depth > maxDepth) return [];

              let query = serviceSupabase
                .from("memories")
                .select("key, value, summary, tier, priority")
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
