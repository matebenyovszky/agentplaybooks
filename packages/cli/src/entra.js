import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildAuthorizeUrl, interpretCallback, pkcePair, randomState, startCallbackServer } from "./oauth.js";

/**
 * Microsoft Entra ID single sign-on for a self-hosted AgentPlaybooks instance.
 *
 * The person signs in once in the browser (on an Entra-joined Windows machine
 * Edge completes it from the Windows sign-in, without a prompt). From then on
 * this module renews silently: Entra refresh token -> fresh ID token -> the
 * instance's /api/auth/entra exchange -> a short-lived AgentPlaybooks access
 * token. Nothing is pasted, and no apb_ key lives on the machine.
 *
 * Only the Entra refresh token and the current access token are kept, in
 * ~/.agentplaybooks/entra.json, encrypted with Windows DPAPI (CurrentUser) on
 * Windows and readable only by the user (0600) elsewhere. An account disabled
 * in Entra ID stops working when its access token expires (about an hour),
 * because renewal goes through Entra every time.
 */

const RENEW_MARGIN_SECONDS = 120;
const MICROSOFT = "https://login.microsoftonline.com";

function storePath(homedir = os.homedir()) {
  return path.join(homedir, ".agentplaybooks", "entra.json");
}

function base64url(buffer) {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Claims of a JWT, unverified: only used to read `exp`/`nonce`/`email` of tokens we were just handed. */
export function jwtClaims(token) {
  try {
    const payload = String(token).split(".")[1];
    return JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- protection

const DPAPI_SCRIPT = [
  "$ErrorActionPreference='Stop'",
  "Add-Type -AssemblyName System.Security",
  "$mode=[Console]::In.ReadLine()",
  "$data=[Convert]::FromBase64String([Console]::In.ReadLine())",
  "$scope=[Security.Cryptography.DataProtectionScope]::CurrentUser",
  "if($mode -eq 'protect'){$out=[Security.Cryptography.ProtectedData]::Protect($data,$null,$scope)}else{$out=[Security.Cryptography.ProtectedData]::Unprotect($data,$null,$scope)}",
  "[Console]::Out.Write([Convert]::ToBase64String($out))",
].join(";");

/** DPAPI through Windows PowerShell; the data goes over stdin, never the command line. */
export function dpapi(mode, buffer, { spawnImpl = spawn } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", DPAPI_SCRIPT], {
      stdio: ["pipe", "pipe", "ignore"], windowsHide: true,
    });
    const chunks = [];
    child.stdout.on("data", chunk => chunks.push(chunk));
    child.on("error", reject);
    child.on("close", code => {
      if (code !== 0) return reject(new Error(`Windows DPAPI ${mode} failed.`));
      resolve(Buffer.from(Buffer.concat(chunks).toString("utf8").trim(), "base64"));
    });
    child.stdin.end(`${mode}\n${buffer.toString("base64")}\n`);
  });
}

export function fileStore({ homedir, platform = process.platform, protect = dpapi } = {}) {
  const file = storePath(homedir);
  const windows = platform === "win32";
  async function readAll() {
    try {
      return JSON.parse(await readFile(file, "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT") return { version: 1, remotes: {} };
      throw new Error(`Cannot read ${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  async function writeAll(value) {
    await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    const temp = `${file}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
    await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temp, file);
    await chmod(file, 0o600).catch(() => {});
  }
  return {
    async load(url) {
      const entry = (await readAll()).remotes?.[url];
      if (!entry?.data) return null;
      const raw = Buffer.from(entry.data, "base64");
      const plain = entry.scheme === "dpapi" ? await protect("unprotect", raw) : raw;
      return JSON.parse(plain.toString("utf8"));
    },
    async save(url, state) {
      const all = await readAll();
      const plain = Buffer.from(JSON.stringify(state), "utf8");
      const data = windows ? await protect("protect", plain) : plain;
      all.remotes = { ...(all.remotes ?? {}), [url]: { scheme: windows ? "dpapi" : "plain", data: data.toString("base64") } };
      await writeAll(all);
    },
    async remove(url) {
      const all = await readAll();
      if (!all.remotes?.[url]) return false;
      delete all.remotes[url];
      if (Object.keys(all.remotes).length) await writeAll(all);
      else await rm(file, { force: true });
      return true;
    },
  };
}

// ------------------------------------------------------------------ protocol

async function json(response) {
  return response.json().catch(() => null);
}

/** The instance's Entra settings (tenant and client id), from GET /api/auth/entra. */
export async function fetchEntraConfig(url, { fetchImpl = fetch } = {}) {
  let response;
  try {
    response = await fetchImpl(`${url}/api/auth/entra`, { headers: { Accept: "application/json" }, redirect: "error" });
  } catch {
    throw new Error(`Cannot reach ${url}.`);
  }
  const body = await json(response);
  if (!response.ok || !body?.enabled) {
    throw new Error(`${url} does not offer Microsoft Entra ID sign-in (ENTRA_TENANT_ID / ENTRA_CLIENT_ID are not set there).`);
  }
  return { tenantId: body.tenant_id, clientId: body.client_id, scopes: body.scopes ?? ["openid", "profile", "email", "offline_access"] };
}

async function entraToken(config, params, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl(`${MICROSOFT}/${config.tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ client_id: config.clientId, scope: config.scopes.join(" "), ...params }).toString(),
    redirect: "error",
  });
  const body = await json(response);
  if (!response.ok || typeof body?.id_token !== "string") {
    const error = new Error(`Microsoft Entra ID refused: ${body?.error_description?.split("\n")[0] || body?.error || response.status}`);
    error.code = body?.error;
    throw error;
  }
  return body;
}

/** POST the ID token to the instance; returns { access_token, expires_at, user }. */
export async function exchangeIdToken(url, idToken, rawNonce, { fetchImpl = fetch } = {}) {
  // Supabase Auth compares the token's nonce with SHA-256(raw nonce); send the
  // raw value only when the token carries one (refreshed ID tokens may not).
  const nonce = jwtClaims(idToken)?.nonce ? rawNonce : undefined;
  const response = await fetchImpl(`${url}/api/auth/entra`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ id_token: idToken, ...(nonce ? { nonce } : {}) }),
    redirect: "error",
  });
  const body = await json(response);
  if (!response.ok || typeof body?.access_token !== "string") {
    throw new Error(`${url} refused the Entra sign-in: ${body?.detail || body?.error || `HTTP ${response.status}`}`);
  }
  return body;
}

function sessionState(config, entra, session, rawNonce) {
  return {
    tenant_id: config.tenantId,
    client_id: config.clientId,
    scopes: config.scopes,
    refresh_token: entra.refresh_token,
    nonce: rawNonce,
    access_token: session.access_token,
    expires_at: session.expires_at,
    user: session.user,
  };
}

/**
 * Browser sign-in: authorization code + PKCE on a loopback redirect. The app
 * registration needs the "Mobile and desktop applications" platform with
 * redirect URI http://localhost (Entra ignores the port for localhost).
 */
export async function loginWithEntra(url, {
  fetchImpl = fetch, openBrowser, log = () => {}, store = fileStore(), timeoutMs = 300_000, loginHint,
} = {}) {
  const config = await fetchEntraConfig(url, { fetchImpl });
  const pkce = pkcePair();
  const state = randomState();
  const rawNonce = base64url(crypto.randomBytes(24));
  const nonceHash = crypto.createHash("sha256").update(rawNonce).digest("hex");
  const server = startCallbackServer({ path: "/", timeoutMs });
  try {
    const port = await server.ready;
    const redirectUri = `http://localhost:${port}/`;
    const authorizeUrl = buildAuthorizeUrl({
      authorizationUrl: `${MICROSOFT}/${config.tenantId}/oauth2/v2.0/authorize`,
      clientId: config.clientId,
      redirectUri,
      scopes: config.scopes,
      state,
      challenge: pkce.challenge,
      extraParams: { nonce: nonceHash, response_mode: "query", ...(loginHint ? { login_hint: loginHint } : {}) },
    });
    log("Opening the Microsoft sign-in page. If no browser opens, visit:");
    log(authorizeUrl);
    if (openBrowser) await openBrowser(authorizeUrl);
    const outcome = interpretCallback(await server.callback, state);
    if (!outcome.ok) throw new Error(outcome.message);
    const entra = await entraToken(config, {
      grant_type: "authorization_code", code: outcome.code, redirect_uri: redirectUri, code_verifier: pkce.verifier,
    }, { fetchImpl });
    if (!entra.refresh_token) throw new Error("Microsoft Entra ID issued no refresh token; the offline_access scope is needed.");
    const session = await exchangeIdToken(url, entra.id_token, rawNonce, { fetchImpl });
    const saved = sessionState(config, entra, session, rawNonce);
    await store.save(url, saved);
    return saved;
  } finally {
    server.close();
  }
}

/** Renew silently from the stored Entra refresh token. */
export async function refreshEntraSession(url, saved, { fetchImpl = fetch, store = fileStore() } = {}) {
  const config = { tenantId: saved.tenant_id, clientId: saved.client_id, scopes: saved.scopes };
  const entra = await entraToken(config, { grant_type: "refresh_token", refresh_token: saved.refresh_token }, { fetchImpl });
  const session = await exchangeIdToken(url, entra.id_token, saved.nonce, { fetchImpl });
  const next = sessionState(config, { refresh_token: entra.refresh_token || saved.refresh_token }, session, saved.nonce);
  await store.save(url, next);
  return next;
}

/**
 * A valid AgentPlaybooks access token for `url`, renewing silently when it is
 * about to expire. Throws when there is no sign-in to renew from (run
 * `agentplaybooks login --entra`), or when Entra ID refuses the renewal.
 */
export async function entraAccessToken(url, options = {}) {
  return (await entraSession(url, options)).access_token;
}

/** Like entraAccessToken, with its expiry: { access_token, expires_at } (epoch seconds). */
export async function entraSession(url, { fetchImpl = fetch, store = fileStore(), now = () => Date.now() } = {}) {
  const saved = await store.load(url);
  if (!saved?.refresh_token) {
    throw new Error(`Not signed in to ${url} with Microsoft Entra ID. Run 'agentplaybooks login --entra --url=${url}'.`);
  }
  const current = state => ({ access_token: state.access_token, expires_at: state.expires_at });
  if (saved.access_token && saved.expires_at - RENEW_MARGIN_SECONDS > now() / 1000) return current(saved);
  try {
    return current(await refreshEntraSession(url, saved, { fetchImpl, store }));
  } catch (error) {
    if (error?.code === "invalid_grant" || error?.code === "interaction_required") {
      throw new Error(`The Microsoft Entra ID sign-in for ${url} has expired or was revoked. Run 'agentplaybooks login --entra --url=${url}'.`);
    }
    throw error;
  }
}

export async function entraStatus(url, { store = fileStore(), now = () => Date.now() } = {}) {
  const saved = await store.load(url);
  if (!saved) return { signedIn: false };
  return {
    signedIn: Boolean(saved.refresh_token),
    user: saved.user ?? null,
    tenantId: saved.tenant_id,
    accessTokenValidFor: Math.max(0, Math.floor((saved.expires_at ?? 0) - now() / 1000)),
  };
}

export function logoutEntra(url, { store = fileStore() } = {}) {
  return store.remove(url);
}
