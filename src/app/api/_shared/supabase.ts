import { createServerClient } from "@/lib/supabase/client";

type ServerClient = ReturnType<typeof createServerClient>;
type CachedClient = { url: string; key: string; client: ServerClient };

let anonymousClient: CachedClient | null = null;
let serviceClient: CachedClient | null = null;

export function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  if (!anonymousClient || anonymousClient.url !== url || anonymousClient.key !== key) {
    anonymousClient = { url, key, client: createServerClient(url, key) };
  }
  return anonymousClient.client;
}

export function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for privileged database access");
  }
  if (!serviceClient || serviceClient.url !== url || serviceClient.key !== key) {
    serviceClient = { url, key, client: createServerClient(url, key) };
  }
  return serviceClient.client;
}
