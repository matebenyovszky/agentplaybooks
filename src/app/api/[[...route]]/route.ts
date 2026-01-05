import { Hono } from "hono";
import type { Context } from "hono";
import { handle } from "hono/vercel";
import { cors } from "hono/cors";
import { createServerClient } from "@/lib/supabase/client";
import type { ApiKey, UserApiKeysRow, Playbook, Skill, MCPServer, ProfilesRow, Persona } from "@/lib/supabase/types";
import { ATTACHMENT_LIMITS, ALLOWED_FILE_TYPES } from "@/lib/supabase/types";
import { 
  validateAttachment, 
  validateFilename, 
  validateContent 
} from "@/lib/attachment-validator";
import { hashApiKey, generateApiKey, generateGuid, getKeyPrefix } from "@/lib/utils";
import { cookies } from "next/headers";

// User API Key with user_id
type UserApiKeyData = UserApiKeysRow & { user_id: string };

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

type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>;

type PersonaSource = Pick<
  Playbook,
  "id" | "persona_name" | "persona_system_prompt" | "persona_metadata" | "created_at"
>;

type PlaybookWithCounts = Playbook & {
  skills?: Array<{ count: number }>;
  mcp_servers?: Array<{ count: number }>;
};

type ProfileSummary = Pick<
  ProfilesRow,
  "id" | "display_name" | "avatar_svg" | "website_url" | "is_verified" | "is_virtual"
>;

type SkillWithPlaybookAccess = Skill & { playbooks?: { is_public?: boolean; user_id?: string } };
type SkillWithPlaybookOwner = Skill & { playbooks?: { user_id?: string } };
type SkillWithPlaybook = Skill & {
  playbook?: { id?: string; guid?: string; name?: string; is_public?: boolean; user_id?: string };
};

type MCPServerWithPlaybook = MCPServer & {
  playbook?: { id?: string; guid?: string; name?: string; is_public?: boolean; user_id?: string };
};

type PlaybookWithExports = Playbook & {
  persona?: Persona | null;
  personas?: Persona[];
  skills: Skill[];
  mcp_servers: MCPServer[];
};

type OpenApiSkillSchema = {
  type: "object";
  description?: string;
  properties?: Record<string, unknown>;
  required?: string[];
};

type StarredPlaybookRow = { playbooks?: Playbook | null };

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
async function getAuthenticatedUser(c: AppContext): Promise<{ id: string } | null> {
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
async function requireAuth(c: AppContext): Promise<{ id: string } | null> {
  const user = await getAuthenticatedUser(c);
  if (!user) {
    return null;
  }
  return user;
}

// Helper: Validate API key for agent endpoints
async function validateApiKey(c: AppContext, requiredPermission: string): Promise<ApiKeyWithPlaybook | null> {
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

// Helper: 1 Playbook = 1 Persona (persona stored on playbooks table)
function playbookToPersona(playbook: PersonaSource): Persona {
  return {
    id: playbook.id,
    playbook_id: playbook.id,
    name: playbook.persona_name || "Assistant",
    system_prompt: playbook.persona_system_prompt || "You are a helpful AI assistant.",
    metadata: playbook.persona_metadata ?? {},
    created_at: playbook.created_at,
  };
}

// Helper: Validate User-level API key (works across all user's playbooks)
async function validateUserApiKey(c: AppContext, requiredPermission: string): Promise<UserApiKeyData | null> {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer apb_")) {
    return null;
  }

  const apiKey = authHeader.replace("Bearer ", "");
  const keyHash = await hashApiKey(apiKey);
  const supabase = getServiceSupabase();

  // First try user_api_keys table
  const { data: userKeyData } = await supabase
    .from("user_api_keys")
    .select("*")
    .eq("key_hash", keyHash)
    .eq("is_active", true)
    .single();

  if (!userKeyData) {
    return null;
  }

  // Check expiration
  if (userKeyData.expires_at && new Date(userKeyData.expires_at) < new Date()) {
    return null;
  }

  // Check permission
  if (!userKeyData.permissions.includes(requiredPermission) && !userKeyData.permissions.includes("full")) {
    return null;
  }

  // Update last_used_at
  await supabase
    .from("user_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", userKeyData.id);

  return userKeyData as UserApiKeyData;
}

// Helper: Get user from either JWT auth or User API key
async function getUserFromAuthOrApiKey(c: AppContext, requiredPermission: string): Promise<{ id: string } | null> {
  // Try JWT auth first
  const user = await getAuthenticatedUser(c);
  if (user) {
    return user;
  }
  
  // Try User API key
  const userApiKey = await validateUserApiKey(c, requiredPermission);
  if (userApiKey) {
    return { id: userApiKey.user_id };
  }
  
  return null;
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
      skills:skills(count),
      mcp_servers:mcp_servers(count)
    `)
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  // Transform count objects to numbers
  const playbookRows: PlaybookWithCounts[] = data || [];
  const playbooks = playbookRows.map((p) => ({
    ...p,
    persona_count: p.persona_name ? 1 : 0,
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
  const query = supabase
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
  const [skills, mcpServers] = await Promise.all([
    supabase.from("skills").select("*").eq("playbook_id", playbook.id),
    supabase.from("mcp_servers").select("*").eq("playbook_id", playbook.id),
  ]);

  const persona = playbookToPersona(playbook);

  const fullPlaybook = {
    ...playbook,
    // New: singular persona for clarity
    persona,
    // Backward-compatible: personas array shape
    personas: [persona],
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

  const updateData: Record<string, unknown> = {};
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

// GET /api/playbooks/:id/personas - List personas (supports both UUID and GUID)
app.get("/playbooks/:id/personas", async (c) => {
  const user = await getAuthenticatedUser(c);
  const idOrGuid = c.req.param("id");
  const supabase = getServiceSupabase();

  // Check if it's a UUID or GUID
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrGuid);

  // Find playbook by ID or GUID
  let query = supabase
    .from("playbooks")
    .select("id, user_id, is_public, created_at, persona_name, persona_system_prompt, persona_metadata");
  
  if (isUuid) {
    query = query.eq("id", idOrGuid);
  } else {
    query = query.eq("guid", idOrGuid);
  }

  const { data: playbook } = await query.single();

  if (!playbook) {
    return c.json({ error: "Playbook not found" }, 404);
  }

  // Must be public or owned
  if (!playbook.is_public && (!user || playbook.user_id !== user.id)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  // 1 playbook = 1 persona (singleton)
  return c.json([playbookToPersona(playbook)]);
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
    .from("playbooks")
    .update({
      persona_name: name,
      persona_system_prompt: system_prompt,
      persona_metadata: metadata || {},
    })
    .eq("id", playbookId)
    .eq("user_id", user.id)
    .select("id, created_at, persona_name, persona_system_prompt, persona_metadata")
    .single();

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json(playbookToPersona(data), 201);
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
  // Persona is a singleton; we use playbookId as personaId
  if (personaId !== playbookId) {
    return c.json({ error: "Persona not found" }, 404);
  }

  const body = await c.req.json();
  const { name, system_prompt, metadata } = body;

  const supabase = getServiceSupabase();

  const updateData: Record<string, unknown> = {};
  if (name !== undefined) updateData.persona_name = name;
  if (system_prompt !== undefined) updateData.persona_system_prompt = system_prompt;
  if (metadata !== undefined) updateData.persona_metadata = metadata;

  const { data, error } = await supabase
    .from("playbooks")
    .update(updateData)
    .eq("id", playbookId)
    .eq("user_id", user.id)
    .select("id, created_at, persona_name, persona_system_prompt, persona_metadata")
    .single();

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json(playbookToPersona(data));
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
  if (personaId !== playbookId) {
    return c.json({ error: "Persona not found" }, 404);
  }

  const supabase = getServiceSupabase();

  const { error } = await supabase
    .from("playbooks")
    .update({
      persona_name: "Assistant",
      persona_system_prompt: "You are a helpful AI assistant.",
      persona_metadata: {},
    })
    .eq("id", playbookId)
    .eq("user_id", user.id);

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ success: true });
});

// ============================================
// SKILLS CRUD (authenticated)
// ============================================

// GET /api/playbooks/:id/skills - List skills (supports both UUID and GUID)
app.get("/playbooks/:id/skills", async (c) => {
  const user = await getAuthenticatedUser(c);
  const idOrGuid = c.req.param("id");
  const supabase = getServiceSupabase();

  // Check if it's a UUID or GUID
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrGuid);

  // Find playbook by ID or GUID
  let query = supabase
    .from("playbooks")
    .select("id, user_id, is_public");
  
  if (isUuid) {
    query = query.eq("id", idOrGuid);
  } else {
    query = query.eq("guid", idOrGuid);
  }

  const { data: playbook } = await query.single();

  if (!playbook) {
    return c.json({ error: "Playbook not found" }, 404);
  }

  // Check access - public playbooks are readable by anyone, private only by owner
  if (!playbook.is_public && (!user || playbook.user_id !== user.id)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const { data, error } = await supabase
    .from("skills")
    .select("id, name, description, definition, examples, priority")
    .eq("playbook_id", playbook.id)
    .order("priority", { ascending: false });

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

  const updateData: Record<string, unknown> = {};
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

// GET /api/playbooks/:guid/memory - Read memory with search (public for public playbooks)
app.get("/playbooks/:guid/memory", async (c) => {
  const guid = c.req.param("guid");
  const key = c.req.query("key");
  const search = c.req.query("search");
  const tagsParam = c.req.query("tags");
  const user = await getAuthenticatedUser(c);
  
  const playbook = await getPlaybookByGuid(guid, user?.id || null);
  if (!playbook) {
    return c.json({ error: "Playbook not found" }, 404);
  }

  const supabase = getServiceSupabase();

  // If specific key requested, get it directly
  if (key) {
    const { data, error } = await supabase
      .from("memories")
      .select("key, value, tags, description, updated_at")
      .eq("playbook_id", playbook.id)
      .eq("key", key)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return c.json({ error: "Memory not found" }, 404);
      }
      return c.json({ error: error.message }, 500);
    }

    return c.json(data);
  }

  // Build query with optional filters
  let query = supabase
    .from("memories")
    .select("key, value, tags, description, updated_at")
    .eq("playbook_id", playbook.id);

  // Search in key and description using ilike
  if (search) {
    query = query.or(`key.ilike.%${search}%,description.ilike.%${search}%`);
  }

  // Filter by tags (any match)
  if (tagsParam) {
    const tags = tagsParam.split(",").map(t => t.trim()).filter(Boolean);
    if (tags.length > 0) {
      query = query.overlaps("tags", tags);
    }
  }

  const { data, error } = await query.order("updated_at", { ascending: false });

  if (error) {
    return c.json({ error: error.message }, 500);
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
  const { value, tags, description } = body;

  if (value === undefined) {
    return c.json({ error: "Value is required" }, 400);
  }

  // Validate tags if provided
  if (tags !== undefined && !Array.isArray(tags)) {
    return c.json({ error: "Tags must be an array of strings" }, 400);
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

  // Build upsert data
  const upsertData: Record<string, unknown> = {
    playbook_id: playbook.id,
    key,
    value,
    updated_at: new Date().toISOString(),
  };

  // Include tags if provided
  if (tags !== undefined) {
    upsertData.tags = tags;
  }

  // Include description if provided
  if (description !== undefined) {
    upsertData.description = description;
  }

  // Upsert memory
  const { data, error } = await supabase
    .from("memories")
    .upsert(upsertData, {
      onConflict: "playbook_id,key",
    })
    .select("key, value, tags, description, updated_at")
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
// PUBLIC SKILLS & PERSONAS ENDPOINTS (read-only for public playbooks)
// ============================================

// NOTE: GET /api/playbooks/:guid/skills is handled by the :id route above (supports both UUID and GUID)

// NOTE: GET /api/playbooks/:guid/skills/:skillId is handled by the :id route in SKILLS CRUD section

// NOTE: GET /api/playbooks/:guid/personas is handled by the :id route in PERSONAS CRUD section

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
// USER PROFILE MANAGEMENT
// ============================================

// GET /api/user/profile - Get current user's profile
app.get("/user/profile", async (c) => {
  const user = await requireAuth(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error && error.code !== "PGRST116") {
    return c.json({ error: error.message }, 500);
  }

  // If no profile exists, return default
  if (!data) {
    return c.json({
      id: user.id,
      auth_user_id: user.id,
      display_name: "User",
      avatar_svg: null,
      website_url: null,
      description: null,
      is_verified: false,
      is_virtual: false,
    });
  }

  return c.json(data);
});

// PUT /api/user/profile - Update current user's profile
app.put("/user/profile", async (c) => {
  const user = await requireAuth(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json();
  const { display_name, avatar_svg, website_url, description } = body;

  // Validate avatar_svg if provided (basic SVG check)
  if (avatar_svg && typeof avatar_svg === "string") {
    if (avatar_svg.length > 10000) {
      return c.json({ error: "Avatar SVG too large (max 10KB)" }, 400);
    }
    if (!avatar_svg.trim().startsWith("<svg") && !avatar_svg.startsWith("http")) {
      return c.json({ error: "Avatar must be SVG content or URL" }, 400);
    }
  }

  // Validate website_url if provided
  if (website_url && typeof website_url === "string") {
    try {
      new URL(website_url);
    } catch {
      return c.json({ error: "Invalid website URL" }, 400);
    }
  }

  const supabase = getServiceSupabase();

  // Upsert profile
  const { data, error } = await supabase
    .from("profiles")
    .upsert({
      id: user.id,
      auth_user_id: user.id,
      display_name: display_name || "User",
      avatar_svg: avatar_svg || null,
      website_url: website_url || null,
      description: description || null,
      is_verified: false,
      is_virtual: false,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" })
    .select()
    .single();

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json(data);
});

// GET /api/profiles/:id - Get any profile by ID (public)
app.get("/profiles/:id", async (c) => {
  const id = c.req.param("id");
  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_svg, website_url, description, is_verified, is_virtual, created_at")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return c.json({ error: "Profile not found" }, 404);
    }
    return c.json({ error: error.message }, 500);
  }

  return c.json(data);
});

// GET /api/profiles/:id/playbooks - Get public playbooks by a profile
app.get("/profiles/:id/playbooks", async (c) => {
  const id = c.req.param("id");
  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from("playbooks")
    .select(`
      id, guid, name, description, star_count, tags, created_at, persona_name,
      skills:skills(count),
      mcp_servers:mcp_servers(count)
    `)
    .eq("user_id", id)
    .eq("is_public", true)
    .order("star_count", { ascending: false });

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  const playbookRows: PlaybookWithCounts[] = data || [];
  const playbooks = playbookRows.map((p) => ({
    ...p,
    personas_count: p.persona_name ? 1 : 0,
    skills_count: p.skills?.[0]?.count || 0,
    mcp_servers_count: p.mcp_servers?.[0]?.count || 0,
    skills: undefined,
    mcp_servers: undefined,
  }));

  return c.json(playbooks);
});

// ============================================
// USER API KEYS MANAGEMENT
// ============================================

// GET /api/user/api-keys - List user's API keys
app.get("/user/api-keys", async (c) => {
  const user = await requireAuth(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from("user_api_keys")
    .select("id, key_prefix, name, permissions, last_used_at, expires_at, is_active, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json(data || []);
});

// POST /api/user/api-keys - Create new user API key (returns plain key ONCE)
app.post("/user/api-keys", async (c) => {
  const user = await requireAuth(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json().catch(() => ({}));
  const { name, permissions, expires_at } = body;

  // Generate the API key
  const plainKey = generateApiKey();
  const keyHash = await hashApiKey(plainKey);
  const keyPrefix = getKeyPrefix(plainKey);

  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from("user_api_keys")
    .insert({
      user_id: user.id,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      name: name || null,
      permissions: permissions || ["playbooks:read", "playbooks:write", "memory:read", "memory:write"],
      expires_at: expires_at || null,
      is_active: true,
    })
    .select("id, key_prefix, name, permissions, expires_at, is_active, created_at")
    .single();

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({
    ...data,
    key: plainKey,
    warning: "Save this key now! It will not be shown again.",
  }, 201);
});

// DELETE /api/user/api-keys/:kid - Revoke user API key
app.delete("/user/api-keys/:kid", async (c) => {
  const user = await requireAuth(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const keyId = c.req.param("kid");
  const supabase = getServiceSupabase();

  const { error } = await supabase
    .from("user_api_keys")
    .delete()
    .eq("id", keyId)
    .eq("user_id", user.id);

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ success: true });
});

// ============================================
// MANAGEMENT API (User API Key supported)
// These endpoints can be called with User API key for AI automation
// ============================================

// GET /api/manage/playbooks - List user's playbooks (User API key supported)
app.get("/manage/playbooks", async (c) => {
  const user = await getUserFromAuthOrApiKey(c, "playbooks:read");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const supabase = getServiceSupabase();
  
  const { data, error } = await supabase
    .from("playbooks")
    .select(`
      *,
      skills:skills(count),
      mcp_servers:mcp_servers(count)
    `)
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  const playbookRows: PlaybookWithCounts[] = data || [];
  const playbooks = playbookRows.map((p) => ({
    ...p,
    persona_count: p.persona_name ? 1 : 0,
    skill_count: p.skills?.[0]?.count || 0,
    mcp_server_count: p.mcp_servers?.[0]?.count || 0,
    skills: undefined,
    mcp_servers: undefined,
  }));

  return c.json(playbooks);
});

// POST /api/manage/playbooks - Create playbook (User API key supported)
app.post("/manage/playbooks", async (c) => {
  const user = await getUserFromAuthOrApiKey(c, "playbooks:write");
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

// GET /api/manage/playbooks/:id - Get playbook details (User API key supported)
app.get("/manage/playbooks/:id", async (c) => {
  const user = await getUserFromAuthOrApiKey(c, "playbooks:read");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const playbookId = c.req.param("id");
  const supabase = getServiceSupabase();

  const { data: playbook, error } = await supabase
    .from("playbooks")
    .select("*")
    .eq("id", playbookId)
    .eq("user_id", user.id)
    .single();

  if (error || !playbook) {
    return c.json({ error: "Playbook not found" }, 404);
  }

  // Get related data
  const [skills, mcpServers] = await Promise.all([
    supabase.from("skills").select("*").eq("playbook_id", playbook.id),
    supabase.from("mcp_servers").select("*").eq("playbook_id", playbook.id),
  ]);

  const persona = playbookToPersona(playbook);

  return c.json({
    ...playbook,
    persona,
    personas: [persona], // backward-compatible shape
    skills: skills.data || [],
    mcp_servers: mcpServers.data || [],
  });
});

// PUT /api/manage/playbooks/:id - Update playbook (User API key supported)
app.put("/manage/playbooks/:id", async (c) => {
  const user = await getUserFromAuthOrApiKey(c, "playbooks:write");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const playbookId = c.req.param("id");
  
  if (!(await checkPlaybookOwnership(user.id, playbookId))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json();
  const { name, description, is_public, config } = body;

  const supabase = getServiceSupabase();

  const updateData: Record<string, unknown> = {};
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

// DELETE /api/manage/playbooks/:id - Delete playbook (User API key supported)
app.delete("/manage/playbooks/:id", async (c) => {
  const user = await getUserFromAuthOrApiKey(c, "playbooks:write");
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

// POST /api/manage/playbooks/:id/personas - Add persona (User API key supported)
app.post("/manage/playbooks/:id/personas", async (c) => {
  const user = await getUserFromAuthOrApiKey(c, "personas:write");
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
    .from("playbooks")
    .update({
      persona_name: name,
      persona_system_prompt: system_prompt,
      persona_metadata: metadata || {},
    })
    .eq("id", playbookId)
    .eq("user_id", user.id)
    .select("id, created_at, persona_name, persona_system_prompt, persona_metadata")
    .single();

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json(playbookToPersona(data), 201);
});

// PUT /api/manage/playbooks/:id/personas/:pid - Update persona (User API key supported)
app.put("/manage/playbooks/:id/personas/:pid", async (c) => {
  const user = await getUserFromAuthOrApiKey(c, "personas:write");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const playbookId = c.req.param("id");
  const personaId = c.req.param("pid");
  
  if (!(await checkPlaybookOwnership(user.id, playbookId))) {
    return c.json({ error: "Forbidden" }, 403);
  }
  if (personaId !== playbookId) {
    return c.json({ error: "Persona not found" }, 404);
  }

  const body = await c.req.json();
  const supabase = getServiceSupabase();

  const updateData: Record<string, unknown> = {};
  if (body.name !== undefined) updateData.persona_name = body.name;
  if (body.system_prompt !== undefined) updateData.persona_system_prompt = body.system_prompt;
  if (body.metadata !== undefined) updateData.persona_metadata = body.metadata;

  const { data, error } = await supabase
    .from("playbooks")
    .update(updateData)
    .eq("id", playbookId)
    .eq("user_id", user.id)
    .select("id, created_at, persona_name, persona_system_prompt, persona_metadata")
    .single();

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json(playbookToPersona(data));
});

// DELETE /api/manage/playbooks/:id/personas/:pid - Delete persona (User API key supported)
app.delete("/manage/playbooks/:id/personas/:pid", async (c) => {
  const user = await getUserFromAuthOrApiKey(c, "personas:write");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const playbookId = c.req.param("id");
  const personaId = c.req.param("pid");
  
  if (!(await checkPlaybookOwnership(user.id, playbookId))) {
    return c.json({ error: "Forbidden" }, 403);
  }
  if (personaId !== playbookId) {
    return c.json({ error: "Persona not found" }, 404);
  }

  const supabase = getServiceSupabase();

  const { error } = await supabase
    .from("playbooks")
    .update({
      persona_name: "Assistant",
      persona_system_prompt: "You are a helpful AI assistant.",
      persona_metadata: {},
    })
    .eq("id", playbookId)
    .eq("user_id", user.id);

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ success: true });
});

// POST /api/manage/playbooks/:id/skills - Add skill (User API key supported)
app.post("/manage/playbooks/:id/skills", async (c) => {
  const user = await getUserFromAuthOrApiKey(c, "skills:write");
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

// PUT /api/manage/playbooks/:id/skills/:sid - Update skill (User API key supported)
app.put("/manage/playbooks/:id/skills/:sid", async (c) => {
  const user = await getUserFromAuthOrApiKey(c, "skills:write");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const playbookId = c.req.param("id");
  const skillId = c.req.param("sid");
  
  if (!(await checkPlaybookOwnership(user.id, playbookId))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json();
  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from("skills")
    .update(body)
    .eq("id", skillId)
    .eq("playbook_id", playbookId)
    .select()
    .single();

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json(data);
});

// DELETE /api/manage/playbooks/:id/skills/:sid - Delete skill (User API key supported)
app.delete("/manage/playbooks/:id/skills/:sid", async (c) => {
  const user = await getUserFromAuthOrApiKey(c, "skills:write");
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
// SKILL ATTACHMENTS API
// ============================================

// GET /api/manage/skills/:skillId/attachments - List attachments for a skill
app.get("/manage/skills/:skillId/attachments", async (c) => {
  const skillId = c.req.param("skillId");
  const supabase = getServiceSupabase();

  // First check if skill exists and is accessible
  const { data, error: skillError } = await supabase
    .from("skills")
    .select("id, playbook_id, playbooks!inner(is_public, user_id)")
    .eq("id", skillId)
    .single();

  const skill = data as SkillWithPlaybookAccess | null;

  if (skillError || !skill) {
    return c.json({ error: "Skill not found" }, 404);
  }

  // Check if public or owned
  const user = await getAuthenticatedUser(c);
  const isPublic = skill.playbooks?.is_public;
  const isOwner = user && skill.playbooks?.user_id === user.id;

  if (!isPublic && !isOwner) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const { data, error } = await supabase
    .from("skill_attachments")
    .select("id, filename, file_type, language, description, size_bytes, created_at, updated_at")
    .eq("skill_id", skillId)
    .order("created_at", { ascending: true });

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json(data || []);
});

// GET /api/manage/skills/:skillId/attachments/:attachmentId - Get attachment content
app.get("/manage/skills/:skillId/attachments/:attachmentId", async (c) => {
  const skillId = c.req.param("skillId");
  const attachmentId = c.req.param("attachmentId");
  const supabase = getServiceSupabase();

  // Check skill access
  const { data } = await supabase
    .from("skills")
    .select("id, playbook_id, playbooks!inner(is_public, user_id)")
    .eq("id", skillId)
    .single();

  const skill = data as SkillWithPlaybookAccess | null;

  if (!skill) {
    return c.json({ error: "Skill not found" }, 404);
  }

  const user = await getAuthenticatedUser(c);
  const isPublic = skill.playbooks?.is_public;
  const isOwner = user && skill.playbooks?.user_id === user.id;

  if (!isPublic && !isOwner) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const { data, error } = await supabase
    .from("skill_attachments")
    .select("*")
    .eq("id", attachmentId)
    .eq("skill_id", skillId)
    .single();

  if (error || !data) {
    return c.json({ error: "Attachment not found" }, 404);
  }

  // Option to get raw content
  const raw = c.req.query("raw") === "true";
  if (raw) {
    return new Response(data.content, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `inline; filename="${data.filename}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  return c.json(data);
});

// POST /api/manage/skills/:skillId/attachments - Upload attachment
app.post("/manage/skills/:skillId/attachments", async (c) => {
  const user = await getUserFromAuthOrApiKey(c, "skills:write");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const skillId = c.req.param("skillId");
  const supabase = getServiceSupabase();

  // Check skill ownership
  const { data } = await supabase
    .from("skills")
    .select("id, playbook_id, playbooks!inner(user_id)")
    .eq("id", skillId)
    .single();

  const skill = data as SkillWithPlaybookOwner | null;

  if (!skill) {
    return c.json({ error: "Skill not found" }, 404);
  }

  if (skill.playbooks?.user_id !== user.id) {
    return c.json({ error: "Forbidden" }, 403);
  }

  // Check attachment count limit
  const { count } = await supabase
    .from("skill_attachments")
    .select("id", { count: "exact", head: true })
    .eq("skill_id", skillId);

  if ((count || 0) >= ATTACHMENT_LIMITS.MAX_FILES_PER_SKILL) {
    return c.json({ 
      error: `Maximum ${ATTACHMENT_LIMITS.MAX_FILES_PER_SKILL} attachments per skill` 
    }, 400);
  }

  const body = await c.req.json();
  const { filename, content, file_type, language, description } = body;

  if (!filename || !content) {
    return c.json({ error: "filename and content are required" }, 400);
  }

  // Validate attachment
  const validation = validateAttachment(filename, content, file_type);
  if (!validation.valid) {
    return c.json({ error: validation.errors.join(", ") }, 400);
  }

  // Calculate size
  const sizeBytes = new TextEncoder().encode(content).length;

  const { data, error } = await supabase
    .from("skill_attachments")
    .insert({
      skill_id: skillId,
      filename: validation.sanitizedFilename || filename,
      file_type: validation.detectedType || file_type,
      language: language || null,
      description: description || null,
      content,
      size_bytes: sizeBytes,
    })
    .select()
    .single();

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json(data, 201);
});

// PUT /api/manage/skills/:skillId/attachments/:attachmentId - Update attachment
app.put("/manage/skills/:skillId/attachments/:attachmentId", async (c) => {
  const user = await getUserFromAuthOrApiKey(c, "skills:write");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const skillId = c.req.param("skillId");
  const attachmentId = c.req.param("attachmentId");
  const supabase = getServiceSupabase();

  // Check skill ownership
  const { data } = await supabase
    .from("skills")
    .select("id, playbook_id, playbooks!inner(user_id)")
    .eq("id", skillId)
    .single();

  const skill = data as SkillWithPlaybookOwner | null;

  if (!skill || skill.playbooks?.user_id !== user.id) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json();
  const updates: Record<string, unknown> = {};

  // Validate filename if provided
  if (body.filename) {
    const filenameValidation = validateFilename(body.filename);
    if (!filenameValidation.valid) {
      return c.json({ error: filenameValidation.errors.join(", ") }, 400);
    }
    updates.filename = filenameValidation.sanitizedFilename;
  }

  // Validate content if provided
  if (body.content) {
    const contentValidation = validateContent(body.content);
    if (!contentValidation.valid) {
      return c.json({ error: contentValidation.errors.join(", ") }, 400);
    }
    updates.content = body.content;
    updates.size_bytes = new TextEncoder().encode(body.content).length;
  }

  // Optional fields
  if (body.file_type && ALLOWED_FILE_TYPES.includes(body.file_type)) {
    updates.file_type = body.file_type;
  }
  if (body.language !== undefined) updates.language = body.language;
  if (body.description !== undefined) updates.description = body.description;

  const { data, error } = await supabase
    .from("skill_attachments")
    .update(updates)
    .eq("id", attachmentId)
    .eq("skill_id", skillId)
    .select()
    .single();

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json(data);
});

// DELETE /api/manage/skills/:skillId/attachments/:attachmentId - Delete attachment
app.delete("/manage/skills/:skillId/attachments/:attachmentId", async (c) => {
  const user = await getUserFromAuthOrApiKey(c, "skills:write");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const skillId = c.req.param("skillId");
  const attachmentId = c.req.param("attachmentId");
  const supabase = getServiceSupabase();

  // Check skill ownership
  const { data } = await supabase
    .from("skills")
    .select("id, playbook_id, playbooks!inner(user_id)")
    .eq("id", skillId)
    .single();

  const skill = data as SkillWithPlaybookOwner | null;

  if (!skill || skill.playbooks?.user_id !== user.id) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const { error } = await supabase
    .from("skill_attachments")
    .delete()
    .eq("id", attachmentId)
    .eq("skill_id", skillId);

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ success: true });
});

// ============================================
// MEMORY MANAGEMENT (via Management API)
// ============================================

// GET /api/manage/playbooks/:id/memory - List/search memories
app.get("/manage/playbooks/:id/memory", async (c) => {
  const user = await getUserFromAuthOrApiKey(c, "memory:read");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const playbookId = c.req.param("id");
  const search = c.req.query("search");
  const tagsParam = c.req.query("tags");
  const supabase = getServiceSupabase();

  // Check ownership
  const { data: playbook } = await supabase
    .from("playbooks")
    .select("id")
    .eq("id", playbookId)
    .eq("user_id", user.id)
    .single();

  if (!playbook) {
    return c.json({ error: "Playbook not found" }, 404);
  }

  // Build query with optional filters
  let query = supabase
    .from("memories")
    .select("key, value, tags, description, updated_at")
    .eq("playbook_id", playbookId);

  if (search) {
    query = query.or(`key.ilike.%${search}%,description.ilike.%${search}%`);
  }

  if (tagsParam) {
    const tags = tagsParam.split(",").map(t => t.trim()).filter(Boolean);
    if (tags.length > 0) {
      query = query.overlaps("tags", tags);
    }
  }

  const { data, error } = await query.order("updated_at", { ascending: false });

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json(data || []);
});

// GET /api/manage/playbooks/:id/memory/:key - Get specific memory
app.get("/manage/playbooks/:id/memory/:key", async (c) => {
  const user = await getUserFromAuthOrApiKey(c, "memory:read");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const playbookId = c.req.param("id");
  const key = c.req.param("key");
  const supabase = getServiceSupabase();

  // Check ownership
  const { data: playbook } = await supabase
    .from("playbooks")
    .select("id")
    .eq("id", playbookId)
    .eq("user_id", user.id)
    .single();

  if (!playbook) {
    return c.json({ error: "Playbook not found" }, 404);
  }

  const { data, error } = await supabase
    .from("memories")
    .select("key, value, tags, description, updated_at")
    .eq("playbook_id", playbookId)
    .eq("key", key)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return c.json({ error: "Memory not found" }, 404);
    }
    return c.json({ error: error.message }, 500);
  }

  return c.json(data);
});

// PUT /api/manage/playbooks/:id/memory/:key - Write memory
app.put("/manage/playbooks/:id/memory/:key", async (c) => {
  const user = await getUserFromAuthOrApiKey(c, "memory:write");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const playbookId = c.req.param("id");
  const key = c.req.param("key");
  const supabase = getServiceSupabase();

  // Check ownership
  const { data: playbook } = await supabase
    .from("playbooks")
    .select("id")
    .eq("id", playbookId)
    .eq("user_id", user.id)
    .single();

  if (!playbook) {
    return c.json({ error: "Playbook not found" }, 404);
  }

  const body = await c.req.json();
  const { value, tags, description } = body;

  if (value === undefined) {
    return c.json({ error: "Value is required" }, 400);
  }

  if (tags !== undefined && !Array.isArray(tags)) {
    return c.json({ error: "Tags must be an array of strings" }, 400);
  }

  const upsertData: Record<string, unknown> = {
    playbook_id: playbookId,
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

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json(data);
});

// DELETE /api/manage/playbooks/:id/memory/:key - Delete memory
app.delete("/manage/playbooks/:id/memory/:key", async (c) => {
  const user = await getUserFromAuthOrApiKey(c, "memory:write");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const playbookId = c.req.param("id");
  const key = c.req.param("key");
  const supabase = getServiceSupabase();

  // Check ownership
  const { data: playbook } = await supabase
    .from("playbooks")
    .select("id")
    .eq("id", playbookId)
    .eq("user_id", user.id)
    .single();

  if (!playbook) {
    return c.json({ error: "Playbook not found" }, 404);
  }

  const { error } = await supabase
    .from("memories")
    .delete()
    .eq("playbook_id", playbookId)
    .eq("key", key);

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ success: true });
});

// ============================================
// OPENAPI SPEC FOR MANAGEMENT API
// ============================================

// GET /api/manage/openapi.json - OpenAPI spec for management API
app.get("/manage/openapi.json", (c) => {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://agentplaybooks.ai";
  
  return c.json({
    openapi: "3.1.0",
    info: {
      title: "AgentPlaybooks Management API",
      description: "API for AI agents to create and manage playbooks. Use with User API Key for authentication.",
      version: "1.0.0",
    },
    servers: [{ url: `${baseUrl}/api` }],
    security: [{ bearerAuth: [] }],
    paths: {
      "/manage/playbooks": {
        get: {
          operationId: "listPlaybooks",
          summary: "List all playbooks owned by the authenticated user",
          responses: {
            "200": {
              description: "List of playbooks",
              content: {
                "application/json": {
                  schema: { type: "array", items: { $ref: "#/components/schemas/Playbook" } }
                }
              }
            }
          }
        },
        post: {
          operationId: "createPlaybook",
          summary: "Create a new playbook",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name"],
                  properties: {
                    name: { type: "string", description: "Playbook name" },
                    description: { type: "string", description: "Playbook description" },
                    is_public: { type: "boolean", default: false, description: "Whether the playbook is public" }
                  }
                }
              }
            }
          },
          responses: { "201": { description: "Playbook created" } }
        }
      },
      "/manage/playbooks/{id}": {
        get: {
          operationId: "getPlaybook",
          summary: "Get playbook details including personas, skills, and MCP servers",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "Playbook details" } }
        },
        put: {
          operationId: "updatePlaybook",
          summary: "Update playbook",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    description: { type: "string" },
                    is_public: { type: "boolean" }
                  }
                }
              }
            }
          },
          responses: { "200": { description: "Playbook updated" } }
        },
        delete: {
          operationId: "deletePlaybook",
          summary: "Delete playbook",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "Playbook deleted" } }
        }
      },
      "/manage/playbooks/{id}/personas": {
        post: {
          operationId: "createPersona",
          summary: "Add a persona to a playbook",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name", "system_prompt"],
                  properties: {
                    name: { type: "string", description: "Persona name" },
                    system_prompt: { type: "string", description: "System prompt for the AI" },
                    metadata: { type: "object", description: "Optional metadata" }
                  }
                }
              }
            }
          },
          responses: { "201": { description: "Persona created" } }
        }
      },
      "/manage/playbooks/{id}/personas/{pid}": {
        put: {
          operationId: "updatePersona",
          summary: "Update a persona",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
            { name: "pid", in: "path", required: true, schema: { type: "string", format: "uuid" } }
          ],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    system_prompt: { type: "string" },
                    metadata: { type: "object" }
                  }
                }
              }
            }
          },
          responses: { "200": { description: "Persona updated" } }
        },
        delete: {
          operationId: "deletePersona",
          summary: "Delete a persona",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
            { name: "pid", in: "path", required: true, schema: { type: "string", format: "uuid" } }
          ],
          responses: { "200": { description: "Persona deleted" } }
        }
      },
      "/manage/playbooks/{id}/skills": {
        post: {
          operationId: "createSkill",
          summary: "Add a skill to a playbook",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name"],
                  properties: {
                    name: { type: "string", description: "Skill name (use snake_case)" },
                    description: { type: "string", description: "What the skill does" },
                    definition: {
                      type: "object",
                      description: "Skill definition with parameters schema",
                      properties: {
                        parameters: {
                          type: "object",
                          properties: {
                            type: { type: "string", enum: ["object"] },
                            properties: { type: "object" },
                            required: { type: "array", items: { type: "string" } }
                          }
                        }
                      }
                    },
                    examples: { type: "array", description: "Example usages" }
                  }
                }
              }
            }
          },
          responses: { "201": { description: "Skill created" } }
        }
      },
      "/manage/playbooks/{id}/skills/{sid}": {
        put: {
          operationId: "updateSkill",
          summary: "Update a skill",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
            { name: "sid", in: "path", required: true, schema: { type: "string", format: "uuid" } }
          ],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    description: { type: "string" },
                    definition: { type: "object" },
                    examples: { type: "array" }
                  }
                }
              }
            }
          },
          responses: { "200": { description: "Skill updated" } }
        },
        delete: {
          operationId: "deleteSkill",
          summary: "Delete a skill",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
            { name: "sid", in: "path", required: true, schema: { type: "string", format: "uuid" } }
          ],
          responses: { "200": { description: "Skill deleted" } }
        }
      },
      // Memory endpoints for management
      "/manage/playbooks/{id}/memory": {
        get: {
          operationId: "listMemories",
          summary: "List or search memories in a playbook",
          description: "Get all memory entries, search by text, or filter by tags",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" }, description: "Playbook ID" },
            { name: "search", in: "query", schema: { type: "string" }, description: "Search in keys and descriptions" },
            { name: "tags", in: "query", schema: { type: "string" }, description: "Filter by tags (comma-separated)" }
          ],
          responses: {
            "200": {
              description: "List of memories",
              content: {
                "application/json": {
                  schema: { type: "array", items: { $ref: "#/components/schemas/Memory" } }
                }
              }
            }
          }
        }
      },
      "/manage/playbooks/{id}/memory/{key}": {
        get: {
          operationId: "getMemory",
          summary: "Get a specific memory by key",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
            { name: "key", in: "path", required: true, schema: { type: "string" } }
          ],
          responses: { "200": { description: "Memory entry" } }
        },
        put: {
          operationId: "writeMemory",
          summary: "Create or update a memory entry",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
            { name: "key", in: "path", required: true, schema: { type: "string" } }
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["value"],
                  properties: {
                    value: { type: "object", description: "Any JSON value to store" },
                    tags: { type: "array", items: { type: "string" }, description: "Tags for categorization" },
                    description: { type: "string", description: "Human-readable description" }
                  }
                }
              }
            }
          },
          responses: { "200": { description: "Memory written" } }
        },
        delete: {
          operationId: "deleteMemory",
          summary: "Delete a memory entry",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
            { name: "key", in: "path", required: true, schema: { type: "string" } }
          ],
          responses: { "200": { description: "Memory deleted" } }
        }
      }
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "User API Key starting with apb_live_"
        }
      },
      schemas: {
        Playbook: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            guid: { type: "string", description: "Public identifier for the playbook" },
            name: { type: "string" },
            description: { type: "string" },
            is_public: { type: "boolean" },
            persona_count: { type: "integer" },
            skill_count: { type: "integer" },
            mcp_server_count: { type: "integer" },
            created_at: { type: "string", format: "date-time" },
            updated_at: { type: "string", format: "date-time" }
          }
        },
        Memory: {
          type: "object",
          description: "A memory entry storing persistent data with optional tags and description",
          properties: {
            key: { type: "string", description: "Unique key identifier" },
            value: { type: "object", description: "Stored JSON value" },
            tags: { type: "array", items: { type: "string" }, description: "Tags for categorization and search" },
            description: { type: "string", description: "Human-readable description of this memory" },
            updated_at: { type: "string", format: "date-time" }
          }
        },
        Skill: {
          type: "object",
          description: "A skill defines a capability or rule for solving tasks",
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string", description: "Skill name (snake_case)" },
            description: { type: "string", description: "What this skill does" },
            definition: { type: "object", description: "Skill definition with parameters schema" },
            examples: { type: "array", description: "Example usages" },
            priority: { type: "integer", description: "Priority (higher = more important)" }
          }
        },
        Persona: {
          type: "object",
          description: "An AI personality with a system prompt",
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string" },
            system_prompt: { type: "string" },
            metadata: { type: "object" }
          }
        }
      }
    }
  });
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
    .from("playbooks")
    .update({
      persona_name: name,
      persona_system_prompt: system_prompt,
      persona_metadata: metadata || {},
    })
    .eq("id", apiKeyData.playbook_id)
    .select("id, created_at, persona_name, persona_system_prompt, persona_metadata")
    .single();

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json(playbookToPersona(data));
});

app.put("/agent/:guid/personas/:id", async (c) => {
  const guid = c.req.param("guid");
  // Persona is a singleton (stored on playbook); :id is kept for legacy compatibility
  const apiKeyData = await validateApiKey(c, "personas:write");
  if (!apiKeyData || apiKeyData.playbooks.guid !== guid) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json();
  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from("playbooks")
    .update({
      persona_name: body.name,
      persona_system_prompt: body.system_prompt,
      persona_metadata: body.metadata,
    })
    .eq("id", apiKeyData.playbook_id)
    .select("id, created_at, persona_name, persona_system_prompt, persona_metadata")
    .single();

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json(playbookToPersona(data));
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
      persona_name,
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

  const playbookRows: PlaybookWithCounts[] = data || [];
  // Get unique user_ids to fetch profiles
  const userIds = [
    ...new Set(playbookRows.map((p) => p.user_id).filter((id): id is string => Boolean(id))),
  ];
  
  // Fetch profiles for these users
  const { data: profiles } = userIds.length > 0 
    ? await supabase
        .from("profiles")
        .select("id, display_name, avatar_svg, website_url, is_verified, is_virtual")
        .in("id", userIds)
    : { data: [] };
  
  // Create a map for quick lookup
  const profileRows: ProfileSummary[] = profiles || [];
  const profileMap = new Map(profileRows.map((profile) => [profile.id, profile]));

  // Transform count objects to numbers with consistent naming
  const playbooks = playbookRows.map((p) => {
    const profile = profileMap.get(p.user_id);
    return {
      ...p,
      personas_count: p.persona_name ? 1 : 0,
      skills_count: p.skills?.[0]?.count || 0,
      mcp_servers_count: p.mcp_servers?.[0]?.count || 0,
      tags: p.tags || [],
      // Publisher info from profile
      publisher: profile ? {
        id: profile.id,
        name: profile.display_name,
        avatar_svg: profile.avatar_svg,
        website_url: profile.website_url,
        is_verified: profile.is_verified,
        is_virtual: profile.is_virtual,
      } : null,
      skills: undefined,
      mcp_servers: undefined,
    };
  });

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

  const starredRows: StarredPlaybookRow[] = data || [];
  const playbooks = starredRows
    .map((star) => star.playbooks)
    .filter((playbook): playbook is Playbook => Boolean(playbook));
  return c.json(playbooks);
});

// ============================================
// PUBLIC REPOSITORY ENDPOINTS (Skills & MCP from public playbooks)
// ============================================

// GET /api/public/skills - Get skills from all public playbooks (marketplace)
app.get("/public/skills", async (c) => {
  const search = c.req.query("search");
  const supabase = getServiceSupabase();

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

  const skillsRows: SkillWithPlaybook[] = data || [];
  // Get unique user_ids to fetch profiles
  const userIds = [
    ...new Set(
      skillsRows
        .map((skill) => skill.playbook?.user_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  
  // Fetch profiles
  const { data: profiles } = userIds.length > 0 
    ? await supabase
        .from("profiles")
        .select("id, display_name, avatar_svg, website_url, is_verified, is_virtual")
        .in("id", userIds)
    : { data: [] };
  
  const profileRows: ProfileSummary[] = profiles || [];
  const profileMap = new Map(profileRows.map((profile) => [profile.id, profile]));

  // Transform to include playbook and publisher info
  const skills = skillsRows.map((skill) => {
    const profile = skill.playbook?.user_id ? profileMap.get(skill.playbook.user_id) : undefined;
    return {
      ...skill,
      playbook_guid: skill.playbook?.guid,
      playbook_name: skill.playbook?.name,
      publisher: profile ? {
        id: profile.id,
        name: profile.display_name,
        avatar_svg: profile.avatar_svg,
        website_url: profile.website_url,
        is_verified: profile.is_verified,
        is_virtual: profile.is_virtual,
      } : null,
      playbook: undefined // Remove nested object
    };
  });

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

  const skill = data as SkillWithPlaybook;
  return c.json({
    ...skill,
    playbook_guid: skill.playbook?.guid,
    playbook_name: skill.playbook?.name,
    playbook: undefined,
  });
});

// GET /api/public/mcp - Get MCP servers from all public playbooks (marketplace)
app.get("/public/mcp", async (c) => {
  const search = c.req.query("search");
  const supabase = getServiceSupabase();

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

  const serverRows: MCPServerWithPlaybook[] = data || [];
  // Get unique user_ids to fetch profiles
  const userIds = [
    ...new Set(
      serverRows
        .map((server) => server.playbook?.user_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  
  // Fetch profiles
  const { data: profiles } = userIds.length > 0 
    ? await supabase
        .from("profiles")
        .select("id, display_name, avatar_svg, website_url, is_verified, is_virtual")
        .in("id", userIds)
    : { data: [] };
  
  const profileRows: ProfileSummary[] = profiles || [];
  const profileMap = new Map(profileRows.map((profile) => [profile.id, profile]));

  // Transform to include playbook and publisher info
  const servers = serverRows.map((server) => {
    const profile = server.playbook?.user_id ? profileMap.get(server.playbook.user_id) : undefined;
    return {
      ...server,
      playbook_guid: server.playbook?.guid,
      playbook_name: server.playbook?.name,
      publisher: profile ? {
        id: profile.id,
        name: profile.display_name,
        avatar_svg: profile.avatar_svg,
        website_url: profile.website_url,
        is_verified: profile.is_verified,
        is_virtual: profile.is_virtual,
      } : null,
      playbook: undefined
    };
  });

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

  const server = data as MCPServerWithPlaybook;
  return c.json({
    ...server,
    playbook_guid: server.playbook?.guid,
    playbook_name: server.playbook?.name,
    playbook: undefined,
  });
});

// ============================================
// FORMAT HELPERS
// ============================================

function formatAsOpenAPI(playbook: PlaybookWithExports) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://agentplaybooks.ai";
  const persona = playbook.persona || (Array.isArray(playbook.personas) ? playbook.personas[0] : null);
  const personaHeader = persona?.name && persona?.system_prompt
    ? `## Persona: ${persona.name}\n\n${persona.system_prompt}\n\n---\n\n`
    : "";
  
  // Convert skills to OpenAPI-compatible tool definitions
  const tools = playbook.skills.map((skill) => ({
    type: "function",
    function: {
      name: skill.name.toLowerCase().replace(/\s+/g, "_"),
      description: skill.description || skill.name,
      parameters: skill.definition?.parameters || { type: "object", properties: {} },
    },
  }));

  // Build skill schemas for OpenAPI
  const skillSchemas: Record<string, OpenApiSkillSchema> = {};
  playbook.skills.forEach((skill) => {
    const skillName = skill.name.toLowerCase().replace(/\s+/g, "_");
    skillSchemas[`Skill_${skillName}`] = {
      type: "object",
      description: skill.description || skill.name,
      properties: skill.definition?.parameters?.properties || {},
      required: skill.definition?.parameters?.required || [],
    };
  });

  return {
    openapi: "3.1.0",
    info: {
      title: playbook.name,
      // ChatGPT tends to read `info.description` early, so we embed the persona here too.
      description: `${personaHeader}${playbook.description || `API for ${playbook.name} playbook`}`,
      version: "1.0.0",
    },
    servers: [{ url: `${baseUrl}/api` }],
    paths: {
      // Memory: List & Search
      [`/playbooks/${playbook.guid}/memory`]: {
        get: {
          summary: "Get or search memories",
          description: "Retrieve all memory entries, search by tags, or get a specific key",
          operationId: "getMemories",
          parameters: [
            {
              name: "key",
              in: "query",
              required: false,
              schema: { type: "string" },
              description: "Get specific memory by key",
            },
            {
              name: "search",
              in: "query",
              required: false,
              schema: { type: "string" },
              description: "Search in keys and descriptions",
            },
            {
              name: "tags",
              in: "query",
              required: false,
              schema: { type: "string" },
              description: "Filter by tags (comma-separated)",
            },
          ],
          responses: {
            "200": {
              description: "Memory entries retrieved successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: { $ref: "#/components/schemas/MemoryEntry" },
                  },
                },
              },
            },
            "404": {
              description: "Playbook not found",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      // Memory: Write/Delete specific key
      [`/playbooks/${playbook.guid}/memory/{key}`]: {
        get: {
          summary: "Get memory by key",
          description: "Retrieve a specific memory entry by its key",
          operationId: "getMemoryByKey",
          parameters: [
            {
              name: "key",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "Memory key to retrieve",
            },
          ],
          responses: {
            "200": {
              description: "Memory entry",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/MemoryEntry" },
                },
              },
            },
            "404": {
              description: "Memory not found",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
        put: {
          summary: "Write memory",
          description: "Create or update a memory entry with optional tags and description. Requires API key.",
          operationId: "writeMemory",
          parameters: [
            {
              name: "key",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "Memory key to write",
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/MemoryWrite" },
              },
            },
          },
          responses: {
            "200": {
              description: "Memory written successfully",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/MemoryEntry" },
                },
              },
            },
            "401": {
              description: "Unauthorized - API key required",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
          security: [{ apiKey: [] }],
        },
        delete: {
          summary: "Delete memory",
          description: "Delete a memory entry. Requires API key.",
          operationId: "deleteMemory",
          parameters: [
            {
              name: "key",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "Memory key to delete",
            },
          ],
          responses: {
            "200": {
              description: "Memory deleted",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Success" },
                },
              },
            },
            "401": {
              description: "Unauthorized",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
          security: [{ apiKey: [] }],
        },
      },
      // Skills: List all
      [`/playbooks/${playbook.guid}/skills`]: {
        get: {
          summary: "List skills",
          description: "Get all skills (rules/capabilities) defined in this playbook. Skills describe how to solve tasks.",
          operationId: "listSkills",
          responses: {
            "200": {
              description: "List of skills",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: { $ref: "#/components/schemas/Skill" },
                  },
                },
              },
            },
          },
        },
      },
      // Skills: Get specific
      [`/playbooks/${playbook.guid}/skills/{skillId}`]: {
        get: {
          summary: "Get skill",
          description: "Get a specific skill definition including its parameters and examples",
          operationId: "getSkill",
          parameters: [
            {
              name: "skillId",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "Skill ID or name",
            },
          ],
          responses: {
            "200": {
              description: "Skill details",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Skill" },
                },
              },
            },
            "404": {
              description: "Skill not found",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      // Personas: List
      [`/playbooks/${playbook.guid}/personas`]: {
        get: {
          summary: "List personas",
          description: "Get the playbook persona (singleton). Returned as an array for backward compatibility.",
          operationId: "listPersonas",
          responses: {
            "200": {
              description: "List of personas",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: { $ref: "#/components/schemas/Persona" },
                  },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        MemoryEntry: {
          type: "object",
          description: "A memory entry storing persistent data",
          properties: {
            key: { type: "string", description: "Unique key identifier" },
            value: { type: "object", description: "Stored value (any JSON)" },
            tags: { 
              type: "array", 
              items: { type: "string" },
              description: "Tags for categorization and search" 
            },
            description: { type: "string", description: "Human-readable description" },
            updated_at: { type: "string", format: "date-time", description: "Last update timestamp" },
          },
        },
        MemoryWrite: {
          type: "object",
          description: "Data for creating/updating a memory entry",
          properties: {
            value: { type: "object", description: "Value to store (any JSON object)" },
            tags: { 
              type: "array", 
              items: { type: "string" },
              description: "Optional tags for categorization" 
            },
            description: { type: "string", description: "Optional description" },
          },
          required: ["value"],
        },
        Skill: {
          type: "object",
          description: "A skill defines a capability or rule for solving tasks",
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string", description: "Skill name (snake_case)" },
            description: { type: "string", description: "What this skill does" },
            definition: { 
              type: "object", 
              description: "Skill definition with parameters schema",
              properties: {
                parameters: { type: "object", description: "JSON Schema for input parameters" },
              },
            },
            examples: { 
              type: "array", 
              items: { type: "object" },
              description: "Example usages" 
            },
          },
        },
        Persona: {
          type: "object",
          description: "An AI personality with a system prompt",
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string", description: "Persona name" },
            system_prompt: { type: "string", description: "System prompt for the AI" },
            metadata: { type: "object", description: "Additional metadata" },
          },
        },
        Success: {
          type: "object",
          properties: {
            success: { type: "boolean" },
          },
        },
        Error: {
          type: "object",
          properties: {
            error: { type: "string", description: "Error message" },
          },
        },
        // Include skill-specific schemas
        ...skillSchemas,
      },
      securitySchemes: {
        apiKey: {
          type: "http",
          scheme: "bearer",
          description: "API key starting with apb_live_",
        },
      },
    },
    // Extension: include full playbook data for AI context
    "x-playbook": {
      guid: playbook.guid,
      persona,
      personas: playbook.personas, // backward-compatible
      skills: tools,
      mcp_servers: playbook.mcp_servers.map((mcp) => ({
        name: mcp.name,
        description: mcp.description,
        tools_count: mcp.tools?.length || 0,
      })),
    },
  };
}

function formatAsMCP(playbook: PlaybookWithExports) {
  const persona = playbook.persona || (Array.isArray(playbook.personas) ? playbook.personas[0] : null);
  const tools = playbook.skills.map((skill) => ({
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
    persona: persona
      ? { name: persona.name, systemPrompt: persona.system_prompt }
      : null,
  personas: Array.isArray(playbook.personas)
      ? playbook.personas.map((personaItem) => ({
          name: personaItem.name,
          systemPrompt: personaItem.system_prompt,
        }))
      : [],
  };
}

function formatAsAnthropic(playbook: PlaybookWithExports) {
  const persona = playbook.persona || (Array.isArray(playbook.personas) ? playbook.personas[0] : null);
  // Anthropic tool format
  const tools = playbook.skills.map((skill) => ({
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
    system_prompt: persona?.name && persona?.system_prompt ? `## ${persona.name}\n\n${persona.system_prompt}` : null,
    tools,
    mcp_servers: playbook.mcp_servers.map((mcp) => ({
      name: mcp.name,
      description: mcp.description,
      tools: mcp.tools,
      resources: mcp.resources,
    })),
  };
}

function formatAsMarkdown(playbook: PlaybookWithExports): string {
  let md = `# ${playbook.name}\n\n`;
  const persona = playbook.persona || (Array.isArray(playbook.personas) ? playbook.personas[0] : null);
  
  if (playbook.description) {
    md += `${playbook.description}\n\n`;
  }

  md += `**GUID:** \`${playbook.guid}\`\n\n`;

  if (persona?.name && persona?.system_prompt) {
    md += `## Persona\n\n`;
    md += `### ${persona.name}\n\n`;
    md += `${persona.system_prompt}\n\n`;
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
        md += `**Tools:** ${mcp.tools.map((tool) => tool.name).join(", ")}\n\n`;
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
