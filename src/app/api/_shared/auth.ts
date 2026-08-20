import { hashApiKey } from "@/lib/utils";
import { getServiceSupabase, getSupabase } from "./supabase";
import type { ApiKey, UserApiKeysRow } from "@/lib/supabase/types";
import { getPlaybookAccessRole } from "./guards";

type ApiKeyWithPlaybook = ApiKey & {
  playbooks: { id: string; guid: string };
};

type UserApiKeyData = UserApiKeysRow & { user_id: string };

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
  const supabase = getSupabase();

  if (request) {
    const authHeader = request.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ") && !authHeader.startsWith("Bearer apb_")) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (!error && user) {
        return { id: user.id };
      }
    }
  }

  return null;
}

export async function requireAuth(request: Request): Promise<{ id: string } | null> {
  const user = await getAuthenticatedUser(request);
  return user || null;
}

/**
 * The API key can arrive in either of two headers.
 *
 * `Authorization: Bearer apb_…` is the documented one. `X-API-Key` exists
 * because a client may reserve `Authorization` for its own authentication
 * handling, and then the operator has nowhere to put the key and no way to tell
 * that is what happened: the connection establishes, every listing comes back
 * empty, and refreshing it fails. A credential that never arrives looks exactly
 * like a server with nothing to offer.
 *
 * A `Bearer ` prefix is accepted in `X-API-Key` too — anyone copying the
 * documented value brings the scheme along with it, and rejecting that would
 * reproduce the same silent emptiness.
 */
export function presentedApiKey(request: Request): string | null {
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer apb_")) {
    return authHeader.slice("Bearer ".length).trim();
  }

  const raw = request.headers.get("X-API-Key")?.trim();
  if (!raw) return null;
  const value = raw.startsWith("Bearer ") ? raw.slice("Bearer ".length).trim() : raw;
  return value.startsWith("apb_") ? value : null;
}

export async function validateApiKey(
  request: Request,
  requiredPermission: string
): Promise<ApiKeyWithPlaybook | null> {
  const apiKey = presentedApiKey(request);
  if (!apiKey) {
    return null;
  }

  const keyHash = await hashApiKey(apiKey);
  const supabase = getServiceSupabase();
  const { data: apiKeyData, error } = await supabase
    .from("api_keys")
    .select("*")
    .eq("key_hash", keyHash)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !apiKeyData) {
    return null;
  }

  if (apiKeyData.expires_at && new Date(apiKeyData.expires_at) < new Date()) {
    return null;
  }

  if (apiKeyData.role === 'admin') {
    // Admin has full access
  } else if (!apiKeyData.permissions.includes(requiredPermission) && !apiKeyData.permissions.includes("full")) {
    return null;
  }

  const { data: playbook, error: playbookError } = await supabase
    .from("playbooks")
    .select("id, guid")
    .eq("id", apiKeyData.playbook_id)
    .maybeSingle();

  if (playbookError || !playbook) {
    return null;
  }

  await supabase
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", apiKeyData.id);

  return { ...apiKeyData, playbooks: playbook } as ApiKeyWithPlaybook;
}

export async function validateUserApiKey(
  request: Request,
  requiredPermission?: string
): Promise<UserApiKeyData | null> {
  const apiKey = presentedApiKey(request);
  if (!apiKey) {
    return null;
  }

  const keyHash = await hashApiKey(apiKey);
  const supabase = getServiceSupabase();
  const { data: userKeyData, error } = await supabase
    .from("user_api_keys")
    .select("*")
    .eq("key_hash", keyHash)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !userKeyData) {
    return null;
  }

  if (userKeyData.expires_at && new Date(userKeyData.expires_at) < new Date()) {
    return null;
  }

  if (
    requiredPermission
    && !userKeyData.permissions.includes(requiredPermission)
    && !userKeyData.permissions.includes("full")
  ) {
    return null;
  }

  await supabase
    .from("user_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", userKeyData.id);

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
