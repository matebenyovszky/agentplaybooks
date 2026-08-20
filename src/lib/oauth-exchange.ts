import { connectionTemplate, type ConnectionTemplate } from "@/lib/connection-catalogue";

/**
 * Server-side completion of an OAuth consent flow.
 *
 * The CLI can obtain an authorization code — that needs a browser — but it
 * should not be the thing that exchanges it. Two credentials pass through an
 * exchange and both belong in the vault rather than on a developer's machine:
 * the client secret goes out with the request, and the refresh token comes back
 * in the response. `use_secret` is the wrong shape for this precisely because it
 * returns the response to its caller, and here the response *is* the credential.
 *
 * So the exchange happens here, and the refresh token is written straight to the
 * vault. The caller learns whether it worked and nothing else.
 */

export type ExchangePlan = {
  template: ConnectionTemplate;
  tokenUrl: string;
  clientSecretName: string | null;
  refreshSecretName: string;
};

export type PlanFailure = { ok: false; status: number; error: string };

/**
 * Resolve what an exchange for this template involves.
 *
 * The token URL is read from the catalogue by template id and is *never* taken
 * from the request. A caller-supplied token URL would make this endpoint hand
 * the client secret to any address the caller names — the same arbitrary-
 * destination shape that `allowed_hosts` exists to close on the secrets proxy.
 */
export function planExchange(templateId: unknown): ExchangePlan | PlanFailure {
  if (typeof templateId !== "string" || templateId.length === 0) {
    return { ok: false, status: 400, error: "template_id is required." };
  }
  const template = connectionTemplate(templateId);
  if (!template) {
    return { ok: false, status: 404, error: `No connection template '${templateId}'.` };
  }
  if (!template.requiresConsent) {
    return {
      ok: false,
      status: 400,
      error: `'${templateId}' does not use a consent flow, so there is no code to exchange.`,
    };
  }
  const auth = template.transport_config.auth ?? {};
  if (!auth.token_url) {
    return { ok: false, status: 500, error: `'${templateId}' has no token_url in the catalogue.` };
  }
  if (!auth.refresh_token_secret) {
    return {
      ok: false,
      status: 500,
      error: `'${templateId}' does not say which secret to store the refresh token as.`,
    };
  }
  return {
    template,
    tokenUrl: auth.token_url,
    clientSecretName: auth.client_secret ?? null,
    refreshSecretName: auth.refresh_token_secret,
  };
}

export function isPlanFailure(plan: ExchangePlan | PlanFailure): plan is PlanFailure {
  return (plan as PlanFailure).ok === false;
}

/**
 * A redirect URI is echoed to the provider, which compares it against the one
 * the authorize request used. It is not an address this server contacts, but it
 * is only ever a loopback address in this flow — anything else means the caller
 * is not running the CLI's consent flow, and refusing is cheaper than wondering.
 */
export function isLoopbackRedirect(value: unknown): boolean {
  if (typeof value !== "string") return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "http:") return false;
  return url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]";
}

/** The form body a token endpoint expects. Form-encoded, not JSON. */
export function buildExchangeBody({
  code,
  redirectUri,
  clientId,
  clientSecret,
  codeVerifier,
}: {
  code: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string | null;
  codeVerifier: string;
}): URLSearchParams {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: codeVerifier,
  });
  // A public PKCE client has none, and some providers reject an empty value
  // rather than ignoring it.
  if (clientSecret) body.set("client_secret", clientSecret);
  return body;
}

export type ExchangeOutcome =
  | { ok: true; refreshToken: string }
  | { ok: false; status: number; error: string };

/**
 * Read the provider's answer.
 *
 * A response carrying an access token but no refresh token is the failure people
 * actually hit, and it is silent — the exchange succeeded, the thing that was
 * needed is simply absent. Naming it here beats surfacing it later as a missing
 * secret at call time.
 *
 * On failure only the provider's named error fields are reported: the body can
 * echo the authorization code, and this text reaches a client.
 */
export function readExchangeResponse(status: number, payload: unknown): ExchangeOutcome {
  const body = (payload ?? {}) as Record<string, unknown>;
  if (status < 200 || status >= 300) {
    const detail = typeof body.error_description === "string"
      ? body.error_description
      : typeof body.error === "string"
        ? body.error
        : `HTTP ${status}`;
    return { ok: false, status: 502, error: `The provider refused the exchange: ${detail}` };
  }
  const refreshToken = typeof body.refresh_token === "string" ? body.refresh_token : null;
  if (!refreshToken) {
    return {
      ok: false,
      status: 502,
      error:
        "The provider returned an access token but no refresh token. Most often the authorize "
        + "request needs access_type=offline, or the provider only issues one on first consent — "
        + "revoke the app's access and try again.",
    };
  }
  return { ok: true, refreshToken };
}

/**
 * Find the client id the playbook is already configured with.
 *
 * `client_id` is not a secret — it is public by design, it travels in the
 * authorize URL the user's browser opens — so it does not belong in the vault.
 * Putting it there would mean encrypting a public value and then needing a
 * `reveal` just to build a URL, which is the shape this flow exists to avoid.
 *
 * It already has a home: federation reads it from the MCP server's
 * `transport_config.auth.client_id` at call time. So this reads the same field,
 * which keeps one source of truth instead of adding a second.
 *
 * A template ships a placeholder there (`GOOGLE_CLIENT_ID`) to show the user
 * what to fill in. A server still carrying the placeholder is unconfigured, not
 * configured with a client id that happens to look like a name.
 */
export function resolveConfiguredClientId(
  servers: Array<{ transport_config?: unknown } | null | undefined> | null | undefined,
  template: ConnectionTemplate,
): string | null {
  const wantedTokenUrl = template.transport_config.auth?.token_url;
  if (!wantedTokenUrl) return null;
  const placeholder = template.transport_config.auth?.client_id ?? null;

  for (const server of servers ?? []) {
    const config = server?.transport_config;
    if (!config || typeof config !== "object") continue;
    const auth = (config as { auth?: unknown }).auth;
    if (!auth || typeof auth !== "object") continue;
    const { token_url: tokenUrl, client_id: clientId } = auth as Record<string, unknown>;
    if (tokenUrl !== wantedTokenUrl) continue;
    if (typeof clientId !== "string" || clientId.length === 0) continue;
    if (clientId === placeholder) continue;
    return clientId;
  }
  return null;
}
