import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/client";
import { hashApiKey, generateGuid } from "@/lib/utils";
import type { UserApiKeysRow } from "@/lib/supabase/types";

// MCP Server for Playbook Management
// Allows AI agents to create and manage playbooks via User API Key

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createServerClient(url, key);
}

// Validate User API Key
async function validateUserApiKey(request: NextRequest): Promise<UserApiKeysRow | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer apb_")) {
    return null;
  }

  const apiKey = authHeader.replace("Bearer ", "");
  const keyHash = await hashApiKey(apiKey);
  const supabase = getServiceSupabase();

  const { data } = await supabase
    .from("user_api_keys")
    .select("*")
    .eq("key_hash", keyHash)
    .eq("is_active", true)
    .single();

  if (!data) {
    return null;
  }

  // Check expiration
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return null;
  }

  // Update last_used_at
  await supabase
    .from("user_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);

  return data;
}

// Check permission
function hasPermission(userKey: UserApiKeysRow, permission: string): boolean {
  return userKey.permissions.includes(permission) || userKey.permissions.includes("full");
}

// MCP Tool definitions
const MCP_TOOLS = [
  {
    name: "list_playbooks",
    description: "List all playbooks owned by the authenticated user. Returns playbooks with their counts of personas, skills, and MCP servers.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "create_playbook",
    description: "Create a new playbook. A playbook is a container for personas (AI personalities), skills (capabilities), and memory (persistent storage).",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name of the playbook" },
        description: { type: "string", description: "Description of what the playbook is for" },
        is_public: { type: "boolean", description: "Whether the playbook should be publicly visible", default: false },
      },
      required: ["name"],
    },
  },
  {
    name: "get_playbook",
    description: "Get detailed information about a specific playbook including all personas, skills, and MCP servers.",
    inputSchema: {
      type: "object",
      properties: {
        playbook_id: { type: "string", description: "UUID of the playbook" },
      },
      required: ["playbook_id"],
    },
  },
  {
    name: "update_playbook",
    description: "Update a playbook's name, description, or visibility.",
    inputSchema: {
      type: "object",
      properties: {
        playbook_id: { type: "string", description: "UUID of the playbook" },
        name: { type: "string", description: "New name" },
        description: { type: "string", description: "New description" },
        is_public: { type: "boolean", description: "Whether the playbook should be public" },
      },
      required: ["playbook_id"],
    },
  },
  {
    name: "delete_playbook",
    description: "Delete a playbook and all its contents (personas, skills, memory, API keys). This action cannot be undone!",
    inputSchema: {
      type: "object",
      properties: {
        playbook_id: { type: "string", description: "UUID of the playbook to delete" },
      },
      required: ["playbook_id"],
    },
  },
  {
    name: "create_persona",
    description: "Add a persona (AI personality with system prompt) to a playbook.",
    inputSchema: {
      type: "object",
      properties: {
        playbook_id: { type: "string", description: "UUID of the playbook" },
        name: { type: "string", description: "Name of the persona" },
        system_prompt: { type: "string", description: "The system prompt that defines this persona's behavior" },
        metadata: { type: "object", description: "Optional metadata" },
      },
      required: ["playbook_id", "name", "system_prompt"],
    },
  },
  {
    name: "update_persona",
    description: "Update a persona's name, system prompt, or metadata.",
    inputSchema: {
      type: "object",
      properties: {
        playbook_id: { type: "string", description: "UUID of the playbook" },
        persona_id: { type: "string", description: "UUID of the persona" },
        name: { type: "string", description: "New name" },
        system_prompt: { type: "string", description: "New system prompt" },
        metadata: { type: "object", description: "New metadata" },
      },
      required: ["playbook_id", "persona_id"],
    },
  },
  {
    name: "delete_persona",
    description: "Delete a persona from a playbook.",
    inputSchema: {
      type: "object",
      properties: {
        playbook_id: { type: "string", description: "UUID of the playbook" },
        persona_id: { type: "string", description: "UUID of the persona to delete" },
      },
      required: ["playbook_id", "persona_id"],
    },
  },
  {
    name: "create_skill",
    description: "Add a skill (capability/tool definition) to a playbook. Skills define what the AI can do with input/output schemas.",
    inputSchema: {
      type: "object",
      properties: {
        playbook_id: { type: "string", description: "UUID of the playbook" },
        name: { type: "string", description: "Skill name (use snake_case, e.g., 'code_review')" },
        description: { type: "string", description: "Description of what the skill does" },
        definition: {
          type: "object",
          description: "Skill definition with parameters schema. Example: { parameters: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] } }",
        },
        examples: { type: "array", description: "Example usages of the skill" },
      },
      required: ["playbook_id", "name"],
    },
  },
  {
    name: "update_skill",
    description: "Update a skill's name, description, definition, or examples.",
    inputSchema: {
      type: "object",
      properties: {
        playbook_id: { type: "string", description: "UUID of the playbook" },
        skill_id: { type: "string", description: "UUID of the skill" },
        name: { type: "string", description: "New name" },
        description: { type: "string", description: "New description" },
        definition: { type: "object", description: "New definition" },
        examples: { type: "array", description: "New examples" },
      },
      required: ["playbook_id", "skill_id"],
    },
  },
  {
    name: "delete_skill",
    description: "Delete a skill from a playbook.",
    inputSchema: {
      type: "object",
      properties: {
        playbook_id: { type: "string", description: "UUID of the playbook" },
        skill_id: { type: "string", description: "UUID of the skill to delete" },
      },
      required: ["playbook_id", "skill_id"],
    },
  },
  {
    name: "read_memory",
    description: "Read memory entries from a playbook. Memory is a key-value store for persistent data.",
    inputSchema: {
      type: "object",
      properties: {
        playbook_id: { type: "string", description: "UUID of the playbook" },
        key: { type: "string", description: "Optional specific key to read" },
      },
      required: ["playbook_id"],
    },
  },
  {
    name: "write_memory",
    description: "Write a memory entry to a playbook. If the key exists, it will be updated.",
    inputSchema: {
      type: "object",
      properties: {
        playbook_id: { type: "string", description: "UUID of the playbook" },
        key: { type: "string", description: "Memory key" },
        value: { type: "object", description: "Value to store (any JSON object)" },
      },
      required: ["playbook_id", "key", "value"],
    },
  },
  {
    name: "delete_memory",
    description: "Delete a memory entry from a playbook.",
    inputSchema: {
      type: "object",
      properties: {
        playbook_id: { type: "string", description: "UUID of the playbook" },
        key: { type: "string", description: "Memory key to delete" },
      },
      required: ["playbook_id", "key"],
    },
  },
];

// GET /api/mcp/manage - Return MCP server manifest
export async function GET(request: NextRequest) {
  const userKey = await validateUserApiKey(request);
  
  // Return manifest even without auth (for discovery)
  // But indicate that auth is required for tool execution
  
  const manifest = {
    protocolVersion: "2024-11-05",
    serverInfo: {
      name: "AgentPlaybooks Management",
      version: "1.0.0",
      description: "MCP server for managing AgentPlaybooks. Create, update, and delete playbooks, personas, skills, and memory. Requires User API Key authentication.",
    },
    capabilities: {
      tools: {},
    },
    tools: MCP_TOOLS,
    _auth: {
      required: true,
      type: "bearer",
      description: "User API Key starting with apb_live_",
      authenticated: !!userKey,
    },
  };

  return NextResponse.json(manifest);
}

// POST /api/mcp/manage - Handle MCP JSON-RPC requests
export async function POST(request: NextRequest) {
  const userKey = await validateUserApiKey(request);
  
  const body = await request.json();
  const { method, params, id } = body;

  // Handle MCP methods
  switch (method) {
    case "initialize":
      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          serverInfo: { name: "AgentPlaybooks Management", version: "1.0.0" },
          capabilities: { tools: {} },
        },
      });

    case "tools/list":
      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        result: { tools: MCP_TOOLS },
      });

    case "tools/call": {
      const toolName = params?.name as string;
      const args = params?.arguments || {};

      // All tool calls require authentication
      if (!userKey) {
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          error: {
            code: -32001,
            message: "Authentication required. Provide User API Key in Authorization header.",
          },
        });
      }

      try {
        const result = await executeManagementTool(toolName, args, userKey);
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
          error: {
            code: -32000,
            message: error.message || "Tool execution failed",
          },
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

// Execute management tools
async function executeManagementTool(
  toolName: string,
  args: Record<string, unknown>,
  userKey: UserApiKeysRow
): Promise<unknown> {
  const supabase = getServiceSupabase();
  const userId = userKey.user_id;

  switch (toolName) {
    case "list_playbooks": {
      if (!hasPermission(userKey, "playbooks:read")) {
        throw new Error("Permission denied: playbooks:read required");
      }

      const { data, error } = await supabase
        .from("playbooks")
        .select(`
          *,
          personas:personas(count),
          skills:skills(count),
          mcp_servers:mcp_servers(count)
        `)
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });

      if (error) throw new Error(error.message);

      return (data || []).map((p: any) => ({
        id: p.id,
        guid: p.guid,
        name: p.name,
        description: p.description,
        is_public: p.is_public,
        persona_count: p.personas?.[0]?.count || 0,
        skill_count: p.skills?.[0]?.count || 0,
        mcp_server_count: p.mcp_servers?.[0]?.count || 0,
        created_at: p.created_at,
        updated_at: p.updated_at,
      }));
    }

    case "create_playbook": {
      if (!hasPermission(userKey, "playbooks:write")) {
        throw new Error("Permission denied: playbooks:write required");
      }

      const { name, description, is_public } = args as {
        name: string;
        description?: string;
        is_public?: boolean;
      };

      if (!name) throw new Error("name is required");

      const guid = generateGuid();

      const { data, error } = await supabase
        .from("playbooks")
        .insert({
          user_id: userId,
          guid,
          name,
          description: description || null,
          is_public: is_public || false,
          config: {},
        })
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    }

    case "get_playbook": {
      if (!hasPermission(userKey, "playbooks:read")) {
        throw new Error("Permission denied: playbooks:read required");
      }

      const { playbook_id } = args as { playbook_id: string };
      if (!playbook_id) throw new Error("playbook_id is required");

      const { data: playbook, error } = await supabase
        .from("playbooks")
        .select("*")
        .eq("id", playbook_id)
        .eq("user_id", userId)
        .single();

      if (error || !playbook) throw new Error("Playbook not found");

      const [personas, skills, mcpServers, memories] = await Promise.all([
        supabase.from("personas").select("*").eq("playbook_id", playbook.id),
        supabase.from("skills").select("*").eq("playbook_id", playbook.id),
        supabase.from("mcp_servers").select("*").eq("playbook_id", playbook.id),
        supabase.from("memories").select("*").eq("playbook_id", playbook.id),
      ]);

      return {
        ...playbook,
        personas: personas.data || [],
        skills: skills.data || [],
        mcp_servers: mcpServers.data || [],
        memories: memories.data || [],
      };
    }

    case "update_playbook": {
      if (!hasPermission(userKey, "playbooks:write")) {
        throw new Error("Permission denied: playbooks:write required");
      }

      const { playbook_id, name, description, is_public } = args as {
        playbook_id: string;
        name?: string;
        description?: string;
        is_public?: boolean;
      };

      if (!playbook_id) throw new Error("playbook_id is required");

      const updateData: Record<string, unknown> = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (is_public !== undefined) updateData.is_public = is_public;

      const { data, error } = await supabase
        .from("playbooks")
        .update(updateData)
        .eq("id", playbook_id)
        .eq("user_id", userId)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    }

    case "delete_playbook": {
      if (!hasPermission(userKey, "playbooks:write")) {
        throw new Error("Permission denied: playbooks:write required");
      }

      const { playbook_id } = args as { playbook_id: string };
      if (!playbook_id) throw new Error("playbook_id is required");

      const { error } = await supabase
        .from("playbooks")
        .delete()
        .eq("id", playbook_id)
        .eq("user_id", userId);

      if (error) throw new Error(error.message);
      return { success: true, message: "Playbook deleted" };
    }

    case "create_persona": {
      if (!hasPermission(userKey, "personas:write")) {
        throw new Error("Permission denied: personas:write required");
      }

      const { playbook_id, name, system_prompt, metadata } = args as {
        playbook_id: string;
        name: string;
        system_prompt: string;
        metadata?: Record<string, unknown>;
      };

      if (!playbook_id) throw new Error("playbook_id is required");
      if (!name) throw new Error("name is required");
      if (!system_prompt) throw new Error("system_prompt is required");

      // Verify ownership
      const { data: playbook } = await supabase
        .from("playbooks")
        .select("id")
        .eq("id", playbook_id)
        .eq("user_id", userId)
        .single();

      if (!playbook) throw new Error("Playbook not found");

      const { data, error } = await supabase
        .from("personas")
        .insert({
          playbook_id,
          name,
          system_prompt,
          metadata: metadata || {},
        })
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    }

    case "update_persona": {
      if (!hasPermission(userKey, "personas:write")) {
        throw new Error("Permission denied: personas:write required");
      }

      const { playbook_id, persona_id, ...updates } = args as {
        playbook_id: string;
        persona_id: string;
        name?: string;
        system_prompt?: string;
        metadata?: Record<string, unknown>;
      };

      if (!playbook_id || !persona_id) {
        throw new Error("playbook_id and persona_id are required");
      }

      // Verify ownership
      const { data: playbook } = await supabase
        .from("playbooks")
        .select("id")
        .eq("id", playbook_id)
        .eq("user_id", userId)
        .single();

      if (!playbook) throw new Error("Playbook not found");

      const { data, error } = await supabase
        .from("personas")
        .update(updates)
        .eq("id", persona_id)
        .eq("playbook_id", playbook_id)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    }

    case "delete_persona": {
      if (!hasPermission(userKey, "personas:write")) {
        throw new Error("Permission denied: personas:write required");
      }

      const { playbook_id, persona_id } = args as {
        playbook_id: string;
        persona_id: string;
      };

      if (!playbook_id || !persona_id) {
        throw new Error("playbook_id and persona_id are required");
      }

      // Verify ownership
      const { data: playbook } = await supabase
        .from("playbooks")
        .select("id")
        .eq("id", playbook_id)
        .eq("user_id", userId)
        .single();

      if (!playbook) throw new Error("Playbook not found");

      const { error } = await supabase
        .from("personas")
        .delete()
        .eq("id", persona_id)
        .eq("playbook_id", playbook_id);

      if (error) throw new Error(error.message);
      return { success: true };
    }

    case "create_skill": {
      if (!hasPermission(userKey, "skills:write")) {
        throw new Error("Permission denied: skills:write required");
      }

      const { playbook_id, name, description, definition, examples } = args as {
        playbook_id: string;
        name: string;
        description?: string;
        definition?: Record<string, unknown>;
        examples?: unknown[];
      };

      if (!playbook_id) throw new Error("playbook_id is required");
      if (!name) throw new Error("name is required");

      // Verify ownership
      const { data: playbook } = await supabase
        .from("playbooks")
        .select("id")
        .eq("id", playbook_id)
        .eq("user_id", userId)
        .single();

      if (!playbook) throw new Error("Playbook not found");

      const { data, error } = await supabase
        .from("skills")
        .insert({
          playbook_id,
          name,
          description: description || null,
          definition: definition || {},
          examples: examples || [],
        })
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    }

    case "update_skill": {
      if (!hasPermission(userKey, "skills:write")) {
        throw new Error("Permission denied: skills:write required");
      }

      const { playbook_id, skill_id, ...updates } = args as {
        playbook_id: string;
        skill_id: string;
        name?: string;
        description?: string;
        definition?: Record<string, unknown>;
        examples?: unknown[];
      };

      if (!playbook_id || !skill_id) {
        throw new Error("playbook_id and skill_id are required");
      }

      // Verify ownership
      const { data: playbook } = await supabase
        .from("playbooks")
        .select("id")
        .eq("id", playbook_id)
        .eq("user_id", userId)
        .single();

      if (!playbook) throw new Error("Playbook not found");

      const { data, error } = await supabase
        .from("skills")
        .update(updates)
        .eq("id", skill_id)
        .eq("playbook_id", playbook_id)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    }

    case "delete_skill": {
      if (!hasPermission(userKey, "skills:write")) {
        throw new Error("Permission denied: skills:write required");
      }

      const { playbook_id, skill_id } = args as {
        playbook_id: string;
        skill_id: string;
      };

      if (!playbook_id || !skill_id) {
        throw new Error("playbook_id and skill_id are required");
      }

      // Verify ownership
      const { data: playbook } = await supabase
        .from("playbooks")
        .select("id")
        .eq("id", playbook_id)
        .eq("user_id", userId)
        .single();

      if (!playbook) throw new Error("Playbook not found");

      const { error } = await supabase
        .from("skills")
        .delete()
        .eq("id", skill_id)
        .eq("playbook_id", playbook_id);

      if (error) throw new Error(error.message);
      return { success: true };
    }

    case "read_memory": {
      if (!hasPermission(userKey, "memory:read")) {
        throw new Error("Permission denied: memory:read required");
      }

      const { playbook_id, key } = args as {
        playbook_id: string;
        key?: string;
      };

      if (!playbook_id) throw new Error("playbook_id is required");

      // Verify ownership
      const { data: playbook } = await supabase
        .from("playbooks")
        .select("id")
        .eq("id", playbook_id)
        .eq("user_id", userId)
        .single();

      if (!playbook) throw new Error("Playbook not found");

      let query = supabase
        .from("memories")
        .select("key, value, updated_at")
        .eq("playbook_id", playbook_id);

      if (key) {
        query = query.eq("key", key);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);

      if (key && data?.length) {
        return data[0];
      }
      return data || [];
    }

    case "write_memory": {
      if (!hasPermission(userKey, "memory:write")) {
        throw new Error("Permission denied: memory:write required");
      }

      const { playbook_id, key, value } = args as {
        playbook_id: string;
        key: string;
        value: Record<string, unknown>;
      };

      if (!playbook_id) throw new Error("playbook_id is required");
      if (!key) throw new Error("key is required");
      if (value === undefined) throw new Error("value is required");

      // Verify ownership
      const { data: playbook } = await supabase
        .from("playbooks")
        .select("id")
        .eq("id", playbook_id)
        .eq("user_id", userId)
        .single();

      if (!playbook) throw new Error("Playbook not found");

      const { data, error } = await supabase
        .from("memories")
        .upsert({
          playbook_id,
          key,
          value,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: "playbook_id,key",
        })
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    }

    case "delete_memory": {
      if (!hasPermission(userKey, "memory:write")) {
        throw new Error("Permission denied: memory:write required");
      }

      const { playbook_id, key } = args as {
        playbook_id: string;
        key: string;
      };

      if (!playbook_id) throw new Error("playbook_id is required");
      if (!key) throw new Error("key is required");

      // Verify ownership
      const { data: playbook } = await supabase
        .from("playbooks")
        .select("id")
        .eq("id", playbook_id)
        .eq("user_id", userId)
        .single();

      if (!playbook) throw new Error("Playbook not found");

      const { error } = await supabase
        .from("memories")
        .delete()
        .eq("playbook_id", playbook_id)
        .eq("key", key);

      if (error) throw new Error(error.message);
      return { success: true };
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

