import { handle } from "hono/vercel";
import { managementToolset } from "@/app/api/_shared/management-toolsets";
import { searchToolCatalog } from "@/app/api/_shared/toolsets";
import { startMcpToolUsage, succeedMcpToolUsage, skipMcpToolUsage, finishMcpToolUsage, noteMcpUsageActor } from "@/app/api/_shared/mcp-usage";
import { createApiApp } from "@/app/api/_shared/hono";
import { getServiceSupabase } from "@/app/api/_shared/supabase";
import type { UserApiKeysRow, Playbook, PlaybooksUpdate } from "@/lib/supabase/types";
import { getAuthenticatedUser, validateUserApiKey } from "@/app/api/_shared/auth";
import { grantsPermission } from "@/app/api/_shared/permissions";
import {
  isPlaybookTool,
  projectPlaybookToolsForUser,
} from "@/app/api/_shared/playbook-tools";
import { POST as handleScopedPlaybookMcpPost } from "@/app/api/mcp/[guid]/route";
import { createPlaybook, listAccessiblePlaybooks } from "@/lib/repositories/playbooks";
import { ACCOUNT_TOOLS } from "@/app/api/_shared/account-tools";
import { managementTools } from "@/app/api/_shared/management-tools";
import { structuredToolResult } from "@/app/api/_shared/mcp-tool-hints";
import {
  LATEST_PROTOCOL_VERSION,
  isNotification,
  negotiateProtocolVersion,
  requestsEventStream,
} from "@/app/api/_shared/mcp-protocol";
import {
  checkPlaybookOwnership,
  checkPlaybookWriteAccess,
  getPlaybookAccessRole,
} from "@/app/api/_shared/guards";
import { playbookViewForRole } from "@/lib/audit-access";
import { listSkillSummaries } from "@/lib/repositories/skill-context";
import {
  oauthBearerChallenge,
  oauthResourceUrl,
} from "@/lib/mcp-oauth";

// MCP Server for Playbook Management
// Allows AI agents to create and manage playbooks through OAuth or a User API Key.

type PersonaSource = Pick<
  Playbook,
  "id" | "persona_name" | "persona_system_prompt" | "persona_metadata" | "created_at"
>;

// Check permission
type ManagementActor = Pick<UserApiKeysRow, "user_id" | "permissions"> & {
  kind: "oauth" | "user_key";
};

function hasPermission(actor: ManagementActor, permission: string): boolean {
  return grantsPermission(actor.permissions, permission);
}

async function authenticateManagementRequest(request: Request): Promise<ManagementActor | null> {
  const userKey = await validateUserApiKey(request);
  if (userKey) {
    return {
      kind: "user_key",
      user_id: userKey.user_id,
      permissions: userKey.permissions,
    };
  }

  const user = await getAuthenticatedUser(request);
  return user
    ? { kind: "oauth", user_id: user.id, permissions: ["full"] }
    : null;
}

function oauthChallengeHeaders() {
  return {
    "Cache-Control": "no-store",
    "WWW-Authenticate": oauthBearerChallenge(oauthResourceUrl()),
  };
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

const MCP_TOOLS = managementTools();
const finder = MCP_TOOLS.find(tool => tool.name === "find_tools")!;

const app = createApiApp("/api/mcp/manage");
app.use("*", async (c, next) => {
  try { await next(); }
  finally { await finishMcpToolUsage(c.req.raw, c.res.status); }
});

// GET /api/mcp/manage - Return MCP server manifest
app.get("/", async (c) => {
  if (requestsEventStream(c.req.header("Accept"))) {
    return c.body(null, 405, { Allow: "POST" });
  }
  const actor = await authenticateManagementRequest(c.req.raw);

  // Do not serialize the full 50-tool manifest for unauthenticated probes.
  // Misconfigured MCP clients retry this endpoint in bursts, so keep the 401
  // small while including the protected-resource challenge OAuth clients need.
  if (!actor) {
    return c.json({
      error: "Authentication required. Connect with OAuth or provide a User API Key in Authorization or X-API-Key.",
    }, 401, oauthChallengeHeaders());
  }

  const view = managementToolset(MCP_TOOLS, c.req.query("toolset") ?? c.req.header("X-AgentPlaybooks-Toolset"));
  if ("error" in view) return c.json({ error: view.error }, 400);
  const manifest = {
    protocolVersion: LATEST_PROTOCOL_VERSION,
    serverInfo: {
      name: "agentplaybooks-management",
      title: "AgentPlaybooks Management",
      version: "0.4.0",
      description: "Vendor-neutral control plane for portable agents: manage playbooks, skills, memory, canvas, connected MCP/OpenAPI tools, workflows, and encrypted secrets.",
    },
    capabilities: {
      tools: {},
    },
    tools: view.advertised,
    _auth: {
      required: true,
      type: "oauth2",
      description: "Interactive OAuth 2.1 with PKCE; User API Keys remain supported for automation and CI.",
      authenticated: true,
      actor: actor.kind,
    },
  };

  return c.json(manifest);
});

// POST /api/mcp/manage - Handle MCP JSON-RPC requests
app.post("/", async (c) => {
  const actor = await authenticateManagementRequest(c.req.raw);

  // Reject before parsing an attacker-controlled body. Authentication failures
  // use a null JSON-RPC id because the request body has deliberately not been
  // decoded; the HTTP 401 is the authoritative transport signal.
  if (!actor) {
    return c.json({
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32001,
        message: "Authentication required. Connect with OAuth or provide a User API Key in Authorization or X-API-Key.",
      },
    }, 401, oauthChallengeHeaders());
  }

  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Invalid JSON" } }, 400);
  }
  if (!body || Array.isArray(body) || body.jsonrpc !== "2.0" || typeof body.method !== "string") {
    return c.json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid JSON-RPC request" } }, 400);
  }
  const { method, params, id } = body;
  // Cancellation/progress notifications from newer clients must not receive a
  // JSON-RPC error response, or execute a tool accidentally without a call id.
  if (isNotification(method, id)) return c.body(null, 202);
  const view = managementToolset(MCP_TOOLS, c.req.query("toolset") ?? c.req.header("X-AgentPlaybooks-Toolset"));
  if ("error" in view) return c.json({ jsonrpc: "2.0", id, error: { code: -32602, message: view.error } }, 400);
  if (method === "tools/call") {
    startMcpToolUsage(c.req.raw, MCP_TOOLS.some(tool => tool.name === params?.name) ? params.name : "connected_tool", "management");
    noteMcpUsageActor(c.req.raw, { kind: "account", id: actor.user_id, accountId: actor.user_id });
  }
  // The `MCP-Protocol-Version` header is a modern-era mechanism and is not
  // validated here. This endpoint speaks the initialize-based revisions, and a
  // dual-era client finds that out by sending a modern request and falling back
  // when the answer is not a recognized modern error. Rejecting an unknown
  // version with `400 {"error": ...}` broke exactly that: too error-shaped to
  // ignore, too unlike UnsupportedProtocolVersionError (no -32022, no
  // `data.supported`) to retry against — so the client had nowhere to go and
  // reported the server as unreachable. Every future revision would have hit
  // the same wall.

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
            version: "0.4.0",
          },
          capabilities: { tools: {} },
          instructions: "Manage the authenticated user's portable agents. The default core list is compact; use find_tools without playbook_id to discover more operations. Use ?toolset=full for the full catalog, or pin runtime, memory, canvas, secrets or admin. Playbook operations require playbook_id. Use update_persona to edit, reset_persona to reset. Use list_secrets then use_secret or use_secret_write for server-side credential injection.",
        },
      });

    case "notifications/initialized":
      return c.body(null, 202);

    case "ping":
      return c.json({ jsonrpc: "2.0", id, result: {} });

    case "tools/list":
      return c.body(
        `{"jsonrpc":"2.0","id":${JSON.stringify(id) ?? "null"},"result":{"tools":${JSON.stringify(view.advertised)}}}`,
        200,
        { "Content-Type": "application/json; charset=UTF-8" },
      );

    case "tools/call": {
      const toolName = params?.name as string;
      const args = params?.arguments || {};

      try {
        const federated = typeof toolName === "string" && toolName.includes("__")
          && ["core", "full", "runtime"].includes(view.name);
        if (!view.allows(toolName) && !federated) {
          return c.json({ jsonrpc: "2.0", id, error: { code: -32602, message: `Tool is unknown or unavailable in toolset "${view.name}".` } });
        }
        if (toolName === "find_tools" && (!args.playbook_id || !["core", "full", "runtime"].includes(view.name))) {
          if (typeof args.query !== "string" || !args.query.trim()) throw new Error("query is required");
          const matches = searchToolCatalog(view.searchable, args.query, typeof args.limit === "number" ? args.limit : 10);
          const result = structuredToolResult([finder], toolName, matches);
          succeedMcpToolUsage(c.req.raw);
          return c.json({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(result ?? matches) }], ...(result ? { structuredContent: result } : {}) } });
        }
        if (isPlaybookTool(toolName) || federated) {
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
          // The account view was already enforced. Its canvas/secrets/core names
          // are not playbook-endpoint policies; never forward them accidentally.
          scopedUrl.searchParams.delete("toolset");
          if (view.name === "runtime") scopedUrl.searchParams.set("toolset", "runtime");
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

          skipMcpToolUsage(c.req.raw);
          const response = await handleScopedPlaybookMcpPost(scopedRequest);
          if (toolName !== "find_tools" || !response.ok) return response;
          const payload = await response.clone().json();
          if (!payload.result?.structuredContent?.matches) return response;
          const scopedMatches = projectPlaybookToolsForUser(payload.result.structuredContent.matches);
          const catalog = [...view.searchable, ...scopedMatches.filter(tool => !MCP_TOOLS.some(known => known.name === tool.name))];
          const matches = searchToolCatalog(catalog, String(args.query ?? ""), typeof args.limit === "number" ? args.limit : 10);
          const result = structuredToolResult([finder], "find_tools", matches);
          return c.json({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result } });
        }

        const result = await executeManagementTool(toolName, args, actor);
        succeedMcpToolUsage(c.req.raw);
        // A declared outputSchema is honoured with matching structuredContent;
        // see mcp-tool-hints.ts for why the two must never drift apart.
        const structured = structuredToolResult(ACCOUNT_TOOLS, toolName, result);
        return c.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(structured ?? result, null, 2) }],
            ...(structured ? { structuredContent: structured } : {}),
          },
        });
      } catch (error: unknown) {
        succeedMcpToolUsage(c.req.raw, true);
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
  actor: ManagementActor
): Promise<unknown> {
  const supabase = getServiceSupabase();
  const userId = actor.user_id;

  switch (toolName) {
    case "get_profile": {
      // Never accept a model-supplied account selector. The immutable auth user
      // ID identifies the same profile for API keys, OAuth, and reconnections.
      if (Object.keys(args).length) throw new Error("get_profile accepts no arguments");
      if (!userId?.trim()) throw new Error("Authenticated profile unavailable");
      const { data, error } = await supabase.from("profiles")
        .select("display_name").eq("auth_user_id", userId).maybeSingle();
      if (error) throw new Error("Profile metadata unavailable");
      return { id: userId, ...(typeof data?.display_name === "string" && data.display_name.trim() ? { name: data.display_name } : {}) };
    }

    case "list_playbooks": {
      if (!hasPermission(actor, "playbooks:read")) {
        throw new Error("Permission denied: playbooks:read required");
      }

      const query = args.query;
      const limit = args.limit ?? 50;
      const offset = args.offset ?? 0;
      if (query !== undefined && (typeof query !== "string" || query.length > 200)) {
        throw new Error("query must be a string of at most 200 characters");
      }
      if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 100
        || typeof offset !== "number" || !Number.isInteger(offset) || offset < 0 || offset > 999) {
        throw new Error("limit must be 1-100 and offset must be 0-999");
      }
      const playbooks = await listAccessiblePlaybooks(userId, { compact: true, query, limit, offset });
      return playbooks.map((playbook) => ({
        ...playbook,
        persona_count: playbook.persona_name ? 1 : 0,
      }));
    }

    case "create_playbook": {
      if (!hasPermission(actor, "playbooks:write")) {
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
      if (!hasPermission(actor, "playbooks:read")) {
        throw new Error("Permission denied: playbooks:read required");
      }

      const { playbook_id } = args as { playbook_id: string };
      if (!playbook_id) throw new Error("playbook_id is required");

      const accessRole = await getPlaybookAccessRole(userId, playbook_id);
      if (!accessRole) throw new Error("Playbook not found");
      if (accessRole === "auditor") {
        const { data: playbook, error } = await supabase
          .from("playbooks")
          .select("id, guid, name, description, visibility, created_at, updated_at, user_id, tags")
          .eq("id", playbook_id)
          .single();
        if (error || !playbook) throw new Error("Playbook not found");
        return playbookViewForRole({ ...playbook, current_user_role: "auditor" }, "auditor");
      }

      const { data: playbook, error } = await supabase
        .from("playbooks")
        .select("*")
        .eq("id", playbook_id)
        .single();

      if (error || !playbook) throw new Error("Playbook not found");

      const includeContent = args.include_content === true;
      const memoryLimit = args.memory_limit ?? 20;
      const memoryOffset = args.memory_offset ?? 0;
      if (typeof memoryLimit !== "number" || !Number.isInteger(memoryLimit) || memoryLimit < 1 || memoryLimit > 100
        || typeof memoryOffset !== "number" || !Number.isInteger(memoryOffset) || memoryOffset < 0 || memoryOffset > 10000) {
        throw new Error("memory_limit must be 1-100 and memory_offset must be 0-10000");
      }
      let memoryQuery = supabase.from("memories")
        .select(includeContent ? "*" : "key, summary, tier, priority, tags, memory_at, updated_at")
        .eq("playbook_id", playbook.id).eq("is_archived", false);
      if (!includeContent) memoryQuery = memoryQuery.order("priority", { ascending: false })
        .order("key", { ascending: true }).range(memoryOffset, memoryOffset + memoryLimit);
      const [skills, mcpServers, memories] = await Promise.all([
        includeContent
          ? supabase.from("skills").select("*").eq("playbook_id", playbook.id).then(({ data, error }) => {
            if (error) throw error;
            return data || [];
          })
          : listSkillSummaries(supabase, playbook.id),
        supabase.from("mcp_servers").select(includeContent ? "*" : "id, name, description, transport_type, created_at").eq("playbook_id", playbook.id),
        memoryQuery,
      ]);
      if (mcpServers.error) throw mcpServers.error;
      if (memories.error) throw memories.error;

      return {
        ...playbook,
        current_user_role: accessRole,
        // 1 playbook = 1 persona
        persona: playbookToPersona(playbook),
        personas: [playbookToPersona(playbook)], // backward-compatible shape
        skills,
        mcp_servers: mcpServers.data || [],
        memories: includeContent ? memories.data || [] : (memories.data || []).slice(0, memoryLimit),
        ...(!includeContent ? { memory_page: {
          offset: memoryOffset, limit: memoryLimit,
          has_more: (memories.data?.length || 0) > memoryLimit,
          next_offset: (memories.data?.length || 0) > memoryLimit ? memoryOffset + memoryLimit : null,
        } } : {}),
      };
    }

    case "delete_playbook": {
      if (!hasPermission(actor, "playbooks:write")) {
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
      if (!hasPermission(actor, "personas:write")) {
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
      if (!hasPermission(actor, "personas:write")) {
        throw new Error("Permission denied: personas:write required");
      }

      const { playbook_id, persona_id, ...updates } = args as {
        playbook_id: string;
        persona_id: string;
        name?: string;
        system_prompt?: string;
        metadata?: Record<string, unknown>;
      };

      if (!playbook_id) throw new Error("playbook_id is required");
      // Old callers may still send persona_id; reject a conflicting identity.
      if (persona_id !== undefined && persona_id !== playbook_id) {
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

    case "reset_persona":
    case "delete_persona": {
      if (!hasPermission(actor, "personas:write")) {
        throw new Error("Permission denied: personas:write required");
      }

      const { playbook_id, persona_id } = args as {
        playbook_id: string;
        persona_id: string;
      };

      if (!playbook_id || (toolName === "delete_persona" && !persona_id)) {
        throw new Error("playbook_id and (for legacy delete_persona) persona_id are required");
      }
      if (persona_id !== undefined && persona_id !== playbook_id) {
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
