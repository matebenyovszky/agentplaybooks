// Sign-in options an instance actually offers. Supabase Auth (GoTrue) reports
// which providers are enabled at /auth/v1/settings, so a self-hosted instance
// with only email login, or only Microsoft Entra ID, shows just those instead
// of buttons that lead to an error page.

export type OAuthProviderId = "google" | "github" | "linkedin_oidc" | "azure";

export type OAuthProvider = {
  id: OAuthProviderId;
  label: string;
  // Microsoft Entra ID returns no email address unless it is asked for.
  scopes?: string;
};

// Display order on the login page.
export const OAUTH_PROVIDERS: readonly OAuthProvider[] = [
  { id: "azure", label: "Microsoft", scopes: "email" },
  { id: "google", label: "Google" },
  { id: "github", label: "GitHub" },
  { id: "linkedin_oidc", label: "LinkedIn" },
];

export type AuthSettings = {
  providers: OAuthProvider[];
  email: boolean;
  signup: boolean;
};

export function parseAuthSettings(raw: unknown): AuthSettings {
  const settings = (raw && typeof raw === "object" ? raw : {}) as {
    external?: Record<string, unknown>;
    disable_signup?: unknown;
  };
  const external = settings.external && typeof settings.external === "object" ? settings.external : {};
  return {
    providers: OAUTH_PROVIDERS.filter((provider) => external[provider.id] === true),
    email: external.email === true,
    signup: settings.disable_signup !== true,
  };
}

export async function fetchAuthSettings(
  supabaseUrl: string,
  anonKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AuthSettings | null> {
  try {
    const response = await fetchImpl(`${supabaseUrl.replace(/\/+$/, "")}/auth/v1/settings`, {
      headers: { apikey: anonKey },
    });
    if (!response.ok) return null;
    return parseAuthSettings(await response.json());
  } catch {
    return null;
  }
}
