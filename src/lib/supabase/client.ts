import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// Client-side Supabase client (for browser)
export function createBrowserClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  
  return createClient<Database>(supabaseUrl, supabaseAnonKey);
}

// Server-side Supabase client (for API routes)
export function createServerClient(supabaseUrl: string, supabaseKey: string) {
  return createClient<Database>(supabaseUrl, supabaseKey);
}


