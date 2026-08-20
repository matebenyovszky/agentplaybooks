/**
 * Which secret names a federated server's transport config resolves at call
 * time. Shared between the server-side resolver (to know what to look up) and
 * the dashboard editor (to show where each referenced name will come from).
 */

export type FederationAuthConfig = {
  type?: string;
  token_secret?: string;
  api_key_secret?: string;
  client_secret?: string;
  client_id?: string;
};

export function referencedSecretNames(transportConfig: unknown): string[] {
  const config = transportConfig as { auth?: FederationAuthConfig } | null | undefined;
  const auth = config?.auth;
  if (!auth || !auth.type || auth.type === "none") return [];
  if (auth.type === "bearer") return [auth.token_secret || "token"];
  if (auth.type === "api_key") return [auth.api_key_secret || "api_key"];
  if (auth.type === "oauth2_client_credentials") {
    const names = [auth.client_secret || "client_secret"];
    if (!auth.client_id) names.push("client_id");
    return names;
  }
  return [];
}
