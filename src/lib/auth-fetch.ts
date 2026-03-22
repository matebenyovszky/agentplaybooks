import { createBrowserClient } from "@/lib/supabase/client";

/**
 * Fetch wrapper that injects the Supabase auth token into the Authorization header.
 * Use this instead of raw fetch() for all authenticated API calls from the browser.
 */
export async function authFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const supabase = createBrowserClient();
  const { data: { session } } = await supabase.auth.getSession();

  const headers = new Headers(init.headers);

  if (session?.access_token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  return fetch(url, {
    ...init,
    headers,
    credentials: "same-origin",
  });
}
