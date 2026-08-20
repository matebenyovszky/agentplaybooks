import { handle } from "hono/vercel";
import { createApiApp } from "@/app/api/_shared/hono";
import { canAccessPrivatePlaybook, validatePlaybookCredential } from "@/app/api/_shared/auth";
import { getServiceSupabase, getSupabase } from "@/app/api/_shared/supabase";
import { loadFederationSecrets } from "@/app/api/_shared/federation-secrets";
import {
  METHOD_NOT_FOUND,
  discoverResult,
  isModernRequest,
  validateModernEnvelope,
} from "@/app/api/_shared/mcp-modern";
import {
  LATEST_PROTOCOL_VERSION,
  privateAccessRefusal,
  isNotification,
  negotiateProtocolVersion,
  requestsEventStream,
} from "@/app/api/_shared/mcp-protocol";
import type {
  McpResource,
  McpTool,
  MCPServer,
  Playbook,
  MemoryTier,
  MemoryType,
  MemoryStatus,
  CanvasSection,
  SecretCategory,
  MemoriesUpdate,
  SkillsUpdate,
  PlaybooksUpdate,
  MCPServersUpdate,
  PlaybookRunsUpdate,
} from "@/lib/supabase/types";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { checkSecretDestination } from "@/lib/secret-destinations";
import {
  auditActor,
  beginSecretAudit,
  destinationHostOf,
  federationAuditWriter,
  flushSecretAudit,
  type SecretAuditDraft,
} from "@/app/api/_shared/audit";
import { PLAYBOOK_TOOLS } from "@/app/api/_shared/playbook-tools";
import {
  callFederatedTool,
  federatedServerPrefix,
  listFederatedResources,
  listFederatedTools,
  parseFederatedResourceUri,
  readFederatedResource,
} from "@/lib/mcp/federation";
import { composePlaybookSystemPrompt } from "@/lib/playbook-prompt";
import { validateAgentSkillDescription, validateAgentSkillName } from "@/lib/agent-skills";

type PersonaSource = Pick<Playbook, "id" | "persona_name" | "persona_system_prompt" | "persona_metadata" | "instructions">;

/**
 * Keep the route-bound playbook identity in one place while accepting either
 * a direct playbook key or the user's control-plane key.
 */
async function validateApiKey(request: Request, requiredPermission: string) {
  const pathname = new URL(request.url).pathname;
  const identifier = pathname.match(/\/api\/mcp\/([^/]+)/)?.[1];
  return identifier
    ? validatePlaybookCredential(request, decodeURIComponent(identifier), requiredPermission)
    : null;
}

// MCP Protocol implementation for Cloudflare Workers / Next.js
// Supports: tools/list, resources/list, resources/read, tools/call

function playbookToPersona(playbook: PersonaSource) {
  return {
    id: playbook.id,
    playbook_id: playbook.id,
    name: playbook.persona_name || "Assistant",
    // An MCP client applies one system prompt, so it receives the persona with
    // this project's always-on instructions appended. The raw instructions are
    // published separately in the manifest under `_playbook.instructions`.
    system_prompt: composePlaybookSystemPrompt(
      playbook.persona_system_prompt || "You are a helpful AI assistant.",
      playbook.instructions,
    ),
    metadata: playbook.persona_metadata ?? {},
  };
}

async function federationOptions(server: MCPServer, playbookId: string, requestId?: string) {
  return {
    secrets: await loadFederationSecrets(server, playbookId),
    audit: federationAuditWriter(playbookId, requestId),
  };
}

async function federatedTools(servers: MCPServer[], playbookId: string, requestId?: string) {
  const groups = await Promise.all(servers.map(async (server) =>
    listFederatedTools([server], await federationOptions(server, playbookId, requestId)),
  ));
  return groups.flat();
}

async function federatedResources(servers: MCPServer[], playbookId: string, requestId?: string) {
  const groups = await Promise.all(servers.map(async (server) =>
    listFederatedResources([server], await federationOptions(server, playbookId, requestId)),
  ));
  return groups.flat();
}

function serverForFederatedTool(servers: MCPServer[], toolName: string) {
  return servers.find((server) => toolName.startsWith(federatedServerPrefix(server)));
}

function isMcpToolResult(value: unknown): value is { content: unknown[] } {
  return typeof value === "object" && value !== null && Array.isArray((value as { content?: unknown }).content);
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

const app = createApiApp("/api/mcp/:guid");

// GET /api/mcp/:guid - Return MCP server manifest
app.get("/", async (c) => {
  const guid = c.req.param("guid");
  if (!guid) {
    return c.json({ error: "Missing playbook GUID" }, 400);
  }

  // GET on an MCP endpoint means "open a server-to-client SSE stream". This
  // endpoint does not offer one, and the spec requires 405 in that case. It
  // used to answer with the manifest below, so a client opening a stream got
  // JSON where it expected `text/event-stream`. The manifest is still served
  // for anything that asks for JSON — curl, a browser, the docs — because only
  // a stream request names text/event-stream without also accepting JSON.
  if (requestsEventStream(c.req.header("Accept"))) {
    return c.body(null, 405, { Allow: "POST" });
  }
  const supabase = getSupabase();

  // Check if it's a UUID or GUID
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(guid);

  // Unauthenticated read of a public playbook, so the projection is explicit
  // rather than `*` — a column added later must be published deliberately.
  let query = supabase
    .from("playbooks")
    // Written as one literal: supabase-js infers the row type from the select
    // string at compile time, which a concatenated expression defeats.
    .select("id, user_id, publisher_id, guid, name, description, config, visibility, star_count, tags, persona_name, persona_system_prompt, persona_metadata, instructions, created_at, updated_at");

  if (isUuid) {
    query = query.eq("id", guid);
  } else {
    query = query.eq("guid", guid);
  }

  let { data: playbook } = await query
    .eq("visibility", "public")
    .single();

  // If not found as public, try API key auth for private playbooks
  let privateExists = false;
  if (!playbook) {
    let privateQuery = getServiceSupabase().from("playbooks").select("*");
    privateQuery = isUuid ? privateQuery.eq("id", guid) : privateQuery.eq("guid", guid);
    const { data: privatePlaybook } = await privateQuery.maybeSingle();
    privateExists = Boolean(privatePlaybook);
    if (privatePlaybook && await canAccessPrivatePlaybook(c.req.raw, privatePlaybook.id)) {
      playbook = privatePlaybook;
    }
  }

  if (!playbook) {
    // Protected and absent are different answers: see privateAccessRefusal.
    if (privateExists) {
      const refusal = privateAccessRefusal(c.req.raw);
      return c.json({ error: refusal.message }, refusal.status, refusal.headers);
    }
    return c.json({ error: "Playbook not found" }, 404);
  }

  const { data: mcpRows } = await getServiceSupabase()
    .from("mcp_servers")
    .select("*")
    .eq("playbook_id", playbook.id);
  const mcpServers = (mcpRows || []) as MCPServer[];
  const persona = playbookToPersona(playbook);

  // Build tools: start with built-in playbook tools
  // Skills are NOT exposed as separate tools — they are instructions/knowledge,
  // not executable functions. Use list_skills / get_skill / the Skills resource instead.
  const requestId = c.req.header("cf-ray") || c.req.header("x-request-id");
  const tools: McpTool[] = [
    ...PLAYBOOK_TOOLS,
    ...await federatedTools(mcpServers, playbook.id, requestId),
  ];

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

  resources.push(...await federatedResources(mcpServers, playbook.id, requestId));

  // MCP Server manifest
  const manifest = {
    protocolVersion: LATEST_PROTOCOL_VERSION,
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
      // Always-on project instructions, published as their own field so a
      // client can show or diff them. Omitted when unset, which keeps the
      // manifest identical for playbooks that never set them.
      instructions: playbook.instructions || undefined,
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

  // A JSON-RPC notification carries no `id` and MUST NOT be answered; the
  // Streamable HTTP transport spells that as 202 with an empty body. Clients
  // send `notifications/initialized` right after the handshake, and a strict
  // one treats any response to it — even a well-formed error — as a failed
  // connection, which is why the server looked unreachable while every
  // request/response method worked.
  // An explicit `id: null` is not treated as a notification: the spec forbids it
  // in a request, but a client that sends it is still waiting for an answer.
  // The `MCP-Protocol-Version` header is a modern-era mechanism and is not
  // validated here. This endpoint speaks the initialize-based revisions, and a
  // dual-era client finds that out by sending a modern request and falling back
  // when the answer is not a recognized modern error. Rejecting an unknown
  // version with `400 {"error": ...}` broke exactly that: too error-shaped to
  // ignore, too unlike UnsupportedProtocolVersionError (no -32022, no
  // `data.supported`) to retry against — so the client had nowhere to go and
  // reported the server as unreachable. Every future revision would have hit
  // the same wall.

  if (isNotification(method, id)) {
    return c.body(null, 202);
  }

  // A dual-era endpoint picks its behaviour from how the client opened: modern
  // per-request metadata, or an `initialize` handshake. Only the envelope
  // differs — every payload handler below is shared.
  const modern = isModernRequest(method, rpcParams);
  if (modern) {
    const problem = validateModernEnvelope(c.req.raw, body);
    if (problem) {
      return c.json({
        jsonrpc: "2.0",
        id,
        error: { code: problem.code, message: problem.message, ...(problem.data ? { data: problem.data } : {}) },
      }, problem.status);
    }
  }

  const supabase = getSupabase();

  // Check if it's a UUID or GUID
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(guid);

  // Get playbook - try public first, then fallback to API key auth for private playbooks
  let query = supabase
    .from("playbooks")
    .select("id, user_id, name, description, persona_name, persona_system_prompt, persona_metadata, instructions");

  if (isUuid) {
    query = query.eq("id", guid);
  } else {
    query = query.eq("guid", guid);
  }

  let { data: playbook } = await query
    .eq("visibility", "public")
    .single();

  // If not found as public, try API key auth for private playbooks
  let privateRowExists = false;
  if (!playbook) {
    let privateQuery = getServiceSupabase()
      .from("playbooks")
      .select("id, user_id, name, description, persona_name, persona_system_prompt, persona_metadata, instructions");
    privateQuery = isUuid ? privateQuery.eq("id", guid) : privateQuery.eq("guid", guid);
    const { data: privatePlaybook } = await privateQuery.maybeSingle();
    privateRowExists = Boolean(privatePlaybook);
    if (privatePlaybook && await canAccessPrivatePlaybook(c.req.raw, privatePlaybook.id)) {
      playbook = privatePlaybook;
    }
  }

  if (!playbook) {
    // The JSON-RPC error keeps the detail; the HTTP status is what a transport
    // acts on, and 200 told the client the call had succeeded.
    if (privateRowExists) {
      const refusal = privateAccessRefusal(c.req.raw);
      return c.json({
        jsonrpc: "2.0",
        id,
        error: { code: -32001, message: refusal.message },
      }, refusal.status, refusal.headers);
    }
    return c.json({
      jsonrpc: "2.0",
      id,
      error: { code: -32001, message: "Playbook not found" },
    }, 404);
  }

  // Handle MCP methods
  switch (method) {
    case "server/discover":
      // Mandatory for a modern client, and the only thing it can call before
      // it knows anything about us.
      return c.json({
        jsonrpc: "2.0",
        id,
        result: discoverResult(
          { name: playbook.name ?? "AgentPlaybooks playbook", version: "1.0.0" },
          { instructions: playbook.description ?? undefined },
        ),
      });

    case "initialize":
      return c.json({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: negotiateProtocolVersion(rpcParams?.protocolVersion),
          serverInfo: { name: "AgentPlaybooks", version: "1.0.0" },
          capabilities: { tools: {}, resources: {} },
        },
      });

    case "tools/list": {
      // Skills are accessible via list_skills / get_skill tools and the Skills resource.
      // They are NOT exposed as separate skill_* tools (they are instructions, not executables).
      const { data: mcpRows } = await getServiceSupabase()
        .from("mcp_servers")
        .select("*")
        .eq("playbook_id", playbook.id);
      const tools = await federatedTools(
        (mcpRows || []) as MCPServer[],
        playbook.id,
        c.req.header("cf-ray") || c.req.header("x-request-id"),
      );
      return c.json({
        jsonrpc: "2.0",
        id,
        result: { tools: [...PLAYBOOK_TOOLS, ...tools] },
      });
    }

    case "resources/list": {
      // Get skills to list their attachments
      const serviceSupabase = getServiceSupabase();
      const { data: skills } = await serviceSupabase
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

      const { data: mcpRows } = await serviceSupabase
        .from("mcp_servers")
        .select("*")
        .eq("playbook_id", playbook.id);
      resources.push(...await federatedResources(
        (mcpRows || []) as MCPServer[],
        playbook.id,
        c.req.header("cf-ray") || c.req.header("x-request-id"),
      ));

      return c.json({
        jsonrpc: "2.0",
        id,
        result: { resources },
      });
    }

    case "resources/read": {
      const uri = rpcParams?.uri as string;
      const serviceSupabase = getServiceSupabase();

      const federated = parseFederatedResourceUri(uri || "");
      if (federated) {
        const { data: serverRow } = await serviceSupabase
          .from("mcp_servers")
          .select("*")
          .eq("id", federated.serverId)
          .eq("playbook_id", playbook.id)
          .single();
        if (!serverRow) {
          return c.json({ jsonrpc: "2.0", id, error: { code: -32002, message: "Federated resource server not found" } });
        }
        const access = (serverRow.transport_config as { access?: string } | null)?.access;
        if (access !== "public") {
          const apiKey = await validateApiKey(c.req.raw, "tools:call");
          if (!apiKey || apiKey.playbooks.id !== playbook.id) {
            return c.json({
              jsonrpc: "2.0",
              id,
              error: { code: -32001, message: "Playbook API key with tools:call permission required" },
            });
          }
        }
        try {
          const result = await readFederatedResource(
            serverRow as MCPServer,
            federated.originalUri,
            await federationOptions(serverRow as MCPServer, playbook.id, c.req.header("cf-ray") || c.req.header("x-request-id")),
          );
          return c.json({ jsonrpc: "2.0", id, result });
        } catch (error) {
          return c.json({
            jsonrpc: "2.0",
            id,
            error: { code: -32000, message: error instanceof Error ? error.message : "Federated resource read failed" },
          });
        }
      }

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

## Secrets Vault

Secrets are encrypted credentials (API keys, passwords, tokens) stored with AES-256-GCM encryption using per-user derived keys.

**Security model:** Secret values are NEVER exposed to agents. You reference secrets by name, and the server injects them into HTTP requests on your behalf.

### Key Secrets Tools
| Tool | Use When |
|------|----------|
| \`list_secrets\` | See available secret names and metadata (never values) |
| \`use_secret\` | Make an HTTP request with a secret injected as a header |
| \`store_secret\` | Save a new encrypted secret |
| \`rotate_secret\` | Replace an existing secret with a new value |
| \`delete_secret\` | Permanently remove a secret |

### use_secret Examples
\`\`\`
// Call OpenAI API with stored key
use_secret({
  secret_name: "OPENAI_API_KEY",
  url: "https://api.openai.com/v1/models"
})

// POST to an API with custom headers
use_secret({
  secret_name: "WEBHOOK_TOKEN",
  url: "https://api.example.com/data",
  method: "POST",
  header_name: "X-API-Key",
  header_prefix: "",
  body: {"query": "hello"},
  extra_headers: {"Content-Type": "application/json"}
})
\`\`\`

### Secrets Best Practices
- Use descriptive names: \`OPENAI_API_KEY\`, \`SUPABASE_URL\`, \`DB_PASSWORD\`
- Set expiration dates for rotating credentials
- Use categories to organize: api_key, password, token, certificate, connection_string
- Secret values are NEVER returned to the agent context
- Secrets are NEVER included in public playbook exports

## Authentication
- **Read operations**: No API key needed for public playbooks
- **Write operations**: Require API key in Authorization header: \`Bearer apb_xxx\`
- **Secrets operations**: Require API key with \`secrets:read\` or \`secrets:write\` permission
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
        const { data: skills } = await serviceSupabase
          .from("skills")
          .select("id, name, description, content, licence, publisher_id, priority")
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

      if (toolName?.startsWith("ext__")) {
        const { data: mcpRows } = await serviceSupabase
          .from("mcp_servers")
          .select("*")
          .eq("playbook_id", playbook.id);
        const mcpServers = (mcpRows || []) as MCPServer[];
        const server = serverForFederatedTool(mcpServers, toolName);
        if (!server) {
          return c.json({ jsonrpc: "2.0", id, error: { code: -32602, message: "Federated tool not found" } });
        }
        const access = (server.transport_config as { access?: string } | null)?.access;
        if (access !== "public") {
          const apiKey = await validateApiKey(c.req.raw, "tools:call");
          if (!apiKey || apiKey.playbooks.id !== playbook.id) {
            return c.json({
              jsonrpc: "2.0",
              id,
              error: { code: -32001, message: "Playbook API key with tools:call permission required" },
            });
          }
        }
        try {
          const result = await callFederatedTool(
            server,
            toolName,
            args,
            await federationOptions(server, playbook.id, c.req.header("cf-ray") || c.req.header("x-request-id")),
          );
          return c.json({
            jsonrpc: "2.0",
            id,
            result: isMcpToolResult(result)
              ? result
              : { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] },
          });
        } catch (error) {
          return c.json({
            jsonrpc: "2.0",
            id,
            error: { code: -32000, message: error instanceof Error ? error.message : "Federated tool call failed" },
          });
        }
      }

      // The secret tools all throw on refusal into the one catch below, so the
      // audit event is built as the case proceeds and flushed at whichever exit
      // is reached. `status` starts at "denied" and becomes "error" once the
      // caller's key has been accepted, which is what lets the shared catch
      // classify a failure without reading its own error messages.
      let secretAudit: SecretAuditDraft | null = null;
      // The key prefix is only known once validateApiKey accepts it; a refused
      // caller stays anonymous rather than having a rejected credential's
      // fragments copied into the trail.
      let secretAuditKeyPrefix: string | null = null;
      const secretAuditContext = () => ({
        playbookId: playbook.id,
        actor: auditActor(null, secretAuditKeyPrefix ? { key_prefix: secretAuditKeyPrefix } : null),
        requestId: c.req.header("cf-ray") || c.req.header("x-request-id") || null,
      });

      try {
        let result: unknown;

        switch (toolName) {
          case "list_skills": {
            const { data } = await serviceSupabase
              .from("skills")
              .select("id, name, description, content, licence, publisher_id, priority")
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
              query = query.ilike("name", skillId);
            }

            const { data, error } = await query
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (error) throw new Error(error.message);
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
              // Sanitize search to prevent PostgREST filter injection
              const sanitized = search.replace(/[,().]/g, " ").trim();
              if (sanitized) {
                query = query.or(`key.ilike.%${sanitized}%,description.ilike.%${sanitized}%,summary.ilike.%${sanitized}%`);
              }
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
            const childUpdates: MemoriesUpdate = {
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

            const updates: MemoriesUpdate = {
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
                updates.tier = targetTier as MemoryTier;
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
            const updateData: MemoriesUpdate = {
              status: newStatus as MemoryStatus,
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
            const runId = args.run_id as string | undefined;
            let canvasQuery = serviceSupabase
              .from("canvas")
              .select("run_id, slug, name, sort_order, version, updated_at, metadata")
              .eq("playbook_id", playbook.id);
            if (runId) canvasQuery = canvasQuery.eq("run_id", runId);
            const { data } = await canvasQuery.order("sort_order");
            result = data || [];
            break;
          }

          case "read_canvas": {
            const runId = args.run_id as string;
            const slug = args.slug as string;
            const sectionId = args.section_id as string | undefined;
            if (!runId) throw new Error("run_id is required");

            const { data, error } = await serviceSupabase
              .from("canvas")
              .select("*")
              .eq("playbook_id", playbook.id)
              .eq("run_id", runId)
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
            const apiKeyData = await validateApiKey(c.req.raw, "canvas:write");
            if (!apiKeyData || apiKeyData.playbooks.id !== playbook.id) {
              throw new Error("Credential with canvas:write or full permission required");
            }

            const runId = args.run_id as string;
            const slug = args.slug as string;
            const name = args.name as string;
            const content = args.content as string;
            const docMetadata = args.metadata as Record<string, unknown> || {};
            if (!runId) throw new Error("run_id is required");

            const { data: run } = await serviceSupabase
              .from("playbook_runs")
              .select("id")
              .eq("id", runId)
              .eq("playbook_id", playbook.id)
              .maybeSingle();
            if (!run) throw new Error("Workflow run not found");

            // Parse markdown into sections
            const sections = parseMarkdownSections(content);

            const { data, error } = await serviceSupabase
              .from("canvas")
              .upsert({
                playbook_id: playbook.id,
                run_id: runId,
                slug,
                name,
                content,
                sections,
                metadata: docMetadata,
                updated_at: new Date().toISOString(),
              }, { onConflict: "run_id,slug" })
              .select()
              .single();

            if (error) throw new Error(error.message);
            result = data;
            break;
          }

          case "patch_canvas_section": {
            const apiKeyData = await validateApiKey(c.req.raw, "canvas:write");
            if (!apiKeyData || apiKeyData.playbooks.id !== playbook.id) {
              throw new Error("Credential with canvas:write or full permission required");
            }

            const runId = args.run_id as string;
            const slug = args.slug as string;
            const sectionId = args.section_id as string;
            const sectionContent = args.content as string;
            const newHeading = args.heading as string | undefined;
            if (!runId) throw new Error("run_id is required");

            const { data: doc, error: fetchErr } = await serviceSupabase
              .from("canvas")
              .select("*")
              .eq("playbook_id", playbook.id)
              .eq("run_id", runId)
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
              .eq("run_id", runId)
              .eq("slug", slug)
              .select()
              .single();

            if (updateErr) throw new Error(updateErr.message);
            result = { updated_section: docSections[sectionIdx], document: updated };
            break;
          }

          case "get_canvas_toc": {
            const runId = args.run_id as string;
            const slug = args.slug as string;
            if (!runId) throw new Error("run_id is required");

            const { data, error } = await serviceSupabase
              .from("canvas")
              .select("slug, name, sections")
              .eq("playbook_id", playbook.id)
              .eq("run_id", runId)
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
            const apiKeyData = await validateApiKey(c.req.raw, "canvas:write");
            if (!apiKeyData || apiKeyData.playbooks.id !== playbook.id) {
              throw new Error("Credential with canvas:write or full permission required");
            }

            const runId = args.run_id as string;
            const slug = args.slug as string;
            const sectionId = args.section_id as string;
            const lockedBy = args.locked_by as string;
            if (!runId) throw new Error("run_id is required");

            const { data: doc, error: fetchErr } = await serviceSupabase
              .from("canvas")
              .select("sections")
              .eq("playbook_id", playbook.id)
              .eq("run_id", runId)
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
              .eq("run_id", runId)
              .eq("slug", slug);

            result = { locked: true, section_id: sectionId, locked_by: lockedBy };
            break;
          }

          case "unlock_canvas_section": {
            const apiKeyData = await validateApiKey(c.req.raw, "canvas:write");
            if (!apiKeyData || apiKeyData.playbooks.id !== playbook.id) {
              throw new Error("Credential with canvas:write or full permission required");
            }

            const runId = args.run_id as string;
            const slug = args.slug as string;
            const sectionId = args.section_id as string;
            if (!runId) throw new Error("run_id is required");

            const { data: doc, error: fetchErr } = await serviceSupabase
              .from("canvas")
              .select("sections")
              .eq("playbook_id", playbook.id)
              .eq("run_id", runId)
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
              .eq("run_id", runId)
              .eq("slug", slug);

            result = { unlocked: true, section_id: sectionId };
            break;
          }

          // ===== Self-Modification / Evolution Tools =====

          case "create_skill": {
            const apiKeyData = await validateApiKey(c.req.raw, "skills:write");
            if (!apiKeyData || apiKeyData.playbooks.id !== playbook.id) {
              throw new Error("API key with skills:write permission required");
            }

            const name = args.name as string;
            const description = args.description as string | undefined;
            const content = args.content as string;
            const priority = (args.priority as number) || 50;

            const nameError = validateAgentSkillName(name);
            if (nameError) throw new Error(nameError);
            const descriptionError = validateAgentSkillDescription(description);
            if (descriptionError) throw new Error(descriptionError);

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
            const apiKeyData = await validateApiKey(c.req.raw, "skills:write");
            if (!apiKeyData || apiKeyData.playbooks.id !== playbook.id) {
              throw new Error("API key with skills:write permission required");
            }

            const skillId = args.skill_id as string;
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(skillId);

            const updates: SkillsUpdate = {};
            if (args.name !== undefined) updates.name = args.name;
            if (args.description !== undefined) updates.description = args.description;
            if (args.content !== undefined) updates.content = args.content;
            if (args.priority !== undefined) updates.priority = args.priority;

            if (Object.keys(updates).length === 0) {
              throw new Error("No fields to update");
            }
            if (args.name !== undefined) {
              const nameError = validateAgentSkillName(args.name);
              if (nameError) throw new Error(nameError);
            }
            if (args.description !== undefined) {
              const descriptionError = validateAgentSkillDescription(args.description);
              if (descriptionError) throw new Error(descriptionError);
            }

            let query = serviceSupabase
              .from("skills")
              .select("id")
              .eq("playbook_id", playbook.id);

            if (isUuid) {
              query = query.eq("id", skillId);
            } else {
              query = query.ilike("name", skillId);
            }

            // Fetch the skill first to get its ID if we only have a name
            const { data: targetSkill } = await query
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (!targetSkill) {
              throw new Error("Skill not found");
            }

            const { data, error } = await serviceSupabase
              .from("skills")
              .update(updates)
              .eq("id", targetSkill.id)
              .select()
              .single();

            if (error) throw new Error(error.message);
            result = data;
            break;
          }

          case "delete_skill": {
            const apiKeyData = await validateApiKey(c.req.raw, "skills:write");
            if (!apiKeyData || apiKeyData.playbooks.id !== playbook.id) {
              throw new Error("API key with skills:write permission required");
            }

            const skillId = args.skill_id as string;
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(skillId);

            if (isUuid) {
              query = query.eq("id", skillId);
            } else {
              query = query.ilike("name", skillId);
            }

            // Fetch the skill first to get its ID if we only have a name
            const { data: skillToDelete } = await query
              .select("id")
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (skillToDelete) {

              const { error } = await serviceSupabase
                .from("skills")
                .delete()
                .eq("id", skillToDelete.id)
                .eq("playbook_id", playbook.id);

              if (error) throw new Error(error.message);
            }

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
                .ilike("name", skillId)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();
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
            const apiKeyData = await validateApiKey(c.req.raw, "skills:write");
            if (!apiKeyData || apiKeyData.playbooks.id !== playbook.id) {
              throw new Error("API key with skills:write permission required");
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
            const apiKeyData = await validateApiKey(c.req.raw, "playbooks:write");
            if (!apiKeyData || apiKeyData.playbooks.id !== playbook.id) {
              throw new Error("API key with playbooks:write or full permission required for this playbook");
            }

            const updates: PlaybooksUpdate = {};
            if (args.name !== undefined) updates.name = args.name;
            if (args.description !== undefined) updates.description = args.description;
            if (args.visibility !== undefined) {
              if (!["public", "private", "unlisted"].includes(args.visibility as string)) throw new Error("Invalid visibility");
              updates.visibility = args.visibility;
            }
            if (args.tags !== undefined) {
              if (!Array.isArray(args.tags)) throw new Error("tags must be an array");
              updates.tags = args.tags;
            }
            if (args.config !== undefined) {
              if (typeof args.config !== "object" || args.config === null || Array.isArray(args.config)) throw new Error("config must be an object");
              updates.config = args.config;
            }
            if (args.persona_name !== undefined) updates.persona_name = args.persona_name;
            if (args.persona_system_prompt !== undefined) updates.persona_system_prompt = args.persona_system_prompt;
            if (args.persona_metadata !== undefined) updates.persona_metadata = args.persona_metadata;
            if (args.instructions !== undefined) updates.instructions = args.instructions;

            if (Object.keys(updates).length === 0) {
              throw new Error("No fields to update");
            }

            updates.updated_at = new Date().toISOString();

            const { data, error } = await serviceSupabase
              .from("playbooks")
              .update(updates)
              .eq("id", playbook.id)
              .select("id, guid, name, description, visibility, tags, config, persona_name, persona_system_prompt, persona_metadata, instructions, updated_at")
              .single();

            if (error) throw new Error(error.message);
            result = data;
            break;
          }

          // ===== Connected MCP / OpenAPI Servers =====
          case "call_connected_tool": {
            const serverIdentifier = args.server_id as string;
            const connectedToolName = args.tool_name as string;
            if (!serverIdentifier || !connectedToolName) throw new Error("server_id and tool_name are required");
            const serverIsUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(serverIdentifier);
            let connectedServerQuery = serviceSupabase
              .from("mcp_servers")
              .select("*")
              .eq("playbook_id", playbook.id);
            connectedServerQuery = serverIsUuid
              ? connectedServerQuery.eq("id", serverIdentifier)
              : connectedServerQuery.eq("name", serverIdentifier);
            const { data: server, error: serverError } = await connectedServerQuery
              .limit(1)
              .maybeSingle();
            if (serverError || !server) throw new Error("Connected MCP server not found");

            const access = (server.transport_config as { access?: string } | null)?.access;
            if (access !== "public") {
              const credential = await validateApiKey(c.req.raw, "tools:call");
              if (!credential || credential.playbooks.id !== playbook.id) {
                throw new Error("Credential with tools:call or full permission required");
              }
            }

            const exposedName = connectedToolName.startsWith("ext__")
              ? connectedToolName
              : `${federatedServerPrefix(server as MCPServer)}${connectedToolName}`;
            result = await callFederatedTool(
              server as MCPServer,
              exposedName,
              (args.arguments as Record<string, unknown> | undefined) || {},
              await federationOptions(server as MCPServer, playbook.id, c.req.header("cf-ray") || c.req.header("x-request-id")),
            );
            break;
          }

          case "list_mcp_servers": {
            const { data, error } = await serviceSupabase
              .from("mcp_servers")
              .select("*")
              .eq("playbook_id", playbook.id)
              .order("created_at", { ascending: true });
            if (error) throw new Error(error.message);
            result = data || [];
            break;
          }

          case "create_mcp_server": {
            const credential = await validateApiKey(c.req.raw, "playbooks:write");
            if (!credential || credential.playbooks.id !== playbook.id) {
              throw new Error("Credential with playbooks:write or full permission required");
            }
            const name = typeof args.name === "string" ? args.name.trim() : "";
            if (!name) throw new Error("name is required");
            const transportType = (args.transport_type as string | undefined) || "http";
            if (!["stdio", "http", "sse", "openapi"].includes(transportType)) {
              throw new Error("Invalid MCP transport type");
            }
            if (args.transport_config !== undefined && (
              typeof args.transport_config !== "object"
              || args.transport_config === null
              || Array.isArray(args.transport_config)
            )) {
              throw new Error("transport_config must be an object");
            }
            const { data, error } = await serviceSupabase
              .from("mcp_servers")
              .insert({
                playbook_id: playbook.id,
                name,
                description: typeof args.description === "string" ? args.description : null,
                tools: Array.isArray(args.tools) ? args.tools : [],
                resources: Array.isArray(args.resources) ? args.resources : [],
                transport_type: transportType as "stdio" | "http" | "sse" | "openapi",
                transport_config: (args.transport_config as Record<string, unknown> | undefined) || {},
              })
              .select()
              .single();
            if (error || !data) throw new Error(error?.message || "Failed to connect MCP server");
            result = data;
            break;
          }

          case "update_mcp_server": {
            const credential = await validateApiKey(c.req.raw, "playbooks:write");
            if (!credential || credential.playbooks.id !== playbook.id) {
              throw new Error("Credential with playbooks:write or full permission required");
            }
            const serverId = args.server_id as string;
            if (!serverId) throw new Error("server_id is required");
            if (args.transport_type !== undefined && !["stdio", "http", "sse", "openapi"].includes(args.transport_type as string)) {
              throw new Error("Invalid MCP transport type");
            }
            if (args.transport_config !== undefined && (
              typeof args.transport_config !== "object"
              || args.transport_config === null
              || Array.isArray(args.transport_config)
            )) {
              throw new Error("transport_config must be an object");
            }
            const updates: MCPServersUpdate = {};
            if (args.name !== undefined) updates.name = args.name as MCPServersUpdate["name"];
            if (args.description !== undefined) updates.description = args.description as MCPServersUpdate["description"];
            if (args.tools !== undefined) updates.tools = args.tools as MCPServersUpdate["tools"];
            if (args.resources !== undefined) updates.resources = args.resources as MCPServersUpdate["resources"];
            if (args.transport_type !== undefined) updates.transport_type = args.transport_type as MCPServersUpdate["transport_type"];
            if (args.transport_config !== undefined) {
              updates.transport_config = args.transport_config as MCPServersUpdate["transport_config"];
            }
            if (Object.keys(updates).length === 0) throw new Error("No fields to update");
            const { data, error } = await serviceSupabase
              .from("mcp_servers")
              .update(updates)
              .eq("id", serverId)
              .eq("playbook_id", playbook.id)
              .select()
              .single();
            if (error || !data) throw new Error(error?.message || "MCP server not found");
            result = data;
            break;
          }

          case "delete_mcp_server": {
            const credential = await validateApiKey(c.req.raw, "playbooks:write");
            if (!credential || credential.playbooks.id !== playbook.id) {
              throw new Error("Credential with playbooks:write or full permission required");
            }
            const serverId = args.server_id as string;
            if (!serverId) throw new Error("server_id is required");
            const { error } = await serviceSupabase
              .from("mcp_servers")
              .delete()
              .eq("id", serverId)
              .eq("playbook_id", playbook.id);
            if (error) throw new Error(error.message);
            result = { success: true, deleted: serverId };
            break;
          }

          // ===== Workflow Runs =====
          case "list_runs": {
            const { data, error } = await serviceSupabase
              .from("playbook_runs")
              .select("*")
              .eq("playbook_id", playbook.id)
              .order("updated_at", { ascending: false });
            if (error) throw new Error(error.message);
            result = data || [];
            break;
          }

          case "create_run": {
            const credential = await validateApiKey(c.req.raw, "canvas:write");
            if (!credential || credential.playbooks.id !== playbook.id) {
              throw new Error("Credential with canvas:write or full permission required");
            }
            const name = typeof args.name === "string" ? args.name.trim() : "";
            if (!name) throw new Error("name is required");
            const { data, error } = await serviceSupabase
              .from("playbook_runs")
              .insert({
                playbook_id: playbook.id,
                created_by: credential.userId,
                name,
                status: "active",
                context: (args.context as Record<string, unknown> | undefined) || {},
              })
              .select()
              .single();
            if (error || !data) throw new Error(error?.message || "Failed to create workflow run");
            result = data;
            break;
          }

          case "update_run": {
            const credential = await validateApiKey(c.req.raw, "canvas:write");
            if (!credential || credential.playbooks.id !== playbook.id) {
              throw new Error("Credential with canvas:write or full permission required");
            }
            const runId = args.run_id as string;
            if (!runId) throw new Error("run_id is required");
            const updates: PlaybookRunsUpdate = { updated_at: new Date().toISOString() };
            if (typeof args.name === "string" && args.name.trim()) updates.name = args.name.trim();
            if (args.status !== undefined) {
              if (!["active", "completed", "archived"].includes(args.status as string)) throw new Error("Invalid run status");
              updates.status = args.status;
            }
            if (args.context !== undefined) {
              if (typeof args.context !== "object" || args.context === null || Array.isArray(args.context)) throw new Error("context must be an object");
              updates.context = args.context;
            }
            const { data, error } = await serviceSupabase
              .from("playbook_runs")
              .update(updates)
              .eq("id", runId)
              .eq("playbook_id", playbook.id)
              .select()
              .single();
            if (error || !data) throw new Error(error?.message || "Workflow run not found");
            result = data;
            break;
          }

          case "delete_run": {
            const credential = await validateApiKey(c.req.raw, "canvas:write");
            if (!credential || credential.playbooks.id !== playbook.id) {
              throw new Error("Credential with canvas:write or full permission required");
            }
            const runId = args.run_id as string;
            if (!runId) throw new Error("run_id is required");
            const { error } = await serviceSupabase
              .from("playbook_runs")
              .delete()
              .eq("id", runId)
              .eq("playbook_id", playbook.id);
            if (error) throw new Error(error.message);
            result = { success: true, deleted: runId };
            break;
          }

          // ===== Secrets Tools =====
          case "list_secrets": {
            secretAudit = beginSecretAudit("secret.list");
            const secretsApiKey = await validateApiKey(c.req.raw, "secrets:read");
            if (!secretsApiKey || secretsApiKey.playbooks.id !== playbook.id) {
              secretAudit.reason = "not_authorized";
              throw new Error("API key with secrets:read or full permission required");
            }
            secretAuditKeyPrefix = secretsApiKey.key_prefix;
            secretAudit.status = "error";

            let secretsQuery = serviceSupabase
              .from("secrets")
              .select("id, name, description, category, rotated_at, expires_at, last_used_at, use_count, created_at, updated_at")
              .eq("playbook_id", playbook.id);

            if (args.category) {
              secretsQuery = secretsQuery.eq("category", args.category as SecretCategory);
            }

            const { data: secretsList, error: secretsError } = await secretsQuery.order("name");
            if (secretsError) throw new Error(secretsError.message);
            result = secretsList || [];
            break;
          }

          case "use_secret": {
            // Proxy pattern: decrypt secret server-side, inject into HTTP request,
            // return only the response. The agent NEVER sees the secret value.
            secretAudit = beginSecretAudit("secret.use");
            const useSecretApiKey = await validateApiKey(c.req.raw, "secrets:read");
            if (!useSecretApiKey || useSecretApiKey.playbooks.id !== playbook.id) {
              secretAudit.reason = "not_authorized";
              throw new Error("API key with secrets:read or full permission required");
            }
            secretAuditKeyPrefix = useSecretApiKey.key_prefix;
            secretAudit.status = "error";

            const useSecretName = args.secret_name as string;
            const useUrl = args.url as string;
            secretAudit.secretName = useSecretName || null;
            // Host only — the path and query stay out of the trail.
            secretAudit.target = destinationHostOf(useUrl);
            if (!useSecretName || !useUrl) throw new Error("secret_name and url are required");

            // Validate URL to prevent SSRF
            try {
              const parsed = new URL(useUrl);
              if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
                throw new Error("Only http and https URLs are allowed");
              }
              if (parsed.username || parsed.password) {
                throw new Error("Credentials in proxy URLs are not allowed");
              }
              // Block private/internal IPs (including IPv6 variants)
              const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
              if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0" ||
                  hostname === "::1" || hostname === "::ffff:127.0.0.1" || hostname === "0000:0000:0000:0000:0000:0000:0000:0001" ||
                  hostname.startsWith("::ffff:10.") || hostname.startsWith("::ffff:192.168.") || hostname.startsWith("::ffff:172.") ||
                  hostname.startsWith("10.") || hostname.startsWith("192.168.") ||
                  hostname.startsWith("172.") || hostname.startsWith("169.254.") ||
                  hostname.startsWith("fc") || hostname.startsWith("fd") || hostname.startsWith("fe80") ||
                  hostname.endsWith(".internal") || hostname.endsWith(".local") ||
                  hostname === "metadata.google.internal" ||
                  !/^[a-z0-9.:\-\[\]]+$/i.test(hostname)) {
                secretAudit.status = "denied";
                secretAudit.reason = "private_destination";
                throw new Error("Requests to private/internal addresses are not allowed");
              }
            } catch (e) {
              if (e instanceof Error && e.message.includes("not allowed")) throw e;
              throw new Error(`Invalid URL: ${useUrl}`);
            }

            // Fetch and decrypt the secret
            const { data: useSecretData, error: useSecretError } = await serviceSupabase
              .from("secrets")
              .select("*")
              .eq("playbook_id", playbook.id)
              .eq("name", useSecretName)
              .single();

            if (useSecretError || !useSecretData) {
              secretAudit.reason = "not_found";
              throw new Error(`Secret '${useSecretName}' not found`);
            }

            const useDestination = checkSecretDestination(useUrl, useSecretData.allowed_hosts);
            if (!useDestination.allowed) {
              secretAudit.status = "denied";
              secretAudit.reason = "destination_not_allowed";
              throw new Error(useDestination.reason);
            }

            const secretValue = await decryptSecret({
              encrypted_value: useSecretData.encrypted_value,
              iv: useSecretData.iv,
              auth_tag: useSecretData.auth_tag,
            }, playbook.user_id, { playbookId: playbook.id, secretName: useSecretData.name });

            // Build the outgoing request
            const method = (args.method as string || "GET").toUpperCase();
            const headerName = (args.header_name as string) || "Authorization";
            const headerPrefix = args.header_prefix !== undefined ? (args.header_prefix as string) : "Bearer ";
            const timeoutMs = Math.min((args.timeout_ms as number) || 30000, 60000);

            const outHeaders: Record<string, string> = {
              [headerName]: `${headerPrefix}${secretValue}`,
            };

            // Add extra headers
            if (args.extra_headers && typeof args.extra_headers === "object") {
              for (const [k, v] of Object.entries(args.extra_headers as Record<string, string>)) {
                outHeaders[k] = v;
              }
            }

            // Default Content-Type for requests with body
            if (args.body && !outHeaders["Content-Type"]) {
              outHeaders["Content-Type"] = "application/json";
            }

            const fetchOptions: RequestInit = {
              method,
              headers: outHeaders,
              // Do not leak the injected secret across an unchecked redirect.
              redirect: "manual",
              signal: AbortSignal.timeout(timeoutMs),
            };

            if (args.body && ["POST", "PUT", "PATCH"].includes(method)) {
              fetchOptions.body = JSON.stringify(args.body);
            }

            try {
              const proxyRes = await fetch(useUrl, fetchOptions);
              const contentType = proxyRes.headers.get("content-type") || "";
              let responseBody: unknown;

              if (contentType.includes("application/json")) {
                responseBody = await proxyRes.json();
              } else {
                const text = await proxyRes.text();
                // Truncate very large responses
                responseBody = text.length > 10000 ? text.slice(0, 10000) + "\n... (truncated)" : text;
              }

              // Update usage stats
              await serviceSupabase
                .from("secrets")
                .update({
                  last_used_at: new Date().toISOString(),
                  use_count: (useSecretData.use_count || 0) + 1,
                })
                .eq("id", useSecretData.id);

              result = {
                status: proxyRes.status,
                status_text: proxyRes.statusText,
                body: responseBody,
                note: `Request made with secret '${useSecretName}' injected as ${headerName} header. Secret value was NOT exposed to the agent.`,
              };
            } catch (fetchErr) {
              const msg = fetchErr instanceof Error ? fetchErr.message : "Request failed";
              throw new Error(`HTTP request to ${useUrl} failed: ${msg}`);
            }
            break;
          }

          case "store_secret": {
            secretAudit = beginSecretAudit("secret.create");
            const storeSecretApiKey = await validateApiKey(c.req.raw, "secrets:write");
            if (!storeSecretApiKey || storeSecretApiKey.playbooks.id !== playbook.id) {
              secretAudit.reason = "not_authorized";
              throw new Error("API key with secrets:write or full permission required");
            }
            secretAuditKeyPrefix = storeSecretApiKey.key_prefix;
            secretAudit.status = "error";

            const storeName = args.name as string;
            const storeValue = args.value as string;
            secretAudit.secretName = storeName ? storeName.trim() : null;
            if (!storeName || !storeValue) throw new Error("name and value are required");

            const normalizedStoreName = storeName.trim();
            if (!/^[A-Za-z0-9_-]+$/.test(normalizedStoreName)) {
              throw new Error("name can only contain letters, numbers, underscores, and hyphens");
            }
            const { data: existingSecret } = await serviceSupabase
              .from("secrets")
              .select("id")
              .eq("playbook_id", playbook.id)
              .eq("name", normalizedStoreName)
              .single();

            if (existingSecret) {
              secretAudit.reason = "duplicate_name";
              throw new Error(`Secret '${storeName}' already exists. Use rotate_secret to update.`);
            }

            const encrypted = await encryptSecret(storeValue, playbook.user_id, {
              playbookId: playbook.id,
              secretName: normalizedStoreName,
            });

            const { data: storedSecret, error: storeError } = await serviceSupabase
              .from("secrets")
              .insert({
                playbook_id: playbook.id,
                name: normalizedStoreName,
                description: (args.description as string) || null,
                category: (args.category as SecretCategory) || "general",
                expires_at: (args.expires_at as string) || null,
                allow_api_key_reveal: (args.allow_api_key_reveal as boolean) || false,
                encrypted_value: encrypted.encrypted_value,
                iv: encrypted.iv,
                auth_tag: encrypted.auth_tag,
                created_by: storeSecretApiKey.key_prefix,
                updated_by: storeSecretApiKey.key_prefix,
              })
              .select("id, name, description, category, created_at")
              .single();

            if (storeError) {
              secretAudit.reason = storeError.code === "23505" ? "duplicate_name" : "insert_failed";
              if (storeError.code === "23505") {
                throw new Error(`Secret '${storeName}' already exists. Use rotate_secret to update.`);
              }
              throw new Error(storeError.message);
            }
            result = storedSecret;
            break;
          }

          case "rotate_secret": {
            secretAudit = beginSecretAudit("secret.rotate");
            const rotateApiKey = await validateApiKey(c.req.raw, "secrets:write");
            if (!rotateApiKey || rotateApiKey.playbooks.id !== playbook.id) {
              secretAudit.reason = "not_authorized";
              throw new Error("API key with secrets:write or full permission required");
            }
            secretAuditKeyPrefix = rotateApiKey.key_prefix;
            secretAudit.status = "error";

            const rotateName = args.name as string;
            const rotateValue = args.value as string;
            secretAudit.secretName = rotateName || null;
            if (!rotateName || !rotateValue) throw new Error("name and value are required");

            const { data: existingSecret } = await serviceSupabase
              .from("secrets")
              .select("id")
              .eq("playbook_id", playbook.id)
              .eq("name", rotateName)
              .single();

            if (!existingSecret) {
              secretAudit.reason = "not_found";
              throw new Error(`Secret '${rotateName}' not found`);
            }

            const rotateEncrypted = await encryptSecret(rotateValue, playbook.user_id, {
              playbookId: playbook.id,
              secretName: rotateName,
            });

            const { data: rotatedSecret, error: rotateError } = await serviceSupabase
              .from("secrets")
              .update({
                encrypted_value: rotateEncrypted.encrypted_value,
                iv: rotateEncrypted.iv,
                auth_tag: rotateEncrypted.auth_tag,
                rotated_at: new Date().toISOString(),
                updated_by: rotateApiKey.key_prefix,
              })
              .eq("id", existingSecret.id)
              .select("id, name, rotated_at, updated_at")
              .single();

            if (rotateError) {
              secretAudit.reason = "update_failed";
              throw new Error(rotateError.message);
            }
            result = rotatedSecret;
            break;
          }

          case "delete_secret": {
            secretAudit = beginSecretAudit("secret.delete");
            const deleteSecretApiKey = await validateApiKey(c.req.raw, "secrets:write");
            if (!deleteSecretApiKey || deleteSecretApiKey.playbooks.id !== playbook.id) {
              secretAudit.reason = "not_authorized";
              throw new Error("API key with secrets:write or full permission required");
            }
            secretAuditKeyPrefix = deleteSecretApiKey.key_prefix;
            secretAudit.status = "error";

            const deleteSecretName = args.name as string;
            secretAudit.secretName = deleteSecretName || null;
            if (!deleteSecretName) throw new Error("name is required");

            const { error: deleteSecretError } = await serviceSupabase
              .from("secrets")
              .delete()
              .eq("playbook_id", playbook.id)
              .eq("name", deleteSecretName);

            if (deleteSecretError) {
              secretAudit.reason = "delete_failed";
              throw new Error(deleteSecretError.message);
            }
            result = { success: true, deleted: deleteSecretName };
            break;
          }

          default:
            throw new Error(`Unknown tool: ${toolName}. Use list_skills / get_skill to access skill definitions.`);
        }

        await flushSecretAudit(secretAuditContext(), secretAudit, "success");
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
        // The message is not stored: it interpolates its inputs, and one of
        // those inputs is the outbound URL.
        await flushSecretAudit(secretAuditContext(), secretAudit, "failure", "tool_error");
        return c.json({
          jsonrpc: "2.0",
          id,
          error: { code: -32000, message },
        });
      }
    }

    default:
      // A modern client reads the status: 404 with -32601 says "this endpoint
      // exists, that method does not", which is what separates us from a 404
      // for a URL that hosts nothing. Legacy callers keep their 200.
      return c.json({
        jsonrpc: "2.0",
        id,
        error: { code: METHOD_NOT_FOUND, message: `Method not found: ${method}` },
      }, modern ? 404 : 200);
  }
});

export const GET = handle(app);
export const POST = handle(app);
