import { hashApiKey } from "@/lib/utils";
import { presentedApiKey } from "./api-key-header";
import { getServiceSupabase, getSupabase } from "./supabase";
import type { ApiKey, UserApiKeysRow } from "@/lib/supabase/types";
import { getPlaybookAccessRole } from "./guards";

type ApiKeyWithPlaybook = ApiKey & {
  playbooks: { id: string; guid: string };
};

type UserApiKeyData = UserApiKeysRow & { user_id: string };

// A single MCP invocation may check discovery access and then a tool-specific
// permission. Share lookups only within that Request so revocation still takes
// effect on the next invocation.
const playbookKeyLookups = new WeakMap<Request, Promise<ApiKey | null>>();
const playbookLookups = new WeakMap<Request, Promise<{ id: string; guid: string } | null>>();
const userKeyLookups = new WeakMap<Request, Promise<UserApiKeyData | null>>();
const userLookups = new WeakMap<Request, Promise<{ id: string } | null>>();
const keyHashes = new WeakMap<Request, Promise<string | null>>();
const usageUpdates = new WeakMap<Request, Map<string, Promise<void>>>();
const LAST_USE_INTERVAL_MS = 60_000;

function keyHashForRequest(request: Request): Promise<string | null> {
  const cached = keyHashes.get(request);
  if (cached) return cached;
  const apiKey = presentedApiKey(request);
  const hash = apiKey ? hashApiKey(apiKey) : Promise.resolve(null);
  keyHashes.set(request, hash);
  return hash;
}

function recordKeyUse(
  request: Request,
  table: "api_keys" | "user_api_keys",
  id: string,
  lastUsedAt: string | null,
): Promise<void> {
  const now = Date.now();
  if (lastUsedAt && now - Date.parse(lastUsedAt) < LAST_USE_INTERVAL_MS) return Promise.resolve();
  let updates = usageUpdates.get(request);
  if (!updates) {
    updates = new Map();
    usageUpdates.set(request, updates);
  }
  const cacheKey = `${table}:${id}`;
  let update = updates.get(cacheKey);
  if (!update) {
    update = (async () => {
      await getServiceSupabase().from(table)
        .update({ last_used_at: new Date(now).toISOString() })
        .eq("id", id);
    })();
    updates.set(cacheKey, update);
  }
  return update;
}

function lookupPlaybookKey(request: Request): Promise<ApiKey | null> {
  const cached = playbookKeyLookups.get(request);
  if (cached) return cached;
  const lookup = (async () => {
    const keyHash = await keyHashForRequest(request);
    if (!keyHash) return null;
    const { data, error } = await getServiceSupabase().from("api_keys")
      .select("*").eq("key_hash", keyHash).eq("is_active", true).maybeSingle();
    if (error || !data || (data.expires_at && Date.parse(data.expires_at) <= Date.now())) return null;
    return data as ApiKey;
  })();
  playbookKeyLookups.set(request, lookup);
  return lookup;
}

function lookupUserKey(request: Request): Promise<UserApiKeyData | null> {
  const cached = userKeyLookups.get(request);
  if (cached) return cached;
  const lookup = (async () => {
    const keyHash = await keyHashForRequest(request);
    if (!keyHash) return null;
    const { data, error } = await getServiceSupabase().from("user_api_keys")
      .select("*").eq("key_hash", keyHash).eq("is_active", true).maybeSingle();
    if (error || !data || (data.expires_at && Date.parse(data.expires_at) <= Date.now())) return null;
    return data as UserApiKeyData;
  })();
  userKeyLookups.set(request, lookup);
  return lookup;
}

export type PlaybookRequestActor = {
  kind: "playbook_key" | "user_key" | "session";
  playbookId: string;
  userId: string | null;
  keyPrefix: string | null;
};

export type PlaybookCredential = PlaybookRequestActor & {
  key_prefix: string;
  playbooks: { id: string; guid: string };
};

/**
 * Resolve the signed-in user from the request's bearer token.
 *
 * The browser keeps its Supabase session in localStorage and sends it as an
 * Authorization header (see `src/lib/auth-fetch.ts`); nothing in this app ever
 * writes `sb-access-token` / `sb-refresh-token` cookies. A cookie branch used
 * to be read here, which meant any co-hosted app or proxy able to set a cookie
 * on this domain could impersonate a user. It has been removed.
 */
export async function getAuthenticatedUser(request?: Request): Promise<{ id: string } | null> {
  if (!request) return null;
  const cached = userLookups.get(request);
  if (cached) return cached;
  const lookup = (async () => {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ") || authHeader.startsWith("Bearer apb_")) return null;
    const token = authHeader.slice("Bearer ".length);
    const { data: { user }, error } = await getSupabase().auth.getUser(token);
    return !error && user ? { id: user.id } : null;
  })();
  userLookups.set(request, lookup);
  return lookup;
}

export async function requireAuth(request: Request): Promise<{ id: string } | null> {
  const user = await getAuthenticatedUser(request);
  return user || null;
}

// Which headers may carry a key, and in what forms, lives in one place — see
// api-key-header.ts for why the `Bearer` prefix is optional.
export { presentedApiKey };

export async function validateApiKey(
  request: Request,
  requiredPermission: string
): Promise<ApiKeyWithPlaybook | null> {
  const apiKeyData = await lookupPlaybookKey(request);
  if (!apiKeyData) return null;

  if (apiKeyData.role === 'admin') {
    // Admin has full access
  } else if (!apiKeyData.permissions.includes(requiredPermission) && !apiKeyData.permissions.includes("full")) {
    return null;
  }

  let playbookLookup = playbookLookups.get(request);
  if (!playbookLookup) {
    playbookLookup = (async () => {
      const { data, error } = await getServiceSupabase().from("playbooks")
        .select("id, guid").eq("id", apiKeyData.playbook_id).maybeSingle();
      return error ? null : data;
    })();
    playbookLookups.set(request, playbookLookup);
  }
  const playbook = await playbookLookup;
  if (!playbook) return null;

  await recordKeyUse(request, "api_keys", apiKeyData.id, apiKeyData.last_used_at);

  return { ...apiKeyData, playbooks: playbook } as ApiKeyWithPlaybook;
}

export async function validateUserApiKey(
  request: Request,
  requiredPermission?: string
): Promise<UserApiKeyData | null> {
  const userKeyData = await lookupUserKey(request);
  if (!userKeyData) return null;

  if (
    requiredPermission
    && !userKeyData.permissions.includes(requiredPermission)
    && !userKeyData.permissions.includes("full")
  ) {
    return null;
  }

  await recordKeyUse(request, "user_api_keys", userKeyData.id, userKeyData.last_used_at);

  return userKeyData as UserApiKeyData;
}

export async function getUserFromAuthOrApiKey(
  request: Request,
  requiredPermission: string
): Promise<{ id: string } | null> {
  const user = await getAuthenticatedUser(request);
  if (user) {
    return user;
  }

  const userApiKey = await validateUserApiKey(request, requiredPermission);
  if (userApiKey) {
    return { id: userApiKey.user_id };
  }

  return null;
}

/**
 * Authorize one playbook operation independently of the transport that
 * exposed it. A direct playbook key, a user control-plane key, or a dashboard
 * session can therefore invoke the same operation implementation.
 */
export async function authorizePlaybookRequest(
  request: Request,
  playbookId: string,
  requiredPermission: string,
): Promise<PlaybookRequestActor | null> {
  const playbookKey = await validateApiKey(request, requiredPermission);
  if (playbookKey?.playbooks.id === playbookId) {
    return {
      kind: "playbook_key",
      playbookId,
      userId: null,
      keyPrefix: playbookKey.key_prefix,
    };
  }

  const userKey = await validateUserApiKey(request, requiredPermission);
  if (userKey && await getPlaybookAccessRole(userKey.user_id, playbookId)) {
    return {
      kind: "user_key",
      playbookId,
      userId: userKey.user_id,
      keyPrefix: userKey.key_prefix,
    };
  }

  const user = await getAuthenticatedUser(request);
  if (user && await getPlaybookAccessRole(user.id, playbookId)) {
    return {
      kind: "session",
      playbookId,
      userId: user.id,
      keyPrefix: null,
    };
  }

  return null;
}

/** Resolve a path-bound playbook and authorize either kind of API key. */
export async function validatePlaybookCredential(
  request: Request,
  identifier: string,
  requiredPermission: string,
): Promise<PlaybookCredential | null> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
  let query = getServiceSupabase().from("playbooks").select("id, guid");
  query = isUuid ? query.eq("id", identifier) : query.eq("guid", identifier);
  const { data: playbook } = await query.maybeSingle();
  if (!playbook) return null;

  const actor = await authorizePlaybookRequest(request, playbook.id, requiredPermission);
  if (!actor) return null;

  return {
    ...actor,
    key_prefix: actor.keyPrefix || `session:${actor.userId || "unknown"}`,
    playbooks: playbook,
  };
}

/**
 * Private playbook discovery needs only enough identity to prove that the
 * credential belongs to this playbook/user. The concrete operation performs
 * its own scoped permission check afterwards.
 */
export async function canAccessPrivatePlaybook(
  request: Request,
  playbookId: string,
): Promise<boolean> {
  const playbookKey = await validateApiKey(request, "memory:read");
  if (playbookKey?.playbooks.id === playbookId) return true;

  const userKey = await validateUserApiKey(request, "playbooks:read");
  if (userKey && await getPlaybookAccessRole(userKey.user_id, playbookId)) return true;

  const user = await getAuthenticatedUser(request);
  return !!user && !!await getPlaybookAccessRole(user.id, playbookId);
}
