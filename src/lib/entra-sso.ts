/**
 * Microsoft Entra ID single sign-on for desktop agents.
 *
 * The web app signs in through Supabase Auth's `azure` provider (a browser
 * redirect). A desktop agent cannot follow that redirect, so it signs in to
 * Entra ID itself (authorization code + PKCE on a loopback address, then
 * silent refresh) and hands the resulting ID token to this instance. Supabase
 * Auth verifies the token (signature, issuer, audience, expiry, nonce) and
 * issues an ordinary session for the same user the web login would produce.
 *
 * Both sides must use the same Entra app registration: the ID token's audience
 * has to be a client id Supabase Auth accepts for `azure`
 * (GOTRUE_EXTERNAL_AZURE_CLIENT_ID), and Entra's `sub` is per application, so a
 * second registration would yield a second identity for the same person.
 *
 * Configuration (server environment, not secrets):
 *   ENTRA_TENANT_ID  directory (tenant) id
 *   ENTRA_CLIENT_ID  application (client) id
 */

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ENTRA_SCOPES = ["openid", "profile", "email", "offline_access"] as const;

export type EntraConfig = {
  tenantId: string;
  clientId: string;
};

export function entraConfig(env: Record<string, string | undefined> = process.env): EntraConfig | null {
  const tenantId = env.ENTRA_TENANT_ID?.trim();
  const clientId = env.ENTRA_CLIENT_ID?.trim();
  if (!tenantId || !clientId || !GUID.test(tenantId) || !GUID.test(clientId)) return null;
  return { tenantId: tenantId.toLowerCase(), clientId: clientId.toLowerCase() };
}

/** What a desktop client needs to start the Entra sign-in. Public by design. */
export function publicEntraConfig(config: EntraConfig | null) {
  if (!config) return { enabled: false as const };
  return {
    enabled: true as const,
    tenant_id: config.tenantId,
    client_id: config.clientId,
    authority: `https://login.microsoftonline.com/${config.tenantId}/v2.0`,
    scopes: [...ENTRA_SCOPES],
  };
}

/**
 * The payload of a compact JWS, NOT verified. Used only to turn away a token
 * for another tenant or application before asking Supabase Auth, which does
 * the verification.
 */
export function unverifiedJwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) return null;
  try {
    const json = new TextDecoder().decode(
      Uint8Array.from(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0)),
    );
    const claims = JSON.parse(json);
    return claims && typeof claims === "object" && !Array.isArray(claims) ? claims : null;
  } catch {
    return null;
  }
}

/** Is this ID token (claims as read) addressed to this instance's tenant and app? */
export function idTokenMatches(claims: Record<string, unknown> | null, config: EntraConfig): boolean {
  if (!claims) return false;
  const aud = claims.aud;
  const audiences = Array.isArray(aud) ? aud : [aud];
  return typeof claims.tid === "string" && claims.tid.toLowerCase() === config.tenantId
    && audiences.some(value => typeof value === "string" && value.toLowerCase() === config.clientId);
}
