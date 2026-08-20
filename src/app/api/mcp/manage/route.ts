import { handle } from "hono/vercel";
import { createApiApp } from "@/app/api/_shared/hono";
import { getServiceSupabase } from "@/app/api/_shared/supabase";
import type { UserApiKeysRow, Playbook, PlaybooksUpdate } from "@/lib/supabase/types";
import { validateUserApiKey } from "@/app/api/_shared/auth";
import {
  isPlaybookTool,
  projectPlaybookToolsForUser,
} from "@/app/api/_shared/playbook-tools";
import { POST as handleScopedPlaybookMcpPost } from "@/app/api/mcp/[guid]/route";
import { createPlaybook, listAccessiblePlaybooks } from "@/lib/repositories/playbooks";
import { ACCOUNT_TOOLS } from "@/app/api/_shared/account-tools";
import {
  LATEST_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  negotiateProtocolVersion,
  requestsEventStream,
} from "@/app/api/_shared/mcp-protocol";
import {
  checkPlaybookOwnership,
  checkPlaybookWriteAccess,
  getPlaybookAccessRole,
} from "@/app/api/_shared/guards";

// MCP Server for Playbook Management
// Allows AI agents to create and manage playbooks via User API Key

type PersonaSource = Pick<
  Playbook,
  "id" | "persona_name" | "persona_system_prompt" | "persona_metadata" | "created_at"
>;

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

const MCP_TOOLS = [
  ...ACCOUNT_TOOLS,
  ...projectPlaybookToolsForUser(),
];

const app = createApiApp("/api/mcp/manage");

// GET /api/mcp/manage - Return MCP server manifest
app.get("/", async (c) => {
  if (requestsEventStream(c.req.header("Accept"))) {
    return c.body(null, 405, { Allow: "POST" });
  }
  const userKey = await validateUserApiKey(c.req.raw);

  // Return manifest even without auth (for discovery)
  // But indicate that auth is required for tool execution

  const manifest = {
    protocolVersion: LATEST_PROTOCOL_VERSION,
    serverInfo: {
      name: "agentplaybooks-management",
      title: "AgentPlaybooks Management",
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
  const protocolHeader = c.req.header("MCP-Protocol-Version");
  if (protocolHeader && !SUPPORTED_PROTOCOL_VERSIONS.has(protocolHeader)) {
    return c.json({ error: `Unsupported MCP protocol version: ${protocolHeader}` }, 400);
  }

  // Handle MCP methods
  switch (method) {
    case "initialize":
      const requestedVersion = params?.protocolVersion as string | undefined;
      return c.json({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: negotiateProtocolVersion(requestedVersion),
          serverInfo: {
            name: "agentplaybooks-management",
            title: "AgentPlaybooks Management",
            version: "1.0.0",
          },
          capabilities: { tools: {} },
          instructions: "Manage the authenticated user's AgentPlaybooks, skills, MCP servers, and memory. Use an AgentPlaybooks user API key as a Bearer token.",
        },
      });

    case "notifications/initialized":
      return c.body(null, 202);

    case "ping":
      return c.json({ jsonrpc: "2.0", id, result: {} });

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
        if (isPlaybookTool(toolName)) {
          const playbookId = typeof args.playbook_id === "string" ? args.playbook_id : "";
          if (!playbookId) {
            return c.json({
              jsonrpc: "2.0",
              id,
              error: { code: -32602, message: "playbook_id is required" },
            });
          }

          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(playbookId);
          let playbookQuery = getServiceSupabase().from("playbooks").select("id, guid");
          playbookQuery = isUuid
            ? playbookQuery.eq("id", playbookId)
            : playbookQuery.eq("guid", playbookId);
          const { data: target } = await playbookQuery.maybeSingle();
          if (!target) {
            return c.json({
              jsonrpc: "2.0",
              id,
              error: { code: -32001, message: "Playbook not found" },
            });
          }

          const scopedArguments = { ...args };
          delete scopedArguments.playbook_id;
          const scopedUrl = new URL(c.req.raw.url);
          scopedUrl.pathname = `/api/mcp/${encodeURIComponent(target.guid)}`;
          const scopedRequest = new Request(scopedUrl, {
            method: "POST",
            headers: new Headers(c.req.raw.headers),
            body: JSON.stringify({
              jsonrpc: "2.0",
              id,
              method: "tools/call",
              params: { name: toolName, arguments: scopedArguments },
            }),
          });

          return handleScopedPlaybookMcpPost(scopedRequest);
        }

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
export const OPTIONS = handle(app);

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

      const playbooks = await listAccessiblePlaybooks(userId);
      return playbooks.map((playbook) => ({
        ...playbook,
        persona_count: playbook.persona_name ? 1 : 0,
      }));
    }

    case "create_playbook": {
      if (!hasPermission(userKey, "playbooks:write")) {
        throw new Error("Permission denied: playbooks:write required");
      }

      const { name, description, visibility, tags, persona_name, persona_system_prompt, persona_metadata, instructions } = args as {
        name: string;
        description?: string;
        visibility?: 'public' | 'private' | 'unlisted';
        tags?: string[];
        persona_name?: string;
        persona_system_prompt?: string;
        persona_metadata?: Record<string, unknown>;
        instructions?: string;
      };

      if (!name) throw new Error("name is required");

      return createPlaybook(userId, {
        name,
        description: description || null,
        visibility: visibility || "private",
        tags: tags || [],
        persona_name: persona_name || null,
        persona_system_prompt: persona_system_prompt || null,
        persona_metadata: persona_metadata || {},
        instructions: instructions || null,
      });
    }

    case "get_playbook": {
      if (!hasPermission(userKey, "playbooks:read")) {
        throw new Error("Permission denied: playbooks:read required");
      }

      const { playbook_id } = args as { playbook_id: string };
      if (!playbook_id) throw new Error("playbook_id is required");

      const accessRole = await getPlaybookAccessRole(userId, playbook_id);
      if (!accessRole) throw new Error("Playbook not found");

      const { data: playbook, error } = await supabase
        .from("playbooks")
        .select("*")
        .eq("id", playbook_id)
        .single();

      if (error || !playbook) throw new Error("Playbook not found");

      const [skills, mcpServers, memories] = await Promise.all([
        supabase.from("skills").select("*").eq("playbook_id", playbook.id),
        supabase.from("mcp_servers").select("*").eq("playbook_id", playbook.id),
        supabase.from("memories").select("*").eq("playbook_id", playbook.id),
      ]);

      return {
        ...playbook,
        current_user_role: accessRole,
        // 1 playbook = 1 persona
        persona: playbookToPersona(playbook),
        personas: [playbookToPersona(playbook)], // backward-compatible shape
        skills: skills.data || [],
        mcp_servers: mcpServers.data || [],
        memories: memories.data || [],
      };
    }

    case "delete_playbook": {
      if (!hasPermission(userKey, "playbooks:write")) {
        throw new Error("Permission denied: playbooks:write required");
      }

      const { playbook_id } = args as { playbook_id: string };
      if (!playbook_id) throw new Error("playbook_id is required");
      if (!await checkPlaybookOwnership(userId, playbook_id)) {
        throw new Error("Only the playbook owner can delete it");
      }

      const { error } = await supabase
        .from("playbooks")
        .delete()
        .eq("id", playbook_id);

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

      if (!await checkPlaybookWriteAccess(userId, playbook_id)) throw new Error("Playbook not found");

      const { data, error } = await supabase
        .from("playbooks")
        .update({
          persona_name: name,
          persona_system_prompt: system_prompt,
          persona_metadata: metadata || {},
        })
        .eq("id", playbook_id)
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

      if (!await checkPlaybookWriteAccess(userId, playbook_id)) throw new Error("Playbook not found");

      const updateData: PlaybooksUpdate = {};
      if (updates.name !== undefined) updateData.persona_name = updates.name;
      if (updates.system_prompt !== undefined) updateData.persona_system_prompt = updates.system_prompt;
      if (updates.metadata !== undefined) updateData.persona_metadata = updates.metadata;

      const { data, error } = await supabase
        .from("playbooks")
        .update(updateData)
        .eq("id", playbook_id)
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

      if (!await checkPlaybookWriteAccess(userId, playbook_id)) throw new Error("Playbook not found");

      const { error } = await supabase
        .from("playbooks")
        .update({
          persona_name: "Assistant",
          persona_system_prompt: "You are a helpful AI assistant.",
          persona_metadata: {},
        })
        .eq("id", playbook_id);

      if (error) throw new Error(error.message);
      return { success: true };
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}
