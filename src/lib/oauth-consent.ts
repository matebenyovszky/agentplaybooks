export function buildOAuthConsentReturnPath(authorizationId: string): string {
  const params = new URLSearchParams({ authorization_id: authorizationId });
  return `/oauth/consent?${params.toString()}`;
}

export function formatOAuthScope(scope: string): string {
  const labels: Record<string, string> = {
    openid: "Verify your identity",
    profile: "Read your basic profile",
    email: "Read your email address",
  };

  return labels[scope] ?? scope;
}

export function getOAuthClientHost(uri: string): string | null {
  try {
    return new URL(uri).host || null;
  } catch {
    return null;
  }
}
