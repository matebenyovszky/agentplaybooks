import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/client";
import { hashApiKey } from "@/lib/utils";
import type { McpResource, McpTool } from "@/lib/supabase/types";

// MCP Protocol implementation for Cloudflare Workers / Next.js
// Supports: tools/list, resources/list, resources/read, tools/call

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createServerClient(url, key);
}

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createServerClient(url, key);
}

function playbookToPersona(playbook: any) {
  return {
    id: playbook.id,
    playbook_id: playbook.id,
    name: playbook.persona_name || "Assistant",
    system_prompt: playbook.persona_system_prompt || "You are a helpful AI assistant.",
    metadata: playbook.persona_metadata || {},
  };
}

// Validate playbook API key
async function validateApiKey(request: NextRequest, playbookId: string, permission: string): Promise<boolean> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer apb_")) {
    return false;
  }

  const apiKey = authHeader.replace("Bearer ", "");
  const keyHash = await hashApiKey(apiKey);
  const supabase = getServiceSupabase();

  const { data } = await supabase
    .from("api_keys")
    .select("*")
    .eq("key_hash", keyHash)
    .eq("playbook_id", playbookId)
    .eq("is_active", true)
    .single();

  if (!data) return false;
  if (data.expires_at && new Date(data.expires_at) < new Date()) return false;
  if (!data.permissions.includes(permission) && !data.permissions.includes("full")) return false;

  // Update last_used_at
  await supabase
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);

  return true;
}

// Built-in MCP tools for playbook access
// Note: Persona is embedded in the MCP manifest under _playbook.persona
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
    description: "Read a specific memory entry by key",
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
    description: "Search memories by text or tags",
    inputSchema: {
      type: "object",
      properties: {
        search: { type: "string", description: "Search in keys and descriptions" },
        tags: { type: "array", items: { type: "string" }, description: "Filter by tags (any match)" },
      },
    },
  },
  {
    name: "write_memory",
    description: "Write a memory entry (requires API key)",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string", description: "Memory key" },
        value: { type: "object", description: "Value to store" },
        tags: { type: "array", items: { type: "string" }, description: "Tags for categorization" },
        description: { type: "string", description: "Human-readable description" },
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
];

// GET /api/mcp/:guid - Return MCP server manifest
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ guid: string }> }
) {
  const { guid } = await params;
  const supabase = getSupabase();

  // Get playbook with all related data
  const { data: playbook, error } = await supabase
    .from("playbooks")
    .select("*")
    .eq("guid", guid)
    .eq("is_public", true)
    .single();

  if (error || !playbook) {
    return NextResponse.json({ error: "Playbook not found" }, { status: 404 });
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
  for (const skill of skills) {
    tools.push({
      name: `skill_${skill.name.toLowerCase().replace(/\s+/g, "_")}`,
      description: skill.description || skill.name,
      inputSchema: (skill.definition?.parameters || { type: "object", properties: {} }) as Record<string, unknown>,
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

  return NextResponse.json(manifest);
}

// POST /api/mcp/:guid - Handle MCP JSON-RPC requests
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ guid: string }> }
) {
  const { guid } = await params;
  const body = await request.json();
  
  const { method, params: rpcParams, id } = body;

  const supabase = getSupabase();

  // Get playbook
  const { data: playbook } = await supabase
    .from("playbooks")
    .select("id, persona_name, persona_system_prompt, persona_metadata")
    .eq("guid", guid)
    .eq("is_public", true)
    .single();

  if (!playbook) {
    return NextResponse.json({
      jsonrpc: "2.0",
      id,
      error: { code: -32001, message: "Playbook not found" },
    });
  }

  // Handle MCP methods
  switch (method) {
    case "initialize":
      return NextResponse.json({
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
      const skillTools = (skills || []).map((skill) => ({
        name: `skill_${skill.name.toLowerCase().replace(/\s+/g, "_")}`,
        description: skill.description || skill.name,
        inputSchema: skill.definition?.parameters || { type: "object", properties: {} },
      }));

      // Combine with built-in playbook tools
      const allTools = [...PLAYBOOK_TOOLS, ...skillTools];

      return NextResponse.json({
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

      return NextResponse.json({
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

        return NextResponse.json({
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
        return NextResponse.json({
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

        return NextResponse.json({
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
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            error: { code: -32002, message: "Attachment not found" },
          });
        }

        return NextResponse.json({
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

      return NextResponse.json({
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
              .select("key, value, tags, description, updated_at")
              .eq("playbook_id", playbook.id)
              .eq("key", key)
              .single();
            if (!data) throw new Error("Memory not found");
            result = data;
            break;
          }

          case "search_memory": {
            const search = args.search as string | undefined;
            const tags = args.tags as string[] | undefined;

            let query = serviceSupabase
              .from("memories")
              .select("key, value, tags, description, updated_at")
              .eq("playbook_id", playbook.id);

            if (search) {
              query = query.or(`key.ilike.%${search}%,description.ilike.%${search}%`);
            }

            if (tags && tags.length > 0) {
              query = query.overlaps("tags", tags);
            }

            const { data } = await query.order("updated_at", { ascending: false });
            result = data || [];
            break;
          }

          case "write_memory": {
            // Requires API key
            const hasPermission = await validateApiKey(request, playbook.id, "memory:write");
            if (!hasPermission) {
              throw new Error("API key with memory:write permission required");
            }

            const key = args.key as string;
            const value = args.value as Record<string, unknown>;
            const memTags = args.tags as string[] | undefined;
            const description = args.description as string | undefined;

            const upsertData: Record<string, unknown> = {
              playbook_id: playbook.id,
              key,
              value,
              updated_at: new Date().toISOString(),
            };
            if (memTags !== undefined) upsertData.tags = memTags;
            if (description !== undefined) upsertData.description = description;

            const { data, error } = await serviceSupabase
              .from("memories")
              .upsert(upsertData, { onConflict: "playbook_id,key" })
              .select("key, value, tags, description, updated_at")
              .single();

            if (error) throw new Error(error.message);
            result = data;
            break;
          }

          case "delete_memory": {
            // Requires API key
            const hasDeletePermission = await validateApiKey(request, playbook.id, "memory:write");
            if (!hasDeletePermission) {
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

        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          },
        });
      } catch (error: any) {
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          error: { code: -32000, message: error.message || "Tool execution failed" },
        });
      }
    }

    default:
      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      });
  }
}


