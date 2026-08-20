import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// Client-side Supabase client (for browser)
/**
 * One client per browser context, on purpose.
 *
 * This used to build a new one on every call, and every caller got its own
 * GoTrueClient writing the session under the same storage key — which the
 * library warns about by the dozen in the console ("Multiple GoTrueClient
 * instances detected... may produce undefined behavior when used
 * concurrently"). Two instances refreshing the same token concurrently is a
 * real race, not just noise.
 */
let browserClient: ReturnType<typeof createClient<Database>> | null = null;

export function createBrowserClient() {
  if (browserClient) return browserClient;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  browserClient = createClient<Database>(supabaseUrl, supabaseAnonKey);
  return browserClient;
}

// Server-side Supabase client (for API routes)
export function createServerClient(supabaseUrl: string, supabaseKey: string) {
  return createClient<Database>(supabaseUrl, supabaseKey);
}


