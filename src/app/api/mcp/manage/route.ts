import { handle } from "hono/vercel";
import { createApiApp } from "@/app/api/_shared/hono";
import { getServiceSupabase } from "@/app/api/_shared/supabase";
import { hashApiKey, generateGuid } from "@/lib/utils";
import type { UserApiKeysRow, Playbook } from "@/lib/supabase/types";

// MCP Server for Playbook Management
// Allows AI agents to create and manage playbooks via User API Key

type PlaybookWithCounts = Playbook & {
  skills?: Array<{ count: number }>;
  mcp_servers?: Array<{ count: number }>;
};

type PersonaSource = Pick<
  Playbook,
  "id" | "persona_name" | "persona_system_prompt" | "persona_metadata" | "created_at"
>;

// Validate User API Key
async function validateUserApiKey(request: Request): Promise<UserApiKeysRow | null> {
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

// Helper: 1 Playbook = 1 Persona (persona stored on playbooks table)
function playbookToPersona(playbook: PersonaSource) {
  return {
    id: playbook.id,
    playbook_id: playbook.id,
    name: playbook.persona_name || "Assistant",
    system_prompt: playbook.persona_system_prompt || "You are a helpful AI assistant.",
    metadata: playbook.persona_metadata ?? {},
    created_at: playbook.created_at,
  };
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
        visibility: { type: "string", enum: ["public", "private", "unlisted"], description: "Visibility of the playbook", default: "private" },
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
        visibility: { type: "string", enum: ["public", "private", "unlisted"], description: "New visibility" },
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
    name: "list_skills",
    description: "List all skills in a playbook. Skills define capabilities, rules, and how tasks should be solved.",
    inputSchema: {
      type: "object",
      properties: {
        playbook_id: { type: "string", description: "UUID of the playbook" },
      },
      required: ["playbook_id"],
    },
  },
  {
    name: "get_skill",
    description: "Get detailed information about a specific skill including its definition and examples.",
    inputSchema: {
      type: "object",
      properties: {
        playbook_id: { type: "string", description: "UUID of the playbook" },
        skill_id: { type: "string", description: "UUID of the skill" },
      },
      required: ["playbook_id", "skill_id"],
    },
  },
  {
    name: "read_memory",
    description: "Read a specific memory entry by key.",
    inputSchema: {
      type: "object",
      properties: {
        playbook_id: { type: "string", description: "UUID of the playbook" },
        key: { type: "string", description: "Memory key to read" },
      },
      required: ["playbook_id", "key"],
    },
  },
  {
    name: "search_memory",
    description: "Search memories by text and/or tags. Returns all matching entries.",
    inputSchema: {
      type: "object",
      properties: {
        playbook_id: { type: "string", description: "UUID of the playbook" },
        search: { type: "string", description: "Search in keys and descriptions" },
        tags: { type: "array", items: { type: "string" }, description: "Filter by tags (any match)" },
      },
      required: ["playbook_id"],
    },
  },
  {
    name: "write_memory",
    description: "Write a memory entry with optional tags and description. Tags help organize and search memories.",
    inputSchema: {
      type: "object",
      properties: {
        playbook_id: { type: "string", description: "UUID of the playbook" },
        key: { type: "string", description: "Memory key (unique identifier)" },
        value: { type: "object", description: "Value to store (any JSON object)" },
        tags: { type: "array", items: { type: "string" }, description: "Tags for categorization and search" },
        description: { type: "string", description: "Human-readable description of this memory" },
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

const app = createApiApp("/api/mcp/manage");

// GET /api/mcp/manage - Return MCP server manifest
app.get("/", async (c) => {
  const userKey = await validateUserApiKey(c.req.raw);

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

  return c.json(manifest);
});

// POST /api/mcp/manage - Handle MCP JSON-RPC requests
app.post("/", async (c) => {
  const userKey = await validateUserApiKey(c.req.raw);

  const body = await c.req.json();
  const { method, params, id } = body;

  // Handle MCP methods
  switch (method) {
    case "initialize":
      return c.json({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          serverInfo: { name: "AgentPlaybooks Management", version: "1.0.0" },
          capabilities: { tools: {} },
        },
      });

    case "tools/list":
      return c.json({
        jsonrpc: "2.0",
        id,
        result: { tools: MCP_TOOLS },
      });

    case "tools/call": {
      const toolName = params?.name as string;
      const args = params?.arguments || {};

      // All tool calls require authentication
      if (!userKey) {
        return c.json({
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
          error: {
            code: -32000,
            message,
          },
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
          skills:skills(count),
          mcp_servers:mcp_servers(count)
        `)
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });

      if (error) throw new Error(error.message);

      const playbookRows = (data as unknown as PlaybookWithCounts[] | null) ?? [];
      return playbookRows.map((p) => ({
        id: p.id,
        guid: p.guid,
        name: p.name,
        description: p.description,
        visibility: p.visibility,
        persona_count: p.persona_name ? 1 : 0,
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

      const { name, description, visibility } = args as {
        name: string;
        description?: string;
        visibility?: 'public' | 'private' | 'unlisted';
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
          visibility: visibility || 'private',
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

      const [skills, mcpServers, memories] = await Promise.all([
        supabase.from("skills").select("*").eq("playbook_id", playbook.id),
        supabase.from("mcp_servers").select("*").eq("playbook_id", playbook.id),
        supabase.from("memories").select("*").eq("playbook_id", playbook.id),
      ]);

      return {
        ...playbook,
        // 1 playbook = 1 persona
        persona: playbookToPersona(playbook),
        personas: [playbookToPersona(playbook)], // backward-compatible shape
        skills: skills.data || [],
        mcp_servers: mcpServers.data || [],
        memories: memories.data || [],
      };
    }

    case "update_playbook": {
      if (!hasPermission(userKey, "playbooks:write")) {
        throw new Error("Permission denied: playbooks:write required");
      }

      const { playbook_id, name, description, visibility } = args as {
        playbook_id: string;
        name?: string;
        description?: string;
        visibility?: 'public' | 'private' | 'unlisted';
      };

      if (!playbook_id) throw new Error("playbook_id is required");

      const updateData: Record<string, unknown> = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (visibility !== undefined) updateData.visibility = visibility;

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
        .from("playbooks")
        .update({
          persona_name: name,
          persona_system_prompt: system_prompt,
          persona_metadata: metadata || {},
        })
        .eq("id", playbook_id)
        .eq("user_id", userId)
        .select("*")
        .single();

      if (error || !data) throw new Error(error?.message || "Failed to set persona");
      return playbookToPersona(data);
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
      // Persona is a singleton; we use playbook_id as persona_id
      if (persona_id !== playbook_id) {
        throw new Error("Invalid persona_id (persona is a singleton and uses playbook_id)");
      }

      // Verify ownership
      const { data: playbook } = await supabase
        .from("playbooks")
        .select("id")
        .eq("id", playbook_id)
        .eq("user_id", userId)
        .single();

      if (!playbook) throw new Error("Playbook not found");

      const updateData: Record<string, unknown> = {};
      if (updates.name !== undefined) updateData.persona_name = updates.name;
      if (updates.system_prompt !== undefined) updateData.persona_system_prompt = updates.system_prompt;
      if (updates.metadata !== undefined) updateData.persona_metadata = updates.metadata;

      const { data, error } = await supabase
        .from("playbooks")
        .update(updateData)
        .eq("id", playbook_id)
        .eq("user_id", userId)
        .select("*")
        .single();

      if (error || !data) throw new Error(error?.message || "Failed to update persona");
      return playbookToPersona(data);
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
      if (persona_id !== playbook_id) {
        throw new Error("Invalid persona_id (persona is a singleton and uses playbook_id)");
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
        .from("playbooks")
        .update({
          persona_name: "Assistant",
          persona_system_prompt: "You are a helpful AI assistant.",
          persona_metadata: {},
        })
        .eq("id", playbook_id)
        .eq("user_id", userId);

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
        examples?: Record<string, unknown>[];
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
        examples?: Record<string, unknown>[];
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

    case "list_skills": {
      if (!hasPermission(userKey, "playbooks:read")) {
        throw new Error("Permission denied: playbooks:read required");
      }

      const { playbook_id } = args as { playbook_id: string };
      if (!playbook_id) throw new Error("playbook_id is required");

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
        .select("id, name, description, definition, examples, priority")
        .eq("playbook_id", playbook_id)
        .order("priority", { ascending: false });

      if (error) throw new Error(error.message);
      return data || [];
    }

    case "get_skill": {
      if (!hasPermission(userKey, "playbooks:read")) {
        throw new Error("Permission denied: playbooks:read required");
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

      const { data, error } = await supabase
        .from("skills")
        .select("*")
        .eq("id", skill_id)
        .eq("playbook_id", playbook_id)
        .single();

      if (error) throw new Error("Skill not found");
      return data;
    }

    case "read_memory": {
      if (!hasPermission(userKey, "memory:read")) {
        throw new Error("Permission denied: memory:read required");
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

      const { data, error } = await supabase
        .from("memories")
        .select("key, value, tags, description, updated_at")
        .eq("playbook_id", playbook_id)
        .eq("key", key)
        .single();

      if (error) throw new Error("Memory not found");
      return data;
    }

    case "search_memory": {
      if (!hasPermission(userKey, "memory:read")) {
        throw new Error("Permission denied: memory:read required");
      }

      const { playbook_id, search, tags } = args as {
        playbook_id: string;
        search?: string;
        tags?: string[];
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

      // Build query with optional filters
      let query = supabase
        .from("memories")
        .select("key, value, tags, description, updated_at")
        .eq("playbook_id", playbook_id);

      if (search) {
        query = query.or(`key.ilike.%${search}%,description.ilike.%${search}%`);
      }

      if (tags && tags.length > 0) {
        query = query.overlaps("tags", tags);
      }

      const { data, error } = await query.order("updated_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data || [];
    }

    case "write_memory": {
      if (!hasPermission(userKey, "memory:write")) {
        throw new Error("Permission denied: memory:write required");
      }

      const { playbook_id, key, value, tags, description } = args as {
        playbook_id: string;
        key: string;
        value: Record<string, unknown>;
        tags?: string[];
        description?: string;
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

      const upsertData: Record<string, unknown> = {
        playbook_id,
        key,
        value,
        updated_at: new Date().toISOString(),
      };

      if (tags !== undefined) {
        upsertData.tags = tags;
      }

      if (description !== undefined) {
        upsertData.description = description;
      }

      const { data, error } = await supabase
        .from("memories")
        .upsert(upsertData, { onConflict: "playbook_id,key" })
        .select("key, value, tags, description, updated_at")
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
