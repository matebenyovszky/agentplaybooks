import {
  buildAuthorizeUrl,
  interpretCallback,
  pkcePair,
  randomState,
  startCallbackServer,
} from "./oauth.js";

/**
 * `agentplaybooks auth <provider>` — the one-time consent step.
 *
 * The connection catalogue already says which templates need it and what to
 * name the resulting secret, so this reads the template rather than hard-coding
 * a provider list. Adding a provider is a catalogue entry, not a code change.
 *
 * Everything that talks to the outside world arrives as a parameter, so the
 * whole flow can be exercised without a browser or a network.
 */

export async function fetchTemplate(url, id, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl(`${url}/api/connections?id=${encodeURIComponent(id)}`, {
    headers: { Accept: "application/json" },
  });
  if (response.status === 404) {
    throw new Error(`No connection template '${id}'. List them with: curl ${url}/api/connections`);
  }
  if (!response.ok) {
    throw new Error(`Could not read the connection catalogue (HTTP ${response.status}).`);
  }
  return response.json();
}

/**
 * The pieces of a template this flow needs, with the reasons a template can be
 * unusable stated as errors rather than as undefined behaviour later.
 */
export function planConsent(template) {
  if (!template.requiresConsent) {
    throw new Error(
      `'${template.id}' does not need consent — its credential is a token you paste in. `
      + `Store it with: agentplaybooks secrets push ${template.secrets?.[0]?.name ?? "NAME"}`,
    );
  }
  const auth = template.transport_config?.auth ?? {};
  if (!template.authorization_url) {
    throw new Error(`'${template.id}' is missing authorization_url in the catalogue.`);
  }
  if (!auth.token_url) {
    throw new Error(`'${template.id}' is missing token_url in the catalogue.`);
  }
  const refreshSecretName = auth.refresh_token_secret;
  if (!refreshSecretName) {
    throw new Error(`'${template.id}' does not say which secret to store the refresh token as.`);
  }
  return {
    templateId: template.id,
    authorizationUrl: template.authorization_url,
    scopes: auth.scopes ?? [],
    extraParams: template.authorization_params ?? {},
    refreshSecretName,
    // client_id in the config is a placeholder name when the template expects
    // the user to supply their own app; it is not a secret either way.
    clientIdPlaceholder: auth.client_id ?? null,
    clientSecretName: auth.client_secret ?? null,
  };
}

/**
 * Run the consent flow and hand the authorization code to the server, which
 * completes the exchange.
 *
 * The CLI deliberately does not exchange the code itself. Doing so would put
 * two credentials on this machine — the client secret on the way out and the
 * refresh token on the way back — and both belong in the vault. What leaves
 * here is the code and the verifier, which are single-use and short-lived.
 */
export async function completeConsentViaServer(plan, {
  url,
  guid,
  playbookKey,
  clientId,
  openBrowser,
  fetchImpl = fetch,
  startServer = startCallbackServer,
  log = () => {},
  timeoutMs,
}) {
  const { verifier, challenge } = pkcePair();
  const state = randomState();
  const server = startServer(timeoutMs ? { timeoutMs } : {});

  try {
    const port = await server.ready;
    const redirectUri = `http://127.0.0.1:${port}/callback`;
    const authorizeUrl = buildAuthorizeUrl({
      authorizationUrl: plan.authorizationUrl,
      clientId,
      redirectUri,
      scopes: plan.scopes,
      state,
      challenge,
      extraParams: plan.extraParams,
    });

    log(`Opening your browser to ask ${plan.authorizationUrl} for consent.`);
    log(`If it does not open, visit:\n  ${authorizeUrl}`);
    await openBrowser(authorizeUrl);

    const query = await server.callback;
    const callback = interpretCallback(query, state);
    if (!callback.ok) throw new Error(callback.message);

    const response = await fetchImpl(`${url}/api/playbooks/${guid}/secrets/oauth-exchange`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${playbookKey}`,
      },
      body: JSON.stringify({
        template_id: plan.templateId,
        code: callback.code,
        code_verifier: verifier,
        redirect_uri: redirectUri,
        client_id: clientId,
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || `The server could not complete the exchange (HTTP ${response.status}).`);
    }
    return payload;
  } finally {
    server.close();
  }
}

/**
 * Ask the server what this playbook is already configured with.
 *
 * Two things come back that change what this command has to do: the client id
 * from the MCP server's config, so it need not be supplied on every run, and
 * whether the client secret is in the vault — which is worth knowing *before* a
 * browser opens, because a consent flow that ends in "the secret is missing"
 * wasted the user's trip to the provider.
 */
export async function fetchConnectionState(url, guid, playbookKey, templateId, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl(
    `${url}/api/playbooks/${guid}/secrets/oauth-exchange?template_id=${encodeURIComponent(templateId)}`,
    { headers: { Accept: "application/json", Authorization: `Bearer ${playbookKey}` } },
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || `Could not read the connection state (HTTP ${response.status}).`);
  }
  return payload;
}

/**
 * Decide where the client id comes from, in the order that respects intent: an
 * explicit flag first, then the environment, then what the playbook is already
 * configured with, and only then a prompt.
 *
 * The configured value comes third rather than first so `--client-id` can still
 * override it — testing a second OAuth app should not require editing the
 * server config first.
 */
export function chooseClientId({ flagValue, envValue, configured }) {
  const explicit = [flagValue, envValue].find((value) => typeof value === "string" && value.trim());
  if (explicit) return { clientId: explicit.trim(), source: flagValue === explicit ? "flag" : "environment" };
  if (typeof configured === "string" && configured.trim()) {
    return { clientId: configured.trim(), source: "playbook" };
  }
  return { clientId: null, source: "prompt" };
}

/**
 * A missing client secret is stated here rather than discovered by the server
 * after consent, so the user runs one command instead of a browser round-trip.
 */
export function checkPrerequisites(state) {
  if (state?.client_secret_secret && state.client_secret_present === false) {
    return `'${state.client_secret_secret}' is not in this playbook's vault yet. `
      + `The exchange needs it, so store it first:\n  agentplaybooks secrets push ${state.client_secret_secret}`;
  }
  return null;
}
