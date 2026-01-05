import { cookies } from "next/headers";
import { hashApiKey } from "@/lib/utils";
import { getSupabase, getServiceSupabase } from "./supabase";
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
  } catch (error) {
    console.log("Cookie auth failed, trying header...", error);
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

  if (apiKeyData.expires_at && new Date(apiKeyData.expires_at) < new Date()) {
    return null;
  }

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

  await supabase
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", apiKeyData.id);

  return { ...apiKeyData, playbooks: playbook };
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
  const supabase = getServiceSupabase();

  const { data: userKeyData } = await supabase
    .from("user_api_keys")
    .select("*")
    .eq("key_hash", keyHash)
    .eq("is_active", true)
    .single();

  if (!userKeyData) {
    return null;
  }

  if (userKeyData.expires_at && new Date(userKeyData.expires_at) < new Date()) {
    return null;
  }

  if (!userKeyData.permissions.includes(requiredPermission) && !userKeyData.permissions.includes("full")) {
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
