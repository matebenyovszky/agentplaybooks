import { createApiApp } from "@/app/api/_shared/hono";
import { getServiceSupabase } from "@/app/api/_shared/supabase";
import { getAuthenticatedUser, validateApiKey } from "@/app/api/_shared/auth";
import { getPlaybookByGuid } from "@/app/api/_shared/guards";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { checkSecretDestination, normalizeAllowedHosts } from "@/lib/secret-destinations";
import {
  buildExchangeBody,
  isLoopbackRedirect,
  isPlanFailure,
  planExchange,
  readExchangeResponse,
  resolveConfiguredClientId,
} from "@/lib/oauth-exchange";
import {
  destinationHostOf,
  recordSecretAudit,
  auditActor,
  type AuditContext,
} from "@/app/api/_shared/audit";
import type { SecretCategory, SecretMetadata, SecretsUpdate } from "@/lib/supabase/types";

const app = createApiApp("/api/playbooks/:guid/secrets");

/**
 * Every handler below records what it did to the vault, including what it
 * refused. The context is built once the playbook is known, because an event
 * with no playbook to hang on cannot be stored — a request for a GUID that does
 * not exist is not a vault event.
 */
function auditContext(
  c: { req: { header: (name: string) => string | undefined } },
  playbookId: string,
  user: { id: string } | null | undefined,
  apiKey: { key_prefix?: string | null } | null | undefined,
): AuditContext {
  return {
    playbookId,
    actor: auditActor(user, apiKey),
    requestId: c.req.header("cf-ray") || c.req.header("x-request-id") || null,
  };
}

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
    allow_api_key_reveal: !!row.allow_api_key_reveal,
    allowed_hosts: normalizeAllowedHosts(row.allowed_hosts),
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

  const playbook = await getPlaybookByGuid(guid, user?.id ?? null, apiKey?.playbooks.id ?? null);
  if (!playbook) return c.json({ error: "Playbook not found" }, 404);

  // Only owner or API key holder for this playbook can access secrets
  const isOwner = user && playbook.user_id === user.id;
  const isApiKeyForPlaybook = apiKey && apiKey.playbooks.id === playbook.id;
  const audit = auditContext(c, playbook.id, user, apiKey);
  if (!isOwner && !isApiKeyForPlaybook) {
    await recordSecretAudit(audit, { operation: "secret.list", status: "denied", reason: "not_authorized" });
    return c.json({ error: "Forbidden: secrets are only accessible to the playbook owner" }, 403);
  }

  const supabase = getServiceSupabase();
  const category = c.req.query("category");

  let query = supabase
    .from("secrets")
    .select("id, playbook_id, name, description, category, rotated_at, expires_at, last_used_at, use_count, allow_api_key_reveal, allowed_hosts, created_at, updated_at")
    .eq("playbook_id", playbook.id);

  if (category) {
    query = query.eq("category", category as SecretCategory);
  }

  const { data, error } = await query.order("name");
  if (error) {
    await recordSecretAudit(audit, { operation: "secret.list", status: "error", reason: "query_failed" });
    return c.json({ error: error.message }, 500);
  }

  await recordSecretAudit(audit, { operation: "secret.list", status: "success" });
  return c.json(data || []);
});

// The trail these handlers write is read at GET /api/playbooks/:guid/audit,
// alongside the federated MCP calls — see ../audit/app.ts.

// POST /api/playbooks/:guid/secrets - create a new secret
app.post("/", async (c) => {
  const guid = c.req.param("guid");
  if (!guid) return c.json({ error: "Missing playbook GUID" }, 400);

  const user = await getAuthenticatedUser(c.req.raw);
  const apiKey = !user ? await validateApiKey(c.req.raw, "secrets:write") : null;

  const playbook = await getPlaybookByGuid(guid, user?.id ?? null, apiKey?.playbooks.id ?? null);
  if (!playbook) return c.json({ error: "Playbook not found" }, 404);

  const isOwner = user && playbook.user_id === user.id;
  const isApiKeyForPlaybook = apiKey && apiKey.playbooks.id === playbook.id;
  const audit = auditContext(c, playbook.id, user, apiKey);
  if (!isOwner && !isApiKeyForPlaybook) {
    await recordSecretAudit(audit, { operation: "secret.create", status: "denied", reason: "not_authorized" });
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json();
  const { name, value, description, category, expires_at, allow_api_key_reveal, allowed_hosts } = body;

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
    await recordSecretAudit(audit, {
      operation: "secret.create",
      status: "error",
      secretName: normalizedName,
      reason: "duplicate_name",
    });
    return c.json({ error: `Secret '${normalizedName}' already exists in this playbook. Use rotate_secret to update it.` }, 409);
  }

  // Encrypt with per-user derived key (playbook owner's user_id)
  let encrypted: Awaited<ReturnType<typeof encryptSecret>>;
  try {
    encrypted = await encryptSecret(value, playbook.user_id, {
      playbookId: playbook.id,
      secretName: normalizedName,
    });
  } catch (err) {
    console.error("Secrets encryption failed during create:", err);
    await recordSecretAudit(audit, {
      operation: "secret.create",
      status: "error",
      secretName: normalizedName,
      reason: "encryption_failed",
    });
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
      allow_api_key_reveal: !!allow_api_key_reveal,
      allowed_hosts: allowed_hosts === undefined ? null : normalizeAllowedHosts(allowed_hosts),
      encrypted_value: encrypted.encrypted_value,
      iv: encrypted.iv,
      auth_tag: encrypted.auth_tag,
      created_by: user?.id || apiKey?.key_prefix || null,
      updated_by: user?.id || apiKey?.key_prefix || null,
    })
    .select()
    .single();

  if (error) {
    await recordSecretAudit(audit, {
      operation: "secret.create",
      status: "error",
      secretName: normalizedName,
      reason: error.code === "23505" ? "duplicate_name" : "insert_failed",
    });
    if (error.code === "23505") {
      return c.json({ error: `Secret with name '${name.trim()}' already exists in this playbook` }, 409);
    }
    return c.json({ error: error.message }, 500);
  }

  await recordSecretAudit(audit, {
    operation: "secret.create",
    status: "success",
    secretName: normalizedName,
  });
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

  if (!user && !apiKey) {
    return c.json({ error: "Authentication required." }, 401);
  }

  const playbook = await getPlaybookByGuid(guid, user?.id ?? null, apiKey?.playbooks.id ?? null);
  if (!playbook) return c.json({ error: "Playbook not found" }, 404);

  const isOwner = user && playbook.user_id === user.id;
  const isApiKeyForPlaybook = apiKey && apiKey.playbooks.id === playbook.id;
  const audit = auditContext(c, playbook.id, user, apiKey);

  if (!isOwner && !isApiKeyForPlaybook) {
    await recordSecretAudit(audit, {
      operation: "secret.reveal",
      status: "denied",
      secretName: name,
      reason: "not_authorized",
    });
    return c.json({ error: "Forbidden: only the owner or playbook API key can reveal secrets" }, 403);
  }

  const supabase = getServiceSupabase();
  const { data: secret, error } = await supabase
    .from("secrets")
    .select("*")
    .eq("playbook_id", playbook.id)
    .eq("name", name)
    .single();

  if (error || !secret) {
    await recordSecretAudit(audit, {
      operation: "secret.reveal",
      status: "error",
      secretName: name,
      reason: "not_found",
    });
    return c.json({ error: "Secret not found" }, 404);
  }

  if (!isOwner && apiKey) {
    if (!secret.allow_api_key_reveal) {
      await recordSecretAudit(audit, {
        operation: "secret.reveal",
        status: "denied",
        secretName: secret.name,
        reason: "reveal_not_permitted_for_api_key",
      });
      return c.json({ error: "Proxy Only: API keys are not permitted to reveal this secret's raw value." }, 403);
    }
  }

  // Decrypt the value
  try {
    const plaintext = await decryptSecret({
      encrypted_value: secret.encrypted_value,
      iv: secret.iv,
      auth_tag: secret.auth_tag,
    }, playbook.user_id, { playbookId: playbook.id, secretName: secret.name });

    // Update usage stats
    await supabase
      .from("secrets")
      .update({
        last_used_at: new Date().toISOString(),
        use_count: (secret.use_count || 0) + 1,
      })
      .eq("id", secret.id);

    await recordSecretAudit(audit, {
      operation: "secret.reveal",
      status: "success",
      secretName: secret.name,
    });

    return c.json({
      name: secret.name,
      value: plaintext,
      category: secret.category,
      expires_at: secret.expires_at,
    });
  } catch (err) {
    console.error("Failed to decrypt secret:", err);
    await recordSecretAudit(audit, {
      operation: "secret.reveal",
      status: "error",
      secretName: secret.name,
      reason: "decrypt_failed",
    });
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

  const playbook = await getPlaybookByGuid(guid, user?.id ?? null, apiKey?.playbooks.id ?? null);
  if (!playbook) return c.json({ error: "Playbook not found" }, 404);

  const isOwner = user && playbook.user_id === user.id;
  const isApiKeyForPlaybook = apiKey && apiKey.playbooks.id === playbook.id;
  const audit = auditContext(c, playbook.id, user, apiKey);

  const body = await c.req.json().catch(() => ({}));
  const { value, description, category, expires_at, allow_api_key_reveal, allowed_hosts } = body;

  // A new value makes this a rotation; anything else only edits metadata, and
  // the two are worth telling apart when reading the trail back.
  const operation = value && typeof value === "string" ? "secret.rotate" : "secret.update";

  if (!isOwner && !isApiKeyForPlaybook) {
    await recordSecretAudit(audit, {
      operation,
      status: "denied",
      secretName: name,
      reason: "not_authorized",
    });
    return c.json({ error: "Forbidden" }, 403);
  }

  const supabase = getServiceSupabase();

  // Find existing secret
  const { data: existing, error: findError } = await supabase
    .from("secrets")
    .select("id")
    .eq("playbook_id", playbook.id)
    .eq("name", name)
    .single();

  if (findError || !existing) {
    await recordSecretAudit(audit, {
      operation,
      status: "error",
      secretName: name,
      reason: "not_found",
    });
    return c.json({ error: "Secret not found" }, 404);
  }

  const updateData: SecretsUpdate = {
    updated_by: user?.id || apiKey?.key_prefix || null,
  };

  // If a new value is provided, re-encrypt with per-user key (rotation)
  if (value && typeof value === "string") {
    let encrypted: Awaited<ReturnType<typeof encryptSecret>>;
    try {
      encrypted = await encryptSecret(value, playbook.user_id, {
        playbookId: playbook.id,
        secretName: name,
      });
    } catch (err) {
      console.error("Secrets encryption failed during rotate:", err);
      await recordSecretAudit(audit, {
        operation,
        status: "error",
        secretName: name,
        reason: "encryption_failed",
      });
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
  if (allow_api_key_reveal !== undefined) updateData.allow_api_key_reveal = !!allow_api_key_reveal;
  if (allowed_hosts !== undefined) {
    updateData.allowed_hosts = allowed_hosts === null ? null : normalizeAllowedHosts(allowed_hosts);
  }

  const { data, error } = await supabase
    .from("secrets")
    .update(updateData)
    .eq("id", existing.id)
    .select()
    .single();

  if (error) {
    await recordSecretAudit(audit, {
      operation,
      status: "error",
      secretName: name,
      reason: "update_failed",
    });
    return c.json({ error: error.message }, 500);
  }

  await recordSecretAudit(audit, {
    operation,
    status: "success",
    secretName: name,
  });
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

  const audit = auditContext(c, playbook.id, user, null);
  if (playbook.user_id !== user.id) {
    await recordSecretAudit(audit, {
      operation: "secret.delete",
      status: "denied",
      secretName: name,
      reason: "not_authorized",
    });
    return c.json({ error: "Forbidden: only the owner can delete secrets" }, 403);
  }

  const supabase = getServiceSupabase();
  const { error } = await supabase
    .from("secrets")
    .delete()
    .eq("playbook_id", playbook.id)
    .eq("name", name);

  if (error) {
    await recordSecretAudit(audit, {
      operation: "secret.delete",
      status: "error",
      secretName: name,
      reason: "delete_failed",
    });
    return c.json({ error: error.message }, 500);
  }

  // The secret id is deliberately left out: the row it pointed at is gone, and
  // the name is what an investigation reads the trail by.
  await recordSecretAudit(audit, { operation: "secret.delete", status: "success", secretName: name });
  return c.json({ success: true });
});

// POST /api/playbooks/:guid/secrets/proxy - use a secret to make an HTTP request
// The secret value is injected server-side and NEVER returned to the caller.
app.post("/proxy", async (c) => {
  const guid = c.req.param("guid");
  if (!guid) return c.json({ error: "Missing playbook GUID" }, 400);

  const user = await getAuthenticatedUser(c.req.raw);
  const apiKey = !user ? await validateApiKey(c.req.raw, "secrets:read") : null;

  const playbook = await getPlaybookByGuid(guid, user?.id ?? null, apiKey?.playbooks.id ?? null);
  if (!playbook) return c.json({ error: "Playbook not found" }, 404);

  const isOwner = user && playbook.user_id === user.id;
  const isApiKeyForPlaybook = apiKey && apiKey.playbooks.id === playbook.id;
  const audit = auditContext(c, playbook.id, user, apiKey);
  if (!isOwner && !isApiKeyForPlaybook) {
    await recordSecretAudit(audit, { operation: "secret.use", status: "denied", reason: "not_authorized" });
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json();
  const { secret_name, url, method, header_name, header_prefix, body: reqBody, extra_headers, timeout_ms } = body;

  if (!secret_name || !url) {
    return c.json({ error: "secret_name and url are required" }, 400);
  }

  // Host only — see the note in _shared/audit.ts on why the rest of the
  // URL never reaches the log.
  const destinationHost = destinationHostOf(url);

  // SSRF protection
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return c.json({ error: "Only http and https URLs are allowed" }, 400);
    }
    if (parsed.username || parsed.password) {
      return c.json({ error: "Credentials in proxy URLs are not allowed" }, 400);
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
      await recordSecretAudit(audit, {
        operation: "secret.use",
        status: "denied",
        secretName: secret_name,
        target: destinationHost,
        reason: "private_destination",
      });
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
    await recordSecretAudit(audit, {
      operation: "secret.use",
      status: "error",
      secretName: secret_name,
      target: destinationHost,
      reason: "not_found",
    });
    return c.json({ error: `Secret '${secret_name}' not found` }, 404);
  }

  const destination = checkSecretDestination(url, secret.allowed_hosts);
  if (!destination.allowed) {
    await recordSecretAudit(audit, {
      operation: "secret.use",
      status: "denied",
      secretName: secret.name,
      target: destinationHost,
      reason: "destination_not_allowed",
    });
    return c.json({ error: destination.reason }, 403);
  }

  let secretValue: string;
  try {
    secretValue = await decryptSecret({
      encrypted_value: secret.encrypted_value,
      iv: secret.iv,
      auth_tag: secret.auth_tag,
    }, playbook.user_id, { playbookId: playbook.id, secretName: secret.name });
  } catch {
    await recordSecretAudit(audit, {
      operation: "secret.use",
      status: "error",
      secretName: secret.name,
      target: destinationHost,
      reason: "decrypt_failed",
    });
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
    // Never forward a credential-bearing request to a redirect target that has
    // not gone through the proxy URL checks.
    redirect: "manual",
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

    await recordSecretAudit(audit, {
      operation: "secret.use",
      status: "success",
      secretName: secret.name,
      target: destinationHost,
    });

    return c.json({
      status: proxyRes.status,
      status_text: proxyRes.statusText,
      body: responseBody,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Request failed";
    // The credential did leave the process, so this is an event even though the
    // request failed. The upstream message stays out of the row.
    await recordSecretAudit(audit, {
      operation: "secret.use",
      status: "error",
      secretName: secret.name,
      target: destinationHost,
      reason: "request_failed",
    });
    return c.json({ error: `HTTP request failed: ${msg}` }, 502);
  }
});

/**
 * POST /api/playbooks/:guid/secrets/oauth-exchange
 *
 * Completes a consent flow the CLI started. The CLI can obtain an authorization
 * code — that needs a browser — but it should not be what exchanges it: two
 * credentials pass through an exchange and both belong in the vault. The client
 * secret goes out with the request and never leaves this server; the refresh
 * token comes back and is written straight to the vault. The caller learns
 * whether it worked, and nothing else.
 */
app.post("/oauth-exchange", async (c) => {
  const guid = c.req.param("guid");
  if (!guid) return c.json({ error: "Missing playbook GUID" }, 400);

  // This writes a secret, so it needs write access rather than read.
  const user = await getAuthenticatedUser(c.req.raw);
  const apiKey = !user ? await validateApiKey(c.req.raw, "secrets:write") : null;

  const playbook = await getPlaybookByGuid(guid, user?.id ?? null, apiKey?.playbooks.id ?? null);
  if (!playbook) return c.json({ error: "Playbook not found" }, 404);

  const isOwner = user && playbook.user_id === user.id;
  const isApiKeyForPlaybook = apiKey && apiKey.playbooks.id === playbook.id;
  const audit = auditContext(c, playbook.id, user, apiKey);
  const operation = "secret.oauth_exchange";
  if (!isOwner && !isApiKeyForPlaybook) {
    await recordSecretAudit(audit, { operation, status: "denied", reason: "not_authorized" });
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const { template_id, code, code_verifier, redirect_uri, client_id } = body ?? {};

  const plan = planExchange(template_id);
  if (isPlanFailure(plan)) {
    await recordSecretAudit(audit, { operation, status: "error", reason: "bad_template" });
    return c.json({ error: plan.error }, plan.status as 400);
  }
  const destinationHost = destinationHostOf(plan.tokenUrl);

  for (const [field, value] of Object.entries({ code, code_verifier, client_id })) {
    if (typeof value !== "string" || value.length === 0) {
      return c.json({ error: `${field} is required.` }, 400);
    }
  }
  if (!isLoopbackRedirect(redirect_uri)) {
    return c.json({ error: "redirect_uri must be the loopback address the consent flow used." }, 400);
  }

  const supabase = getServiceSupabase();

  // The client secret is read here and never returned. If it is not in the vault
  // the order of operations is wrong, and saying so beats attempting an exchange
  // the provider would reject for a reason it will not explain.
  let clientSecret: string | null = null;
  if (plan.clientSecretName) {
    const { data: row } = await supabase
      .from("secrets")
      .select("*")
      .eq("playbook_id", playbook.id)
      .eq("name", plan.clientSecretName)
      .maybeSingle();
    if (!row) {
      await recordSecretAudit(audit, {
        operation,
        status: "error",
        secretName: plan.clientSecretName,
        target: destinationHost,
        reason: "client_secret_missing",
      });
      return c.json({
        error: `'${plan.clientSecretName}' is not in this playbook's vault. Store it first: `
          + `agentplaybooks secrets push ${plan.clientSecretName}`,
      }, 400);
    }
    // A host allow-list on the client secret is honoured against the token
    // endpoint, exactly as it would be for the secrets proxy.
    const allowed = checkSecretDestination(plan.tokenUrl, row.allowed_hosts);
    if (!allowed.allowed) {
      await recordSecretAudit(audit, {
        operation,
        status: "denied",
        secretName: plan.clientSecretName,
        target: destinationHost,
        reason: "destination_not_allowed",
      });
      return c.json({ error: allowed.reason }, 403);
    }
    try {
      clientSecret = await decryptSecret(
        { encrypted_value: row.encrypted_value, iv: row.iv, auth_tag: row.auth_tag },
        playbook.user_id,
        { playbookId: playbook.id, secretName: row.name },
      );
    } catch {
      await recordSecretAudit(audit, {
        operation,
        status: "error",
        secretName: plan.clientSecretName,
        reason: "decrypt_failed",
      });
      return c.json({ error: `Could not decrypt '${plan.clientSecretName}'.` }, 500);
    }
  }

  let exchange: ReturnType<typeof readExchangeResponse>;
  try {
    const response = await fetch(plan.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: buildExchangeBody({
        code,
        redirectUri: redirect_uri,
        clientId: client_id,
        clientSecret,
        codeVerifier: code_verifier,
      }),
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });
    exchange = readExchangeResponse(response.status, await response.json().catch(() => null));
  } catch {
    await recordSecretAudit(audit, {
      operation, status: "error", target: destinationHost, reason: "token_request_failed",
    });
    return c.json({ error: "Could not reach the provider's token endpoint." }, 502);
  }

  if (!exchange.ok) {
    await recordSecretAudit(audit, {
      operation, status: "error", target: destinationHost, reason: "exchange_rejected",
    });
    return c.json({ error: exchange.error }, exchange.status as 502);
  }

  let encrypted: Awaited<ReturnType<typeof encryptSecret>>;
  try {
    encrypted = await encryptSecret(exchange.refreshToken, playbook.user_id, {
      playbookId: playbook.id,
      secretName: plan.refreshSecretName,
    });
  } catch {
    await recordSecretAudit(audit, {
      operation, status: "error", secretName: plan.refreshSecretName, reason: "encryption_failed",
    });
    return c.json({ error: "Secrets vault is not configured correctly on the server." }, 500);
  }

  const { data: existing } = await supabase
    .from("secrets")
    .select("id")
    .eq("playbook_id", playbook.id)
    .eq("name", plan.refreshSecretName)
    .maybeSingle();

  const actor = user?.id || apiKey?.key_prefix || null;
  const stored = existing
    ? await supabase.from("secrets").update({
      encrypted_value: encrypted.encrypted_value,
      iv: encrypted.iv,
      auth_tag: encrypted.auth_tag,
      rotated_at: new Date().toISOString(),
      updated_by: actor,
    }).eq("id", existing.id)
    : await supabase.from("secrets").insert({
      playbook_id: playbook.id,
      name: plan.refreshSecretName,
      description: `${plan.template.name} refresh token (obtained by consent)`,
      category: "token",
      expires_at: null,
      // Never revealable: a refresh token exists to be spent server-side, and
      // nobody needs to read it back.
      allow_api_key_reveal: false,
      encrypted_value: encrypted.encrypted_value,
      iv: encrypted.iv,
      auth_tag: encrypted.auth_tag,
      // A refresh token is only ever sent back to the provider that issued it,
      // so it is pinned on the way in rather than left open.
      allowed_hosts: [destinationHost].filter((host): host is string => !!host),
      created_by: actor,
      updated_by: actor,
    });

  if (stored.error) {
    await recordSecretAudit(audit, {
      operation, status: "error", secretName: plan.refreshSecretName, reason: "store_failed",
    });
    return c.json({ error: stored.error.message }, 500);
  }

  await recordSecretAudit(audit, {
    operation,
    status: "success",
    secretName: plan.refreshSecretName,
    target: destinationHost,
  });

  // Deliberately no token in the response.
  return c.json({
    stored: plan.refreshSecretName,
    rotated: Boolean(existing),
    provider: plan.template.name,
  }, existing ? 200 : 201);
});

/**
 * GET /api/playbooks/:guid/secrets/oauth-exchange?template_id=gmail
 *
 * What the consent flow needs to know before it opens a browser: which client
 * id this playbook is configured with, and whether the client secret is already
 * in the vault.
 *
 * The client id is resolved here rather than asked of the caller because it
 * already lives in the MCP server's `transport_config.auth.client_id`, which is
 * where federation reads it at call time. Asking the CLI for it every run would
 * make the same value exist in two places and drift.
 *
 * It returns the client id in plain text, which is correct: a client id is
 * public — it travels in the authorize URL the user's browser opens. The client
 * secret is only ever reported as present or absent.
 */
app.get("/oauth-exchange", async (c) => {
  const guid = c.req.param("guid");
  if (!guid) return c.json({ error: "Missing playbook GUID" }, 400);

  const user = await getAuthenticatedUser(c.req.raw);
  const apiKey = !user ? await validateApiKey(c.req.raw, "secrets:read") : null;

  const playbook = await getPlaybookByGuid(guid, user?.id ?? null, apiKey?.playbooks.id ?? null);
  if (!playbook) return c.json({ error: "Playbook not found" }, 404);

  const isOwner = user && playbook.user_id === user.id;
  const isApiKeyForPlaybook = apiKey && apiKey.playbooks.id === playbook.id;
  if (!isOwner && !isApiKeyForPlaybook) return c.json({ error: "Forbidden" }, 403);

  const plan = planExchange(c.req.query("template_id"));
  if (isPlanFailure(plan)) return c.json({ error: plan.error }, plan.status as 400);

  const supabase = getServiceSupabase();
  const [{ data: servers }, { data: secretRows }] = await Promise.all([
    supabase.from("mcp_servers").select("transport_config").eq("playbook_id", playbook.id),
    supabase.from("secrets").select("name").eq("playbook_id", playbook.id),
  ]);
  const stored = new Set((secretRows ?? []).map((row) => row.name));

  return c.json({
    template_id: plan.template.id,
    provider: plan.template.name,
    client_id: resolveConfiguredClientId(servers, plan.template),
    client_secret_secret: plan.clientSecretName,
    client_secret_present: plan.clientSecretName ? stored.has(plan.clientSecretName) : null,
    refresh_secret: plan.refreshSecretName,
    refresh_secret_present: stored.has(plan.refreshSecretName),
  });
});

export { app };
