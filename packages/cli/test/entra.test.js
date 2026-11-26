import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { entraAccessToken, entraSession, exchangeIdToken, fileStore, jwtClaims, loginWithEntra, logoutEntra } from "../src/entra.js";
import { createMcpRelay } from "../src/mcp-stdio.js";

const URL_BASE = "https://apbks.example.test";
const TENANT = "11111111-1111-4111-8111-111111111111";
const CLIENT = "22222222-2222-4222-8222-222222222222";

const b64 = value => Buffer.from(JSON.stringify(value)).toString("base64url");
const jwt = claims => `${b64({ alg: "none" })}.${b64(claims)}.sig`;

function memoryStore() {
  const data = new Map();
  return {
    data,
    async load(url) { return data.get(url) ?? null; },
    async save(url, state) { data.set(url, structuredClone(state)); },
    async remove(url) { return data.delete(url); },
  };
}

/** Entra ID + the instance, as fetch sees them. */
function fakeServices({ refreshError } = {}) {
  const calls = [];
  let issued = 0;
  let authorizeNonce = null;
  const fetchImpl = async (url, init = {}) => {
    const href = String(url);
    calls.push({ href, init });
    const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (href === `${URL_BASE}/api/auth/entra` && !init.method) {
      return reply(200, { enabled: true, tenant_id: TENANT, client_id: CLIENT, scopes: ["openid", "profile", "email", "offline_access"] });
    }
    if (href === `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`) {
      const form = new URLSearchParams(init.body);
      assert.equal(form.get("client_id"), CLIENT);
      assert.equal(form.has("client_secret"), false, "a public client sends no secret");
      if (form.get("grant_type") === "refresh_token" && refreshError) return reply(400, { error: refreshError, error_description: "AADSTS50173: expired" });
      issued++;
      const claims = { aud: CLIENT, tid: TENANT, email: "kolléga@example.test", ...(form.get("grant_type") === "authorization_code" ? { nonce: authorizeNonce } : {}) };
      return reply(200, { id_token: jwt(claims), refresh_token: `entra-refresh-${issued}` });
    }
    if (href === `${URL_BASE}/api/auth/entra` && init.method === "POST") {
      const body = JSON.parse(init.body);
      const claims = jwtClaims(body.id_token);
      if (claims.nonce) assert.equal(crypto.createHash("sha256").update(body.nonce).digest("hex"), claims.nonce);
      else assert.equal(body.nonce, undefined);
      return reply(200, { access_token: `apb-session-${issued}`, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: "u1", email: claims.email } });
    }
    return reply(404, {});
  };
  return { fetchImpl, calls, setNonce: nonce => { authorizeNonce = nonce; } };
}

test("browser sign-in: PKCE + nonce on a loopback redirect, then the ID token is exchanged", async () => {
  const services = fakeServices();
  const store = memoryStore();
  const openBrowser = async authorizeUrl => {
    const url = new URL(authorizeUrl);
    assert.equal(url.origin + url.pathname, `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize`);
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    assert.match(url.searchParams.get("scope"), /offline_access/);
    assert.match(url.searchParams.get("redirect_uri"), /^http:\/\/localhost:\d+\/$/);
    services.setNonce(url.searchParams.get("nonce"));
    // What Edge does after the silent Windows sign-in.
    const redirect = new URL(url.searchParams.get("redirect_uri"));
    redirect.hostname = "127.0.0.1";
    redirect.searchParams.set("code", "auth-code");
    redirect.searchParams.set("state", url.searchParams.get("state"));
    await fetch(redirect);
  };
  const saved = await loginWithEntra(URL_BASE, { fetchImpl: services.fetchImpl, openBrowser, store, timeoutMs: 5000 });
  assert.equal(saved.user.email, "kolléga@example.test");
  assert.equal(saved.refresh_token, "entra-refresh-1");
  assert.equal(await entraAccessToken(URL_BASE, { fetchImpl: services.fetchImpl, store }), "apb-session-1");
});

test("an expiring access token is renewed silently through Entra ID", async () => {
  const services = fakeServices();
  const store = memoryStore();
  await store.save(URL_BASE, { tenant_id: TENANT, client_id: CLIENT, scopes: ["openid"], refresh_token: "old", nonce: "n", access_token: "stale", expires_at: Math.floor(Date.now() / 1000) + 30 });
  const session = await entraSession(URL_BASE, { fetchImpl: services.fetchImpl, store });
  assert.equal(session.access_token, "apb-session-1");
  assert.equal(store.data.get(URL_BASE).refresh_token, "entra-refresh-1", "the rotated Entra refresh token is kept");
  // Still valid now: no further network traffic.
  const before = services.calls.length;
  await entraAccessToken(URL_BASE, { fetchImpl: services.fetchImpl, store });
  assert.equal(services.calls.length, before);
});

test("a revoked Entra sign-in asks for login --entra; no sign-in at all says so too", async () => {
  const services = fakeServices({ refreshError: "invalid_grant" });
  const store = memoryStore();
  await assert.rejects(entraAccessToken(URL_BASE, { fetchImpl: services.fetchImpl, store }), /Not signed in .* login --entra/);
  await store.save(URL_BASE, { tenant_id: TENANT, client_id: CLIENT, scopes: ["openid"], refresh_token: "old", expires_at: 0 });
  await assert.rejects(entraAccessToken(URL_BASE, { fetchImpl: services.fetchImpl, store }), /expired or was revoked.*login --entra/);
});

test("the exchange reports the instance's reason", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ error: "Supabase Auth refused the Entra ID token.", detail: "Provider (issuer) is not enabled" }), { status: 401 });
  await assert.rejects(exchangeIdToken(URL_BASE, jwt({ aud: CLIENT }), "n", { fetchImpl }), /Provider \(issuer\) is not enabled/);
});

test("the file store protects the session with DPAPI on Windows and removes it on logout", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "apb-entra-"));
  try {
    const protect = async (mode, buffer) => Buffer.from([...buffer].map(byte => byte ^ 0x5a));
    const store = fileStore({ homedir: home, platform: "win32", protect });
    await store.save(URL_BASE, { refresh_token: "very-secret" });
    const raw = await readFile(path.join(home, ".agentplaybooks", "entra.json"), "utf8");
    assert.equal(raw.includes("very-secret"), false);
    assert.equal(JSON.parse(raw).remotes[URL_BASE].scheme, "dpapi");
    assert.deepEqual(await store.load(URL_BASE), { refresh_token: "very-secret" });
    assert.equal(await logoutEntra(URL_BASE, { store }), true);
    assert.equal(await store.load(URL_BASE), null);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("mcp stdio --entra sends a fresh bearer token instead of an environment key", async () => {
  let seen;
  const fetchImpl = async (_url, init) => {
    seen = init.headers;
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { tools: [] } }), { status: 200 });
  };
  const relay = createMcpRelay({ url: `${URL_BASE}/api/mcp/0123456789abcdef`, env: {}, fetchImpl, credential: async () => "Bearer apb-session-9" });
  const result = await relay({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  assert.deepEqual(result.result, { tools: [] });
  assert.equal(seen.Authorization, "Bearer apb-session-9");
  assert.equal(seen["X-API-Key"], undefined);

  const signedOut = createMcpRelay({ url: `${URL_BASE}/api/mcp/0123456789abcdef`, env: {}, fetchImpl, credential: async () => { throw new Error("Run 'agentplaybooks login --entra'."); } });
  const refused = await signedOut({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  assert.equal(refused.error.code, -32001);
  assert.match(refused.error.message, /login --entra/);
});
