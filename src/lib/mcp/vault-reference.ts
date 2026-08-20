/** A transport config as the editor has it: parsed JSON, not yet validated. */
type TransportConfigDraft = Record<string, unknown>;


/**
 * Point a transport config's auth block at a vault secret by name.
 *
 * Which field a secret name belongs in depends on the auth type, so this is a
 * lookup rather than a single assignment. The important part is what it does
 * *not* do: an unrecognised auth type is left alone. An earlier version fell
 * through to `type = "bearer"`, which meant one click on an OAuth server
 * rewrote it as a bearer server and left `token_url`, `client_id` and
 * `refresh_token_secret` behind as dead fields on a config that no longer read
 * them — a silently broken connection, from a button whose job was to save
 * typing.
 *
 * `oauth2_refresh_token` takes the client secret here. The refresh token is not
 * something a person pastes: `agentplaybooks auth <provider>` obtains it and
 * writes it to the vault under the name the catalogue already fixed.
 */
const FIELD_BY_AUTH_TYPE: Record<string, string> = {
  api_key: "api_key_secret",
  bearer: "token_secret",
  oauth2_client_credentials: "client_secret",
  oauth2_refresh_token: "client_secret",
};

export function withVaultReference(
  config: TransportConfigDraft,
  secretName: string,
): TransportConfigDraft {
  const name = secretName.trim();
  if (!name) return config;

  const existing = config.auth && typeof config.auth === "object" && !Array.isArray(config.auth)
    ? config.auth
    : null;
  const auth: Record<string, unknown> = { ...(existing ?? {}) };

  const type = typeof auth.type === "string" ? auth.type : null;
  const field = type ? FIELD_BY_AUTH_TYPE[type] : null;

  if (field) {
    auth[field] = name;
  } else if (!type) {
    // No auth block yet: bearer is the common case and the safe default,
    // because there is no existing configuration to contradict.
    auth.type = "bearer";
    auth.token_secret = name;
  } else {
    // A type we do not have a field for. Guessing would corrupt it.
    return config;
  }

  return { ...config, auth };
}

/** Whether the button can do anything useful, so the UI can say why not. */
export function vaultReferenceTarget(config: TransportConfigDraft): string | null {
  const auth = config.auth && typeof config.auth === "object" && !Array.isArray(config.auth)
    ? config.auth as Record<string, unknown>
    : null;
  const type = auth && typeof auth.type === "string" ? auth.type : null;
  if (!type) return "token_secret";
  return FIELD_BY_AUTH_TYPE[type] ?? null;
}
