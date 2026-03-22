import { handle } from "hono/vercel";
import { createApiApp } from "@/app/api/_shared/hono";
import { getServiceSupabase } from "@/app/api/_shared/supabase";
import { getAuthenticatedUser, validateApiKey } from "@/app/api/_shared/auth";
import { getPlaybookByGuid } from "@/app/api/_shared/guards";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import type { SecretCategory, SecretMetadata } from "@/lib/supabase/types";

const app = createApiApp("/api/playbooks/:guid/secrets");

// Secrets responses must never be cached by browsers/CDNs.
app.use("*", async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  c.header("Pragma", "no-cache");
  c.header("Expires", "0");
});

// Strip encrypted fields - never leak crypto material to clients
function toMetadata(row: Record<string, unknown>): SecretMetadata {
  return {
    id: row.id as string,
    playbook_id: row.playbook_id as string,
    name: row.name as string,
    description: (row.description as string) || null,
    category: row.category as SecretCategory,
    rotated_at: (row.rotated_at as string) || null,
    expires_at: (row.expires_at as string) || null,
    last_used_at: (row.last_used_at as string) || null,
    use_count: (row.use_count as number) || 0,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

// GET /api/playbooks/:guid/secrets - list secrets metadata (never returns values)
app.get("/", async (c) => {
  const guid = c.req.param("guid");
  if (!guid) return c.json({ error: "Missing playbook GUID" }, 400);

  // Auth: session user or API key with secrets:read
  const user = await getAuthenticatedUser(c.req.raw);
  const apiKey = !user ? await validateApiKey(c.req.raw, "secrets:read") : null;

  const playbook = await getPlaybookByGuid(guid, user?.id ?? null);
  if (!playbook) return c.json({ error: "Playbook not found" }, 404);

  // Only owner or API key holder for this playbook can access secrets
  const isOwner = user && playbook.user_id === user.id;
  const isApiKeyForPlaybook = apiKey && apiKey.playbooks.id === playbook.id;
  if (!isOwner && !isApiKeyForPlaybook) {
    return c.json({ error: "Forbidden: secrets are only accessible to the playbook owner" }, 403);
  }

  const supabase = getServiceSupabase();
  const category = c.req.query("category");

  let query = supabase
    .from("secrets")
    .select("id, playbook_id, name, description, category, rotated_at, expires_at, last_used_at, use_count, created_at, updated_at")
    .eq("playbook_id", playbook.id);

  if (category) {
    query = query.eq("category", category as SecretCategory);
  }

  const { data, error } = await query.order("name");
  if (error) return c.json({ error: error.message }, 500);

  return c.json(data || []);
});

// POST /api/playbooks/:guid/secrets - create a new secret
app.post("/", async (c) => {
  const guid = c.req.param("guid");
  if (!guid) return c.json({ error: "Missing playbook GUID" }, 400);

  const user = await getAuthenticatedUser(c.req.raw);
  const apiKey = !user ? await validateApiKey(c.req.raw, "secrets:write") : null;

  const playbook = await getPlaybookByGuid(guid, user?.id ?? null);
  if (!playbook) return c.json({ error: "Playbook not found" }, 404);

  const isOwner = user && playbook.user_id === user.id;
  const isApiKeyForPlaybook = apiKey && apiKey.playbooks.id === playbook.id;
  if (!isOwner && !isApiKeyForPlaybook) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json();
  const { name, value, description, category, expires_at } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return c.json({ error: "name is required" }, 400);
  }
  if (!value || typeof value !== "string" || value.trim().length === 0) {
    return c.json({ error: "value is required (the secret to encrypt)" }, 400);
  }

  const normalizedNamePattern = /^[A-Za-z0-9_-]+$/;
  if (!normalizedNamePattern.test(name.trim())) {
    return c.json({ error: "name can only contain letters, numbers, underscores, and hyphens" }, 400);
  }

  const normalizedName = name.trim();

  // Check duplicate name first so we can provide a clear, actionable error
  const { data: existingSecret, error: duplicateCheckError } = await getServiceSupabase()
    .from("secrets")
    .select("id, name")
    .eq("playbook_id", playbook.id)
    .eq("name", normalizedName)
    .maybeSingle();

  if (duplicateCheckError) {
    return c.json({ error: `Failed to verify secret uniqueness: ${duplicateCheckError.message}` }, 500);
  }

  if (existingSecret) {
    return c.json({ error: `Secret '${normalizedName}' already exists in this playbook. Use rotate_secret to update it.` }, 409);
  }

  // Encrypt with per-user derived key (playbook owner's user_id)
  let encrypted: Awaited<ReturnType<typeof encryptSecret>>;
  try {
    encrypted = await encryptSecret(value, playbook.user_id);
  } catch (err) {
    console.error("Secrets encryption failed during create:", err);
    return c.json(
      { error: "Secrets vault is not configured correctly on the server (missing or invalid encryption key)." },
      500
    );
  }

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("secrets")
    .insert({
      playbook_id: playbook.id,
      name: normalizedName,
      description: description || null,
      category: category || "general",
      expires_at: expires_at || null,
      encrypted_value: encrypted.encrypted_value,
      iv: encrypted.iv,
      auth_tag: encrypted.auth_tag,
      created_by: user?.id || apiKey?.key_prefix || null,
      updated_by: user?.id || apiKey?.key_prefix || null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return c.json({ error: `Secret with name '${name.trim()}' already exists in this playbook` }, 409);
    }
    return c.json({ error: error.message }, 500);
  }

  return c.json(toMetadata(data as Record<string, unknown>), 201);
});

// GET /api/playbooks/:guid/secrets/reveal/:name - decrypt and return a secret value
// DASHBOARD USE ONLY - for human users to see/copy their secrets
// Agents should use the use_secret MCP tool or POST /proxy endpoint instead
app.get("/reveal/:name", async (c) => {
  const guid = c.req.param("guid");
  const name = c.req.param("name");
  if (!guid || !name) return c.json({ error: "Missing parameters" }, 400);

  const user = await getAuthenticatedUser(c.req.raw);
  const apiKey = !user ? await validateApiKey(c.req.raw, "secrets:read") : null;

  const playbook = await getPlaybookByGuid(guid, user?.id ?? null);
  if (!playbook) return c.json({ error: "Playbook not found" }, 404);

  const isOwner = user && playbook.user_id === user.id;
  const isApiKeyForPlaybook = apiKey && apiKey.playbooks.id === playbook.id;
  if (!isOwner && !isApiKeyForPlaybook) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const supabase = getServiceSupabase();
  const { data: secret, error } = await supabase
    .from("secrets")
    .select("*")
    .eq("playbook_id", playbook.id)
    .eq("name", name)
    .single();

  if (error || !secret) {
    return c.json({ error: "Secret not found" }, 404);
  }

  // Decrypt the value
  try {
    const plaintext = await decryptSecret({
      encrypted_value: secret.encrypted_value,
      iv: secret.iv,
      auth_tag: secret.auth_tag,
    }, playbook.user_id);

    // Update usage stats
    await supabase
      .from("secrets")
      .update({
        last_used_at: new Date().toISOString(),
        use_count: (secret.use_count || 0) + 1,
      })
      .eq("id", secret.id);

    return c.json({
      name: secret.name,
      value: plaintext,
      category: secret.category,
      expires_at: secret.expires_at,
    });
  } catch (err) {
    console.error("Failed to decrypt secret:", err);
    return c.json({ error: "Failed to decrypt secret - encryption key may have changed" }, 500);
  }
});

// PUT /api/playbooks/:guid/secrets/:name - update/rotate a secret
app.put("/:name", async (c) => {
  const guid = c.req.param("guid");
  const name = c.req.param("name");
  if (!guid || !name) return c.json({ error: "Missing parameters" }, 400);

  const user = await getAuthenticatedUser(c.req.raw);
  const apiKey = !user ? await validateApiKey(c.req.raw, "secrets:write") : null;

  const playbook = await getPlaybookByGuid(guid, user?.id ?? null);
  if (!playbook) return c.json({ error: "Playbook not found" }, 404);

  const isOwner = user && playbook.user_id === user.id;
  const isApiKeyForPlaybook = apiKey && apiKey.playbooks.id === playbook.id;
  if (!isOwner && !isApiKeyForPlaybook) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json();
  const { value, description, category, expires_at } = body;

  const supabase = getServiceSupabase();

  // Find existing secret
  const { data: existing, error: findError } = await supabase
    .from("secrets")
    .select("id")
    .eq("playbook_id", playbook.id)
    .eq("name", name)
    .single();

  if (findError || !existing) {
    return c.json({ error: "Secret not found" }, 404);
  }

  const updateData: Record<string, unknown> = {
    updated_by: user?.id || apiKey?.key_prefix || null,
  };

  // If a new value is provided, re-encrypt with per-user key (rotation)
  if (value && typeof value === "string") {
    let encrypted: Awaited<ReturnType<typeof encryptSecret>>;
    try {
      encrypted = await encryptSecret(value, playbook.user_id);
    } catch (err) {
      console.error("Secrets encryption failed during rotate:", err);
      return c.json(
        { error: "Secrets vault is not configured correctly on the server (missing or invalid encryption key)." },
        500
      );
    }
    updateData.encrypted_value = encrypted.encrypted_value;
    updateData.iv = encrypted.iv;
    updateData.auth_tag = encrypted.auth_tag;
    updateData.rotated_at = new Date().toISOString();
  }

  if (description !== undefined) updateData.description = description;
  if (category !== undefined) updateData.category = category;
  if (expires_at !== undefined) updateData.expires_at = expires_at;

  const { data, error } = await supabase
    .from("secrets")
    .update(updateData)
    .eq("id", existing.id)
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 500);

  return c.json(toMetadata(data as Record<string, unknown>));
});

// DELETE /api/playbooks/:guid/secrets/:name - delete a secret
app.delete("/:name", async (c) => {
  const guid = c.req.param("guid");
  const name = c.req.param("name");
  if (!guid || !name) return c.json({ error: "Missing parameters" }, 400);

  const user = await getAuthenticatedUser(c.req.raw);
  if (!user) return c.json({ error: "Authentication required" }, 401);

  const playbook = await getPlaybookByGuid(guid, user.id);
  if (!playbook) return c.json({ error: "Playbook not found" }, 404);

  if (playbook.user_id !== user.id) {
    return c.json({ error: "Forbidden: only the owner can delete secrets" }, 403);
  }

  const supabase = getServiceSupabase();
  const { error } = await supabase
    .from("secrets")
    .delete()
    .eq("playbook_id", playbook.id)
    .eq("name", name);

  if (error) return c.json({ error: error.message }, 500);

  return c.json({ success: true });
});

// POST /api/playbooks/:guid/secrets/proxy - use a secret to make an HTTP request
// The secret value is injected server-side and NEVER returned to the caller.
app.post("/proxy", async (c) => {
  const guid = c.req.param("guid");
  if (!guid) return c.json({ error: "Missing playbook GUID" }, 400);

  const user = await getAuthenticatedUser(c.req.raw);
  const apiKey = !user ? await validateApiKey(c.req.raw, "secrets:read") : null;

  const playbook = await getPlaybookByGuid(guid, user?.id ?? null);
  if (!playbook) return c.json({ error: "Playbook not found" }, 404);

  const isOwner = user && playbook.user_id === user.id;
  const isApiKeyForPlaybook = apiKey && apiKey.playbooks.id === playbook.id;
  if (!isOwner && !isApiKeyForPlaybook) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json();
  const { secret_name, url, method, header_name, header_prefix, body: reqBody, extra_headers, timeout_ms } = body;

  if (!secret_name || !url) {
    return c.json({ error: "secret_name and url are required" }, 400);
  }

  // SSRF protection
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return c.json({ error: "Only http and https URLs are allowed" }, 400);
    }
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0" ||
        hostname.startsWith("10.") || hostname.startsWith("192.168.") ||
        hostname.startsWith("172.") || hostname.endsWith(".internal") ||
        hostname.endsWith(".local")) {
      return c.json({ error: "Requests to private/internal addresses are not allowed" }, 400);
    }
  } catch {
    return c.json({ error: `Invalid URL: ${url}` }, 400);
  }

  const supabase = getServiceSupabase();
  const { data: secret, error: secretErr } = await supabase
    .from("secrets")
    .select("*")
    .eq("playbook_id", playbook.id)
    .eq("name", secret_name)
    .single();

  if (secretErr || !secret) {
    return c.json({ error: `Secret '${secret_name}' not found` }, 404);
  }

  let secretValue: string;
  try {
    secretValue = await decryptSecret({
      encrypted_value: secret.encrypted_value,
      iv: secret.iv,
      auth_tag: secret.auth_tag,
    }, playbook.user_id);
  } catch {
    return c.json({ error: "Failed to decrypt secret" }, 500);
  }

  const httpMethod = (method || "GET").toUpperCase();
  const hdrName = header_name || "Authorization";
  const hdrPrefix = header_prefix !== undefined ? header_prefix : "Bearer ";
  const timeout = Math.min(timeout_ms || 30000, 60000);

  const outHeaders: Record<string, string> = {
    [hdrName]: `${hdrPrefix}${secretValue}`,
  };

  if (extra_headers && typeof extra_headers === "object") {
    for (const [k, v] of Object.entries(extra_headers as Record<string, string>)) {
      outHeaders[k] = v;
    }
  }

  if (reqBody && !outHeaders["Content-Type"]) {
    outHeaders["Content-Type"] = "application/json";
  }

  const fetchOptions: RequestInit = {
    method: httpMethod,
    headers: outHeaders,
    signal: AbortSignal.timeout(timeout),
  };

  if (reqBody && ["POST", "PUT", "PATCH"].includes(httpMethod)) {
    fetchOptions.body = JSON.stringify(reqBody);
  }

  try {
    const proxyRes = await fetch(url, fetchOptions);
    const contentType = proxyRes.headers.get("content-type") || "";
    let responseBody: unknown;

    if (contentType.includes("application/json")) {
      responseBody = await proxyRes.json();
    } else {
      const text = await proxyRes.text();
      responseBody = text.length > 10000 ? text.slice(0, 10000) + "\n... (truncated)" : text;
    }

    // Update usage stats
    await supabase
      .from("secrets")
      .update({
        last_used_at: new Date().toISOString(),
        use_count: (secret.use_count || 0) + 1,
      })
      .eq("id", secret.id);

    return c.json({
      status: proxyRes.status,
      status_text: proxyRes.statusText,
      body: responseBody,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Request failed";
    return c.json({ error: `HTTP request failed: ${msg}` }, 502);
  }
});

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const DELETE = handle(app);
