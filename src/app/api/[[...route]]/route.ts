import { Hono } from "hono";
import { handle } from "hono/vercel";
import { cors } from "hono/cors";
import { createServerClient } from "@/lib/supabase/client";
import type { ApiKey } from "@/lib/supabase/types";
import { hashApiKey, generateApiKey, generateGuid, getKeyPrefix } from "@/lib/utils";
import { cookies } from "next/headers";

// Types
type Bindings = {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

type Variables = {
  user: { id: string } | null;
};

type ApiKeyWithPlaybook = ApiKey & {
  playbooks: { id: string; guid: string };
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>().basePath("/api");

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

// Helper: Get authenticated user from cookies or Authorization header
async function getAuthenticatedUser(c: any): Promise<{ id: string } | null> {
  const supabase = getSupabase();
  
  // Try to get user from cookie
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get("sb-access-token")?.value;
    const refreshToken = cookieStore.get("sb-refresh-token")?.value;
    
    if (accessToken && refreshToken) {
      const { data: { user }, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (!error && user) {
        return { id: user.id };
      }
    }
  } catch (e) {
    // Cookie parsing might fail in some environments
    console.log("Cookie auth failed, trying header...", e);
  }
  
  // Try Authorization header (for API calls)
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ") && !authHeader.startsWith("Bearer apb_")) {
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (!error && user) {
      return { id: user.id };
    }
  }
  
  return null;
}

// Middleware: Require authenticated user
async function requireAuth(c: any): Promise<{ id: string } | null> {
  const user = await getAuthenticatedUser(c);
  if (!user) {
    return null;
  }
  return user;
}

// Helper: Validate API key for agent endpoints
async function validateApiKey(c: any, requiredPermission: string): Promise<ApiKeyWithPlaybook | null> {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer apb_")) {
    return null;
  }

  const apiKey = authHeader.replace("Bearer ", "");
  const keyHash = await hashApiKey(apiKey);
  const supabase = getServiceSupabase();

  const { data } = await supabase
    .from("api_keys")
    .select("*")
    .eq("key_hash", keyHash)
    .eq("is_active", true)
    .single();

  const apiKeyData = data as ApiKey | null;

  if (!apiKeyData) {
    return null;
  }

  // Check expiration
  if (apiKeyData.expires_at && new Date(apiKeyData.expires_at) < new Date()) {
    return null;
  }

  // Check permission
  if (!apiKeyData.permissions.includes(requiredPermission) && !apiKeyData.permissions.includes("full")) {
    return null;
  }

  const { data: playbook } = await supabase
    .from("playbooks")
    .select("id, guid")
    .eq("id", apiKeyData.playbook_id)
    .single();

  if (!playbook) {
    return null;
  }

  // Update last_used_at
  await supabase
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", apiKeyData.id);

  return { ...apiKeyData, playbooks: playbook };
}

// Helper: Check if user owns playbook
async function checkPlaybookOwnership(userId: string, playbookId: string): Promise<boolean> {
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("playbooks")
    .select("id")
    .eq("id", playbookId)
    .eq("user_id", userId)
    .single();
  return !!data;
}

// ============================================
// AUTHENTICATED PLAYBOOK CRUD (requires login)
// ============================================

// GET /api/playbooks - List user's playbooks
app.get("/playbooks", async (c) => {
  const user = await requireAuth(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const supabase = getServiceSupabase();
  
  const { data, error } = await supabase
    .from("playbooks")
    .select(`
      *,
      personas:personas(count),
      skills:skills(count),
      mcp_servers:mcp_servers(count)
    `)
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  // Transform count objects to numbers
  const playbooks = (data || []).map((p: any) => ({
    ...p,
    persona_count: p.personas?.[0]?.count || 0,
    skill_count: p.skills?.[0]?.count || 0,
    mcp_server_count: p.mcp_servers?.[0]?.count || 0,
    personas: undefined,
    skills: undefined,
    mcp_servers: undefined,
  }));

  return c.json(playbooks);
});

// POST /api/playbooks - Create new playbook
app.post("/playbooks", async (c) => {
  const user = await requireAuth(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json();
  const { name, description, is_public, config } = body;

  if (!name) {
    return c.json({ error: "Name is required" }, 400);
  }

  const supabase = getServiceSupabase();
  const guid = generateGuid();

  const { data, error } = await supabase
    .from("playbooks")
    .insert({
      user_id: user.id,
      guid,
      name,
      description: description || null,
      is_public: is_public || false,
      config: config || {},
    })
    .select()
    .single();

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json(data, 201);
});

// GET /api/playbooks/:guid - Get playbook (public or owned)
app.get("/playbooks/:guid", async (c) => {
  const guid = c.req.param("guid");
  const format = c.req.query("format") || "json";
  const supabase = getServiceSupabase();

  // Try to get user (optional auth)
  const user = await getAuthenticatedUser(c);

  // First try to find by guid
  let query = supabase
    .from("playbooks")
    .select("*")
    .eq("guid", guid);

  // If not authenticated, only show public
  // If authenticated, show public OR owned
  const { data: playbook, error } = await query.single();

  if (error || !playbook) {
    return c.json({ error: "Playbook not found" }, 404);
  }

  // Check access: either public or owned by user
  if (!playbook.is_public && (!user || playbook.user_id !== user.id)) {
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
    case "anthropic":
      return c.json(formatAsAnthropic(fullPlaybook));
    case "markdown":
      return c.text(formatAsMarkdown(fullPlaybook));
    default:
      return c.json(fullPlaybook);
  }
});

// PUT /api/playbooks/:id - Update playbook
app.put("/playbooks/:id", async (c) => {
  const user = await requireAuth(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const playbookId = c.req.param("id");
  
  // Check ownership
  if (!(await checkPlaybookOwnership(user.id, playbookId))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json();
  const { name, description, is_public, config } = body;

  const supabase = getServiceSupabase();

  const updateData: any = {};
  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  if (is_public !== undefined) updateData.is_public = is_public;
  if (config !== undefined) updateData.config = config;

  const { data, error } = await supabase
    .from("playbooks")
    .update(updateData)
    .eq("id", playbookId)
    .select()
    .single();

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json(data);
});

// DELETE /api/playbooks/:id - Delete playbook
app.delete("/playbooks/:id", async (c) => {
  const user = await requireAuth(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const playbookId = c.req.param("id");
  
  if (!(await checkPlaybookOwnership(user.id, playbookId))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const supabase = getServiceSupabase();

  const { error } = await supabase
    .from("playbooks")
    .delete()
    .eq("id", playbookId);

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ success: true });
});

// ============================================
// PERSONAS CRUD (authenticated)
// ============================================

// GET /api/playbooks/:id/personas
app.get("/playbooks/:id/personas", async (c) => {
  const user = await requireAuth(c);
  const playbookId = c.req.param("id");
  const supabase = getServiceSupabase();

  // Check if playbook is public or user owns it
  const { data: playbook } = await supabase
    .from("playbooks")
    .select("id, user_id, is_public")
    .eq("id", playbookId)
    .single();

  if (!playbook) {
    return c.json({ error: "Playbook not found" }, 404);
  }

  // Must be public or owned
  if (!playbook.is_public && (!user || playbook.user_id !== user.id)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const { data, error } = await supabase
    .from("personas")
    .select("*")
    .eq("playbook_id", playbookId)
    .order("created_at", { ascending: true });

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json(data || []);
});

// POST /api/playbooks/:id/personas
app.post("/playbooks/:id/personas", async (c) => {
  const user = await requireAuth(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const playbookId = c.req.param("id");
  
  if (!(await checkPlaybookOwnership(user.id, playbookId))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json();
  const { name, system_prompt, metadata } = body;

  if (!name || !system_prompt) {
    return c.json({ error: "Name and system_prompt are required" }, 400);
  }

  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from("personas")
    .insert({
      playbook_id: playbookId,
      name,
      system_prompt,
      metadata: metadata || {},
    })
    .select()
    .single();

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json(data, 201);
});

// PUT /api/playbooks/:id/personas/:pid
app.put("/playbooks/:id/personas/:pid", async (c) => {
  const user = await requireAuth(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const playbookId = c.req.param("id");
  const personaId = c.req.param("pid");
  
  if (!(await checkPlaybookOwnership(user.id, playbookId))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json();
  const { name, system_prompt, metadata } = body;

  const supabase = getServiceSupabase();

  const updateData: any = {};
  if (name !== undefined) updateData.name = name;
  if (system_prompt !== undefined) updateData.system_prompt = system_prompt;
  if (metadata !== undefined) updateData.metadata = metadata;

  const { data, error } = await supabase
    .from("personas")
    .update(updateData)
    .eq("id", personaId)
    .eq("playbook_id", playbookId)
    .select()
    .single();

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json(data);
});

// DELETE /api/playbooks/:id/personas/:pid
app.delete("/playbooks/:id/personas/:pid", async (c) => {
  const user = await requireAuth(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const playbookId = c.req.param("id");
  const personaId = c.req.param("pid");
  
  if (!(await checkPlaybookOwnership(user.id, playbookId))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const supabase = getServiceSupabase();

  const { error } = await supabase
    .from("personas")
    .delete()
    .eq("id", personaId)
    .eq("playbook_id", playbookId);

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ success: true });
});

// ============================================
// SKILLS CRUD (authenticated)
// ============================================

// GET /api/playbooks/:id/skills
app.get("/playbooks/:id/skills", async (c) => {
  const user = await requireAuth(c);
  const playbookId = c.req.param("id");
  const supabase = getServiceSupabase();

  // Check if playbook is public or user owns it
  const { data: playbook } = await supabase
    .from("playbooks")
    .select("id, user_id, is_public")
    .eq("id", playbookId)
    .single();

  if (!playbook) {
    return c.json({ error: "Playbook not found" }, 404);
  }

  if (!playbook.is_public && (!user || playbook.user_id !== user.id)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const { data, error } = await supabase
    .from("skills")
    .select("*")
    .eq("playbook_id", playbookId)
    .order("created_at", { ascending: true });

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json(data || []);
});

// POST /api/playbooks/:id/skills
app.post("/playbooks/:id/skills", async (c) => {
  const user = await requireAuth(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const playbookId = c.req.param("id");
  
  if (!(await checkPlaybookOwnership(user.id, playbookId))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json();
  const { name, description, definition, examples } = body;

  if (!name) {
    return c.json({ error: "Name is required" }, 400);
  }

  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from("skills")
    .insert({
      playbook_id: playbookId,
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

  return c.json(data, 201);
});

// PUT /api/playbooks/:id/skills/:sid
app.put("/playbooks/:id/skills/:sid", async (c) => {
  const user = await requireAuth(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const playbookId = c.req.param("id");
  const skillId = c.req.param("sid");
  
  if (!(await checkPlaybookOwnership(user.id, playbookId))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json();
  const { name, description, definition, examples } = body;

  const supabase = getServiceSupabase();

  const updateData: any = {};
  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  if (definition !== undefined) updateData.definition = definition;
  if (examples !== undefined) updateData.examples = examples;

  const { data, error } = await supabase
    .from("skills")
    .update(updateData)
    .eq("id", skillId)
    .eq("playbook_id", playbookId)
    .select()
    .single();

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json(data);
});

// DELETE /api/playbooks/:id/skills/:sid
app.delete("/playbooks/:id/skills/:sid", async (c) => {
  const user = await requireAuth(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const playbookId = c.req.param("id");
  const skillId = c.req.param("sid");
  
  if (!(await checkPlaybookOwnership(user.id, playbookId))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const supabase = getServiceSupabase();

  const { error } = await supabase
    .from("skills")
    .delete()
    .eq("id", skillId)
    .eq("playbook_id", playbookId);

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ success: true });
});

// ============================================
// MEMORY ENDPOINTS (API key required for writes)
// ============================================

// Helper: Get playbook by guid (public or owned)
async function getPlaybookByGuid(guid: string, userId: string | null) {
  const supabase = getServiceSupabase();
  const { data: playbook } = await supabase
    .from("playbooks")
    .select("id, user_id, is_public, guid")
    .eq("guid", guid)
    .single();

  if (!playbook) return null;
  
  // Check access
  if (!playbook.is_public && (!userId || playbook.user_id !== userId)) {
    return null;
  }
  
  return playbook;
}

// GET /api/playbooks/:guid/memory - Read memory (public for public playbooks)
app.get("/playbooks/:guid/memory", async (c) => {
  const guid = c.req.param("guid");
  const key = c.req.query("key");
  const user = await getAuthenticatedUser(c);
  
  const playbook = await getPlaybookByGuid(guid, user?.id || null);
  if (!playbook) {
    return c.json({ error: "Playbook not found" }, 404);
  }

  const supabase = getServiceSupabase();

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

// PUT /api/playbooks/:guid/memory/:key - Update memory (requires API key)
app.put("/playbooks/:guid/memory/:key", async (c) => {
  const guid = c.req.param("guid");
  const key = c.req.param("key");

  // Check API key first
  const apiKeyData = await validateApiKey(c, "memory:write");
  if (apiKeyData) {
    // Verify the API key belongs to this playbook
    if (apiKeyData.playbooks.guid !== guid) {
      return c.json({ error: "API key does not match playbook" }, 403);
    }
  } else {
    // Fall back to user auth
    const user = await requireAuth(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    
    const playbook = await getPlaybookByGuid(guid, user.id);
    if (!playbook || playbook.user_id !== user.id) {
      return c.json({ error: "Forbidden" }, 403);
    }
  }

  const body = await c.req.json();
  const { value } = body;

  if (value === undefined) {
    return c.json({ error: "Value is required" }, 400);
  }

  const supabase = getServiceSupabase();

  // Get playbook id
  const { data: playbook } = await supabase
    .from("playbooks")
    .select("id")
    .eq("guid", guid)
    .single();

  if (!playbook) {
    return c.json({ error: "Playbook not found" }, 404);
  }

  // Upsert memory
  const { data, error } = await supabase
    .from("memories")
    .upsert({
      playbook_id: playbook.id,
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

// DELETE /api/playbooks/:guid/memory/:key - Delete memory (requires API key or owner)
app.delete("/playbooks/:guid/memory/:key", async (c) => {
  const guid = c.req.param("guid");
  const key = c.req.param("key");

  // Check API key first
  const apiKeyData = await validateApiKey(c, "memory:write");
  if (apiKeyData) {
    if (apiKeyData.playbooks.guid !== guid) {
      return c.json({ error: "API key does not match playbook" }, 403);
    }
  } else {
    const user = await requireAuth(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    
    const playbook = await getPlaybookByGuid(guid, user.id);
    if (!playbook || playbook.user_id !== user.id) {
      return c.json({ error: "Forbidden" }, 403);
    }
  }

  const supabase = getServiceSupabase();

  // Get playbook id
  const { data: playbook } = await supabase
    .from("playbooks")
    .select("id")
    .eq("guid", guid)
    .single();

  if (!playbook) {
    return c.json({ error: "Playbook not found" }, 404);
  }

  const { error } = await supabase
    .from("memories")
    .delete()
    .eq("playbook_id", playbook.id)
    .eq("key", key);

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ success: true });
});

// ============================================
// API KEYS MANAGEMENT (authenticated owner only)
// ============================================

// GET /api/playbooks/:id/api-keys - List API keys for playbook
app.get("/playbooks/:id/api-keys", async (c) => {
  const user = await requireAuth(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const playbookId = c.req.param("id");
  
  if (!(await checkPlaybookOwnership(user.id, playbookId))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from("api_keys")
    .select("id, key_prefix, name, permissions, last_used_at, expires_at, is_active, created_at")
    .eq("playbook_id", playbookId)
    .order("created_at", { ascending: false });

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json(data || []);
});

// POST /api/playbooks/:id/api-keys - Create new API key (returns plain key ONCE)
app.post("/playbooks/:id/api-keys", async (c) => {
  const user = await requireAuth(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const playbookId = c.req.param("id");
  
  if (!(await checkPlaybookOwnership(user.id, playbookId))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const { name, permissions, expires_at } = body;

  // Generate the API key
  const plainKey = generateApiKey();
  const keyHash = await hashApiKey(plainKey);
  const keyPrefix = getKeyPrefix(plainKey);

  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      playbook_id: playbookId,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      name: name || null,
      permissions: permissions || ["memory:read", "memory:write"],
      expires_at: expires_at || null,
      is_active: true,
    })
    .select("id, key_prefix, name, permissions, expires_at, is_active, created_at")
    .single();

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  // Return the plain key ONLY ONCE - it cannot be retrieved later!
  return c.json({
    ...data,
    key: plainKey,
    warning: "Save this key now! It will not be shown again.",
  }, 201);
});

// DELETE /api/playbooks/:id/api-keys/:kid - Revoke API key
app.delete("/playbooks/:id/api-keys/:kid", async (c) => {
  const user = await requireAuth(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const playbookId = c.req.param("id");
  const keyId = c.req.param("kid");
  
  if (!(await checkPlaybookOwnership(user.id, playbookId))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const supabase = getServiceSupabase();

  const { error } = await supabase
    .from("api_keys")
    .delete()
    .eq("id", keyId)
    .eq("playbook_id", playbookId);

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ success: true });
});

// ============================================
// AGENT ENDPOINTS (legacy - API key required)
// Kept for backward compatibility
// ============================================

// GET /api/agent/:guid/memory
app.get("/agent/:guid/memory", async (c) => {
  const guid = c.req.param("guid");
  const key = c.req.query("key");
  const supabase = getServiceSupabase();

  // Get playbook (public access only for this legacy endpoint)
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

  if (key && data?.length) {
    return c.json(data[0]);
  }

  return c.json(data || []);
});

// POST /api/agent/:guid/memory
app.post("/agent/:guid/memory", async (c) => {
  const guid = c.req.param("guid");
  
  const apiKeyData = await validateApiKey(c, "memory:write");
  if (!apiKeyData) {
    return c.json({ error: "Invalid or missing API key" }, 401);
  }

  if (apiKeyData.playbooks.guid !== guid) {
    return c.json({ error: "API key does not match playbook" }, 403);
  }

  const body = await c.req.json();
  const { key, value } = body;

  if (!key || value === undefined) {
    return c.json({ error: "Missing key or value" }, 400);
  }

  const supabase = getServiceSupabase();

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

// Agent endpoints for skills and personas
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
// PUBLIC PLAYBOOKS ENDPOINTS
// ============================================

// GET /api/public/playbooks - List public playbooks with star counts
app.get("/public/playbooks", async (c) => {
  const search = c.req.query("search");
  const sort = c.req.query("sort") || "stars"; // stars, newest, name
  const limit = parseInt(c.req.query("limit") || "50");
  const supabase = getServiceSupabase();

  let query = supabase
    .from("playbooks")
    .select(`
      id, guid, name, description, config, star_count, tags, created_at, updated_at, user_id,
      personas:personas(count),
      skills:skills(count),
      mcp_servers:mcp_servers(count)
    `)
    .eq("is_public", true);

  if (search) {
    query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
  }

  switch (sort) {
    case "newest":
      query = query.order("created_at", { ascending: false });
      break;
    case "name":
      query = query.order("name", { ascending: true });
      break;
    case "stars":
    default:
      query = query.order("star_count", { ascending: false, nullsFirst: false });
      break;
  }

  const { data, error } = await query.limit(limit);

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  // Transform count objects to numbers with consistent naming
  const playbooks = (data || []).map((p: any) => ({
    ...p,
    personas_count: p.personas?.[0]?.count || 0,
    skills_count: p.skills?.[0]?.count || 0,
    mcp_servers_count: p.mcp_servers?.[0]?.count || 0,
    tags: p.tags || [],
    personas: undefined,
    skills: undefined,
    mcp_servers: undefined,
  }));

  return c.json(playbooks);
});

// GET /api/playbooks/:id/star - Check if user starred the playbook
app.get("/playbooks/:id/star", async (c) => {
  const user = await getAuthenticatedUser(c);
  if (!user) {
    return c.json({ starred: false });
  }

  const playbookId = c.req.param("id");
  const supabase = getServiceSupabase();

  const { data } = await supabase
    .from("playbook_stars")
    .select("id")
    .eq("playbook_id", playbookId)
    .eq("user_id", user.id)
    .single();

  return c.json({ starred: !!data });
});

// POST /api/playbooks/:id/star - Star or unstar a playbook
app.post("/playbooks/:id/star", async (c) => {
  const user = await requireAuth(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const playbookId = c.req.param("id");
  const supabase = getServiceSupabase();

  // Check if playbook exists and is public
  const { data: playbook } = await supabase
    .from("playbooks")
    .select("id, is_public")
    .eq("id", playbookId)
    .single();

  if (!playbook) {
    return c.json({ error: "Playbook not found" }, 404);
  }

  if (!playbook.is_public) {
    return c.json({ error: "Cannot star private playbooks" }, 403);
  }

  // Check if already starred
  const { data: existingStar } = await supabase
    .from("playbook_stars")
    .select("id")
    .eq("playbook_id", playbookId)
    .eq("user_id", user.id)
    .single();

  if (existingStar) {
    // Unstar
    const { error } = await supabase
      .from("playbook_stars")
      .delete()
      .eq("id", existingStar.id);

    if (error) {
      return c.json({ error: error.message }, 500);
    }

    return c.json({ starred: false, message: "Playbook unstarred" });
  } else {
    // Star
    const { error } = await supabase
      .from("playbook_stars")
      .insert({
        playbook_id: playbookId,
        user_id: user.id,
      });

    if (error) {
      return c.json({ error: error.message }, 500);
    }

    return c.json({ starred: true, message: "Playbook starred" });
  }
});

// GET /api/user/starred - Get user's starred playbooks
app.get("/user/starred", async (c) => {
  const user = await requireAuth(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from("playbook_stars")
    .select(`
      playbook_id,
      playbooks:playbook_id(
        id, guid, name, description, star_count, created_at, updated_at
      )
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  const playbooks = (data || []).map((s: any) => s.playbooks).filter(Boolean);
  return c.json(playbooks);
});

// ============================================
// PUBLIC REPOSITORY ENDPOINTS (Skills & MCP from public playbooks)
// ============================================

// GET /api/public/skills - Get skills from all public playbooks (marketplace)
app.get("/public/skills", async (c) => {
  const search = c.req.query("search");
  const supabase = getSupabase();

  // Get skills from public playbooks
  let query = supabase
    .from("skills")
    .select(`
      *,
      playbook:playbooks!inner(id, guid, name, is_public, user_id)
    `)
    .eq("playbook.is_public", true)
    .order("created_at", { ascending: false });

  if (search) {
    query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
  }

  const { data, error } = await query.limit(50);

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  // Transform to include playbook info
  const skills = (data || []).map((s: any) => ({
    ...s,
    playbook_guid: s.playbook?.guid,
    playbook_name: s.playbook?.name,
    playbook: undefined // Remove nested object
  }));

  return c.json(skills);
});

// GET /api/public/skills/:id
app.get("/public/skills/:id", async (c) => {
  const id = c.req.param("id");
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("skills")
    .select(`
      *,
      playbook:playbooks!inner(id, guid, name, is_public)
    `)
    .eq("id", id)
    .eq("playbook.is_public", true)
    .single();

  if (error || !data) {
    return c.json({ error: "Skill not found" }, 404);
  }

  return c.json({
    ...data,
    playbook_guid: (data as any).playbook?.guid,
    playbook_name: (data as any).playbook?.name,
    playbook: undefined
  });
});

// GET /api/public/mcp - Get MCP servers from all public playbooks (marketplace)
app.get("/public/mcp", async (c) => {
  const search = c.req.query("search");
  const supabase = getSupabase();

  let query = supabase
    .from("mcp_servers")
    .select(`
      *,
      playbook:playbooks!inner(id, guid, name, is_public, user_id)
    `)
    .eq("playbook.is_public", true)
    .order("created_at", { ascending: false });

  if (search) {
    query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
  }

  const { data, error } = await query.limit(50);

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  // Transform to include playbook info
  const servers = (data || []).map((m: any) => ({
    ...m,
    playbook_guid: m.playbook?.guid,
    playbook_name: m.playbook?.name,
    playbook: undefined
  }));

  return c.json(servers);
});

// GET /api/public/mcp/:id
app.get("/public/mcp/:id", async (c) => {
  const id = c.req.param("id");
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("mcp_servers")
    .select(`
      *,
      playbook:playbooks!inner(id, guid, name, is_public)
    `)
    .eq("id", id)
    .eq("playbook.is_public", true)
    .single();

  if (error || !data) {
    return c.json({ error: "MCP Server not found" }, 404);
  }

  return c.json({
    ...data,
    playbook_guid: (data as any).playbook?.guid,
    playbook_name: (data as any).playbook?.name,
    playbook: undefined
  });
});

// ============================================
// FORMAT HELPERS
// ============================================

function formatAsOpenAPI(playbook: any) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://agentplaybooks.ai";
  
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
    servers: [{ url: `${baseUrl}/api` }],
    paths: {
      [`/playbooks/${playbook.guid}/memory`]: {
        get: {
          summary: "Get memories",
          operationId: "getMemories",
          parameters: [
            {
              name: "key",
              in: "query",
              required: false,
              schema: { type: "string" },
              description: "Optional specific key to retrieve",
            },
          ],
          responses: { "200": { description: "Success" } },
        },
      },
      [`/playbooks/${playbook.guid}/memory/{key}`]: {
        put: {
          summary: "Write memory",
          operationId: "writeMemory",
          parameters: [
            {
              name: "key",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    value: { type: "object" },
                  },
                  required: ["value"],
                },
              },
            },
          },
          responses: { "200": { description: "Success" } },
          security: [{ apiKey: [] }],
        },
        delete: {
          summary: "Delete memory",
          operationId: "deleteMemory",
          parameters: [
            {
              name: "key",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: { "200": { description: "Success" } },
          security: [{ apiKey: [] }],
        },
      },
    },
    components: {
      securitySchemes: {
        apiKey: {
          type: "http",
          scheme: "bearer",
          description: "API key starting with apb_live_",
        },
      },
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

function formatAsAnthropic(playbook: any) {
  // Anthropic tool format
  const tools = playbook.skills.map((skill: any) => ({
    name: skill.name.toLowerCase().replace(/\s+/g, "_"),
    description: skill.description || skill.name,
    input_schema: skill.definition?.parameters || { type: "object", properties: {} },
  }));

  return {
    playbook: {
      name: playbook.name,
      description: playbook.description,
      guid: playbook.guid,
    },
    system_prompt: playbook.personas.length > 0 
      ? playbook.personas.map((p: any) => `## ${p.name}\n\n${p.system_prompt}`).join("\n\n---\n\n")
      : null,
    tools,
    mcp_servers: playbook.mcp_servers.map((mcp: any) => ({
      name: mcp.name,
      description: mcp.description,
      tools: mcp.tools,
      resources: mcp.resources,
    })),
  };
}

function formatAsMarkdown(playbook: any): string {
  let md = `# ${playbook.name}\n\n`;
  
  if (playbook.description) {
    md += `${playbook.description}\n\n`;
  }

  md += `**GUID:** \`${playbook.guid}\`\n\n`;

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
      if (skill.definition?.parameters) {
        md += `**Parameters:**\n\`\`\`json\n${JSON.stringify(skill.definition.parameters, null, 2)}\n\`\`\`\n\n`;
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
  md += `## API Endpoints\n\n`;
  md += `- **JSON:** \`GET /api/playbooks/${playbook.guid}\`\n`;
  md += `- **OpenAPI:** \`GET /api/playbooks/${playbook.guid}?format=openapi\`\n`;
  md += `- **MCP:** \`GET /api/playbooks/${playbook.guid}?format=mcp\`\n`;
  md += `- **Anthropic:** \`GET /api/playbooks/${playbook.guid}?format=anthropic\`\n`;
  md += `- **Markdown:** \`GET /api/playbooks/${playbook.guid}?format=markdown\`\n`;

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
