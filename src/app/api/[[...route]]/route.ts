import { Hono } from "hono";
import { handle } from "hono/vercel";
import { cors } from "hono/cors";
import { createServerClient } from "@/lib/supabase/client";
import { hashApiKey } from "@/lib/utils";

// Types
type Bindings = {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

const app = new Hono<{ Bindings: Bindings }>().basePath("/api");

// CORS middleware
app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
}));

// Helper: Get Supabase client
function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createServerClient(url, key);
}

// Helper: Get service role client (bypasses RLS)
function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createServerClient(url, key);
}

// ============================================
// PUBLIC PLAYBOOK ENDPOINTS (no auth required)
// ============================================

// GET /api/playbooks/:guid - Get public playbook
app.get("/playbooks/:guid", async (c) => {
  const guid = c.req.param("guid");
  const format = c.req.query("format") || "json";
  const supabase = getSupabase();

  // Get playbook
  const { data: playbook, error } = await supabase
    .from("playbooks")
    .select("*")
    .eq("guid", guid)
    .eq("is_public", true)
    .single();

  if (error || !playbook) {
    return c.json({ error: "Playbook not found" }, 404);
  }

  // Get related data
  const [personas, skills, mcpServers] = await Promise.all([
    supabase.from("personas").select("*").eq("playbook_id", playbook.id),
    supabase.from("skills").select("*").eq("playbook_id", playbook.id),
    supabase.from("mcp_servers").select("*").eq("playbook_id", playbook.id),
  ]);

  const fullPlaybook = {
    ...playbook,
    personas: personas.data || [],
    skills: skills.data || [],
    mcp_servers: mcpServers.data || [],
  };

  // Format output
  switch (format) {
    case "openapi":
      return c.json(formatAsOpenAPI(fullPlaybook));
    case "mcp":
      return c.json(formatAsMCP(fullPlaybook));
    case "markdown":
      return c.text(formatAsMarkdown(fullPlaybook));
    default:
      return c.json(fullPlaybook);
  }
});

// GET /api/playbooks/:guid/personas
app.get("/playbooks/:guid/personas", async (c) => {
  const guid = c.req.param("guid");
  const supabase = getSupabase();

  const { data: playbook } = await supabase
    .from("playbooks")
    .select("id")
    .eq("guid", guid)
    .eq("is_public", true)
    .single();

  if (!playbook) {
    return c.json({ error: "Playbook not found" }, 404);
  }

  const { data } = await supabase
    .from("personas")
    .select("*")
    .eq("playbook_id", playbook.id);

  return c.json(data || []);
});

// GET /api/playbooks/:guid/skills
app.get("/playbooks/:guid/skills", async (c) => {
  const guid = c.req.param("guid");
  const supabase = getSupabase();

  const { data: playbook } = await supabase
    .from("playbooks")
    .select("id")
    .eq("guid", guid)
    .eq("is_public", true)
    .single();

  if (!playbook) {
    return c.json({ error: "Playbook not found" }, 404);
  }

  const { data } = await supabase
    .from("skills")
    .select("*")
    .eq("playbook_id", playbook.id);

  return c.json(data || []);
});

// ============================================
// PUBLIC REPOSITORY ENDPOINTS
// ============================================

// GET /api/public/skills
app.get("/public/skills", async (c) => {
  const tags = c.req.query("tags")?.split(",");
  const search = c.req.query("search");
  const supabase = getSupabase();

  let query = supabase
    .from("public_skills")
    .select("*")
    .order("usage_count", { ascending: false });

  if (tags?.length) {
    query = query.overlaps("tags", tags);
  }

  if (search) {
    query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
  }

  const { data, error } = await query.limit(50);

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json(data || []);
});

// GET /api/public/skills/:id
app.get("/public/skills/:id", async (c) => {
  const id = c.req.param("id");
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("public_skills")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return c.json({ error: "Skill not found" }, 404);
  }

  return c.json(data);
});

// GET /api/public/mcp
app.get("/public/mcp", async (c) => {
  const tags = c.req.query("tags")?.split(",");
  const search = c.req.query("search");
  const supabase = getSupabase();

  let query = supabase
    .from("public_mcp_servers")
    .select("*")
    .order("usage_count", { ascending: false });

  if (tags?.length) {
    query = query.overlaps("tags", tags);
  }

  if (search) {
    query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
  }

  const { data, error } = await query.limit(50);

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json(data || []);
});

// GET /api/public/mcp/:id
app.get("/public/mcp/:id", async (c) => {
  const id = c.req.param("id");
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("public_mcp_servers")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return c.json({ error: "MCP Server not found" }, 404);
  }

  return c.json(data);
});

// ============================================
// AGENT ENDPOINTS (API key required for writes)
// ============================================

// Middleware: Validate API key
async function validateApiKey(c: any, requiredPermission: string) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer apb_")) {
    return null;
  }

  const apiKey = authHeader.replace("Bearer ", "");
  const keyHash = await hashApiKey(apiKey);
  const supabase = getServiceSupabase();

  const { data } = await supabase
    .from("api_keys")
    .select("*, playbooks!inner(id, guid)")
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

  // Check permission
  if (!data.permissions.includes(requiredPermission) && !data.permissions.includes("full")) {
    return null;
  }

  // Update last_used_at
  await supabase
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);

  return data;
}

// GET /api/agent/:guid/memory
app.get("/agent/:guid/memory", async (c) => {
  const guid = c.req.param("guid");
  const key = c.req.query("key");
  const supabase = getSupabase();

  // Get playbook
  const { data: playbook } = await supabase
    .from("playbooks")
    .select("id")
    .eq("guid", guid)
    .eq("is_public", true)
    .single();

  if (!playbook) {
    return c.json({ error: "Playbook not found" }, 404);
  }

  let query = supabase
    .from("memories")
    .select("key, value, updated_at")
    .eq("playbook_id", playbook.id);

  if (key) {
    query = query.eq("key", key);
  }

  const { data, error } = await query;

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  // If single key requested, return just the value
  if (key && data?.length) {
    return c.json(data[0]);
  }

  return c.json(data || []);
});

// POST /api/agent/:guid/memory
app.post("/agent/:guid/memory", async (c) => {
  const guid = c.req.param("guid");
  
  // Validate API key
  const apiKeyData = await validateApiKey(c, "memory:write");
  if (!apiKeyData) {
    return c.json({ error: "Invalid or missing API key" }, 401);
  }

  // Verify the API key belongs to this playbook
  if (apiKeyData.playbooks.guid !== guid) {
    return c.json({ error: "API key does not match playbook" }, 403);
  }

  const body = await c.req.json();
  const { key, value } = body;

  if (!key || value === undefined) {
    return c.json({ error: "Missing key or value" }, 400);
  }

  const supabase = getServiceSupabase();

  // Upsert memory
  const { data, error } = await supabase
    .from("memories")
    .upsert({
      playbook_id: apiKeyData.playbook_id,
      key,
      value,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: "playbook_id,key",
    })
    .select()
    .single();

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json(data);
});

// DELETE /api/agent/:guid/memory/:key
app.delete("/agent/:guid/memory/:key", async (c) => {
  const guid = c.req.param("guid");
  const key = c.req.param("key");

  const apiKeyData = await validateApiKey(c, "memory:write");
  if (!apiKeyData || apiKeyData.playbooks.guid !== guid) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const supabase = getServiceSupabase();

  const { error } = await supabase
    .from("memories")
    .delete()
    .eq("playbook_id", apiKeyData.playbook_id)
    .eq("key", key);

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ success: true });
});

// POST /api/agent/:guid/skills
app.post("/agent/:guid/skills", async (c) => {
  const guid = c.req.param("guid");

  const apiKeyData = await validateApiKey(c, "skills:write");
  if (!apiKeyData || apiKeyData.playbooks.guid !== guid) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json();
  const { name, description, definition, examples } = body;

  if (!name) {
    return c.json({ error: "Missing name" }, 400);
  }

  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from("skills")
    .insert({
      playbook_id: apiKeyData.playbook_id,
      name,
      description: description || null,
      definition: definition || {},
      examples: examples || [],
    })
    .select()
    .single();

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json(data);
});

// PUT /api/agent/:guid/skills/:id
app.put("/agent/:guid/skills/:id", async (c) => {
  const guid = c.req.param("guid");
  const skillId = c.req.param("id");

  const apiKeyData = await validateApiKey(c, "skills:write");
  if (!apiKeyData || apiKeyData.playbooks.guid !== guid) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json();
  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from("skills")
    .update(body)
    .eq("id", skillId)
    .eq("playbook_id", apiKeyData.playbook_id)
    .select()
    .single();

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json(data);
});

// POST /api/agent/:guid/personas
app.post("/agent/:guid/personas", async (c) => {
  const guid = c.req.param("guid");

  const apiKeyData = await validateApiKey(c, "personas:write");
  if (!apiKeyData || apiKeyData.playbooks.guid !== guid) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json();
  const { name, system_prompt, metadata } = body;

  if (!name || !system_prompt) {
    return c.json({ error: "Missing name or system_prompt" }, 400);
  }

  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from("personas")
    .insert({
      playbook_id: apiKeyData.playbook_id,
      name,
      system_prompt,
      metadata: metadata || {},
    })
    .select()
    .single();

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json(data);
});

// PUT /api/agent/:guid/personas/:id
app.put("/agent/:guid/personas/:id", async (c) => {
  const guid = c.req.param("guid");
  const personaId = c.req.param("id");

  const apiKeyData = await validateApiKey(c, "personas:write");
  if (!apiKeyData || apiKeyData.playbooks.guid !== guid) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json();
  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from("personas")
    .update(body)
    .eq("id", personaId)
    .eq("playbook_id", apiKeyData.playbook_id)
    .select()
    .single();

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json(data);
});

// ============================================
// FORMAT HELPERS
// ============================================

function formatAsOpenAPI(playbook: any) {
  const tools = playbook.skills.map((skill: any) => ({
    type: "function",
    function: {
      name: skill.name.toLowerCase().replace(/\s+/g, "_"),
      description: skill.description || skill.name,
      parameters: skill.definition?.parameters || { type: "object", properties: {} },
    },
  }));

  return {
    openapi: "3.1.0",
    info: {
      title: playbook.name,
      description: playbook.description,
      version: "1.0.0",
    },
    servers: [
      {
        url: `${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace("supabase.co", "agentplaybooks.com") || "https://api.agentplaybooks.com"}/api`,
      },
    ],
    paths: {
      [`/agent/${playbook.guid}/memory`]: {
        get: {
          summary: "Get memories",
          operationId: "getMemories",
          responses: { "200": { description: "Success" } },
        },
        post: {
          summary: "Write memory",
          operationId: "writeMemory",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    key: { type: "string" },
                    value: { type: "object" },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "Success" } },
        },
      },
    },
    components: {
      schemas: {},
    },
    "x-playbook": {
      personas: playbook.personas,
      skills: tools,
    },
  };
}

function formatAsMCP(playbook: any) {
  const tools = playbook.skills.map((skill: any) => ({
    name: skill.name.toLowerCase().replace(/\s+/g, "_"),
    description: skill.description || skill.name,
    inputSchema: skill.definition?.parameters || { type: "object", properties: {} },
  }));

  const resources = [
    {
      uri: `playbook://${playbook.guid}/personas`,
      name: "Personas",
      description: "AI personalities for this playbook",
      mimeType: "application/json",
    },
    {
      uri: `playbook://${playbook.guid}/memory`,
      name: "Memory",
      description: "Persistent memory storage",
      mimeType: "application/json",
    },
  ];

  // Add MCP servers from playbook
  for (const mcp of playbook.mcp_servers) {
    tools.push(...(mcp.tools || []));
    resources.push(...(mcp.resources || []));
  }

  return {
    protocolVersion: "2024-11-05",
    serverInfo: {
      name: playbook.name,
      version: "1.0.0",
    },
    capabilities: {
      tools: {},
      resources: {},
    },
    tools,
    resources,
    personas: playbook.personas.map((p: any) => ({
      name: p.name,
      systemPrompt: p.system_prompt,
    })),
  };
}

function formatAsMarkdown(playbook: any): string {
  let md = `# ${playbook.name}\n\n`;
  
  if (playbook.description) {
    md += `${playbook.description}\n\n`;
  }

  if (playbook.personas?.length) {
    md += `## Personas\n\n`;
    for (const persona of playbook.personas) {
      md += `### ${persona.name}\n\n`;
      md += `${persona.system_prompt}\n\n`;
    }
  }

  if (playbook.skills?.length) {
    md += `## Skills\n\n`;
    for (const skill of playbook.skills) {
      md += `### ${skill.name}\n\n`;
      if (skill.description) {
        md += `${skill.description}\n\n`;
      }
      if (skill.examples?.length) {
        md += `**Examples:**\n\n`;
        for (const example of skill.examples) {
          md += `- ${JSON.stringify(example)}\n`;
        }
        md += "\n";
      }
    }
  }

  if (playbook.mcp_servers?.length) {
    md += `## MCP Servers\n\n`;
    for (const mcp of playbook.mcp_servers) {
      md += `### ${mcp.name}\n\n`;
      if (mcp.description) {
        md += `${mcp.description}\n\n`;
      }
      if (mcp.tools?.length) {
        md += `**Tools:** ${mcp.tools.map((t: any) => t.name).join(", ")}\n\n`;
      }
    }
  }

  md += `---\n\n`;
  md += `**API Endpoint:** \`/api/agent/${playbook.guid}\`\n`;
  md += `**Formats:** json, openapi, mcp, markdown\n`;

  return md;
}

// Health check
app.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Export for Next.js
export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const DELETE = handle(app);
export const OPTIONS = handle(app);

