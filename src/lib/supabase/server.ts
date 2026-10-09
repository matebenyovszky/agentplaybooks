import { createServerClient } from "./client";

type ServerClient = ReturnType<typeof createServerClient>;
type CachedClient = { url: string; key: string; client: ServerClient };

let anonymousClient: CachedClient | null = null;
let serviceClient: CachedClient | null = null;

export function getServerAnonSupabase(): ServerClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required");
  }
  if (!anonymousClient || anonymousClient.url !== url || anonymousClient.key !== key) {
    anonymousClient = { url, key, client: createServerClient(url, key) };
  }
  return anonymousClient.client;
}

export function getServerServiceSupabase(): ServerClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for privileged database access");
  }
  if (!serviceClient || serviceClient.url !== url || serviceClient.key !== key) {
    serviceClient = { url, key, client: createServerClient(url, key) };
  }
  return serviceClient.client;
}
