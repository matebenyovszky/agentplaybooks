import { cookies } from "next/headers";
import { hashApiKey } from "@/lib/utils";
import { getSupabase, getDb } from "./supabase";
import { schema } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import type { ApiKey, UserApiKeysRow } from "@/lib/supabase/types";

type ApiKeyWithPlaybook = ApiKey & {
  playbooks: { id: string; guid: string };
};

type UserApiKeyData = UserApiKeysRow & { user_id: string };

export async function getAuthenticatedUser(request?: Request): Promise<{ id: string } | null> {
  const supabase = getSupabase();

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
  } catch {
    // Cookie parsing may fail in some environments (e.g. Cloudflare)
    // Fall through to header-based auth
  }

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

export async function validateApiKey(
  request: Request,
  requiredPermission: string
): Promise<ApiKeyWithPlaybook | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer apb_")) {
    return null;
  }

  const apiKey = authHeader.replace("Bearer ", "");
  const keyHash = await hashApiKey(apiKey);
  const db = getDb();

  const [apiKeyData] = await db
    .select()
    .from(schema.apiKeys)
    .where(and(eq(schema.apiKeys.key_hash, keyHash), eq(schema.apiKeys.is_active, true)))
    .limit(1);

  if (!apiKeyData) {
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

  const [playbook] = await db
    .select({ id: schema.playbooks.id, guid: schema.playbooks.guid })
    .from(schema.playbooks)
    .where(eq(schema.playbooks.id, apiKeyData.playbook_id))
    .limit(1);

  if (!playbook) {
    return null;
  }

  await db
    .update(schema.apiKeys)
    .set({ last_used_at: new Date() })
    .where(eq(schema.apiKeys.id, apiKeyData.id));

  // Typecasting back to expected Supabase interface type to avoid rewriting the rest of the application
  return { ...apiKeyData, playbooks: playbook } as unknown as ApiKeyWithPlaybook;
}

export async function validateUserApiKey(
  request: Request,
  requiredPermission: string
): Promise<UserApiKeyData | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer apb_")) {
    return null;
  }

  const apiKey = authHeader.replace("Bearer ", "");
  const keyHash = await hashApiKey(apiKey);
  const db = getDb();

  const [userKeyData] = await db
    .select()
    .from(schema.userApiKeys)
    .where(and(eq(schema.userApiKeys.key_hash, keyHash), eq(schema.userApiKeys.is_active, true)))
    .limit(1);

  if (!userKeyData) {
    return null;
  }

  if (userKeyData.expires_at && new Date(userKeyData.expires_at) < new Date()) {
    return null;
  }

  if (!userKeyData.permissions.includes(requiredPermission) && !userKeyData.permissions.includes("full")) {
    return null;
  }

  await db
    .update(schema.userApiKeys)
    .set({ last_used_at: new Date() })
    .where(eq(schema.userApiKeys.id, userKeyData.id));

  return userKeyData as unknown as UserApiKeyData;
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
