#!/usr/bin/env node
/**
 * Smoke-checks the deployed MCP surface.
 *
 * Every assertion here is a bug that actually shipped and was found by hand —
 * by clicking a button in the dashboard, or by curling the endpoint during a
 * debugging session. Unit tests missed all of them for the same reason: they
 * exercise handlers directly, so they cannot see whether the platform routes a
 * request to the handler, or whether the deploy carrying the fix went out.
 *
 * Usage:
 *   node scripts/smoke-mcp.mjs
 *   SMOKE_URL=https://staging.example.com node scripts/smoke-mcp.mjs
 *   SMOKE_PRIVATE_GUID=<guid> node scripts/smoke-mcp.mjs   # adds the auth checks
 *
 * Exits non-zero if any check fails, so CI or a scheduled run can own it
 * instead of a person.
 */

const BASE = (process.env.SMOKE_URL ?? "https://agentplaybooks.ai").replace(/\/+$/, "");
const PUBLIC_GUID = process.env.SMOKE_PUBLIC_GUID ?? "clawdbot-personal-assistant";
const PRIVATE_GUID = process.env.SMOKE_PRIVATE_GUID ?? null;
const TIMEOUT_MS = 20_000;

const MODERN_VERSION = "2026-07-28";
const LEGACY_VERSIONS = new Set(["2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25"]);

const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function request(path, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${BASE}${path}`, { ...init, signal: controller.signal });
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { response, text, json };
  } finally {
    clearTimeout(timer);
  }
}

function rpc(method, { id = 1, params = {}, version = MODERN_VERSION, modern = true } = {}) {
  const body = {
    jsonrpc: "2.0",
    ...(id === null ? {} : { id }),
    method,
    params: modern
      ? { ...params, _meta: { "io.modelcontextprotocol/protocolVersion": version } }
      : params,
  };
  return {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": version,
      ...(modern ? { "Mcp-Method": method } : {}),
    },
    body: JSON.stringify(body),
  };
}

async function checkStreamRequestIsDeclined() {
  const { response } = await request(`/api/mcp/${PUBLIC_GUID}`, { headers: { Accept: "text/event-stream" } });
  // A GET means "open an SSE stream". We offer none, so the spec wants 405 —
  // answering 200 with the manifest hands a document to a client expecting a
  // stream.
  record(
    "GET with Accept: text/event-stream is declined with 405",
    response.status === 405 && response.headers.get("allow") === "POST",
    `HTTP ${response.status}, Allow: ${response.headers.get("allow") ?? "(none)"}`,
  );
}

async function checkNotificationIsNotAnswered() {
  const { response, text } = await request(`/api/mcp/${PUBLIC_GUID}`, rpc("notifications/initialized", { id: null }));
  // Answering a notification at all — even with a well-formed error — makes a
  // conforming client treat the connection as failed.
  record(
    "a notification gets 202 and no body",
    response.status === 202 && text === "",
    `HTTP ${response.status}, body ${text.length} chars`,
  );
}

async function checkModernDiscovery() {
  const { response, json } = await request(`/api/mcp/${PUBLIC_GUID}`, rpc("server/discover"));
  const versions = json?.result?.supportedVersions;
  record(
    "server/discover reports supported versions",
    response.status === 200 && Array.isArray(versions) && versions.includes(MODERN_VERSION),
    Array.isArray(versions) ? versions.join(", ") : `HTTP ${response.status}`,
  );
}

async function checkLegacyHandshakeStillNegotiates() {
  const { response, json } = await request(
    `/api/mcp/${PUBLIC_GUID}`,
    rpc("initialize", { params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "smoke", version: "1" } }, version: "2025-11-25", modern: false }),
  );
  const negotiated = json?.result?.protocolVersion;
  // A handshake must never be answered with a revision that has no handshake.
  record(
    "initialize negotiates a version that still has a handshake",
    response.status === 200 && LEGACY_VERSIONS.has(negotiated),
    `${negotiated ?? `HTTP ${response.status}`}`,
  );
}

async function checkUnknownVersionIsNotRejected() {
  const { response } = await request(`/api/mcp/${PUBLIC_GUID}`, rpc("notifications/initialized", { id: null, version: "2099-01-01" }));
  // An allowlist of known revisions rejects every future one, and a dual-era
  // client cannot fall back from that 400.
  record(
    "an unknown protocol revision is not rejected outright",
    response.status !== 400,
    `HTTP ${response.status}`,
  );
}

async function checkUnknownMethod() {
  const { response, json } = await request(`/api/mcp/${PUBLIC_GUID}`, rpc("does/not/exist"));
  record(
    "an unknown method answers 404 with -32601",
    response.status === 404 && json?.error?.code === -32601,
    `HTTP ${response.status}, code ${json?.error?.code ?? "(none)"}`,
  );
}

async function checkConnectionTestRouteIsReachable() {
  // The handler refuses an unauthenticated caller; what matters here is that the
  // request reaches a handler at all. A missing Next.js route file answers with
  // an HTML 404 page, which is what "Unexpected non-whitespace character after
  // JSON" in the dashboard actually meant.
  const uuid = "00000000-0000-4000-8000-000000000000";
  const { response, json, text } = await request(`/api/mcp/config/${uuid}/test`, { method: "POST" });
  record(
    "the connection-test route answers JSON, not an HTML 404",
    json !== null,
    `HTTP ${response.status}, ${json ? "JSON" : `not JSON: ${text.slice(0, 40)}`}`,
  );
}

async function checkPrivatePlaybookChallenge() {
  if (!PRIVATE_GUID) {
    console.log("skip  private playbook checks (set SMOKE_PRIVATE_GUID to enable)");
    return;
  }
  const { response } = await request(`/api/mcp/${PRIVATE_GUID}`);
  // 404 tells a client the server does not exist, so it never asks for a
  // credential. And a Bearer challenge claims OAuth we do not implement.
  record(
    "a private playbook answers 401 without an OAuth challenge",
    response.status === 401 && !response.headers.get("www-authenticate"),
    `HTTP ${response.status}, WWW-Authenticate: ${response.headers.get("www-authenticate") ?? "(none)"}`,
  );
}

console.log(`Smoke-checking ${BASE}\n`);

for (const check of [
  checkStreamRequestIsDeclined,
  checkNotificationIsNotAnswered,
  checkModernDiscovery,
  checkLegacyHandshakeStillNegotiates,
  checkUnknownVersionIsNotRejected,
  checkUnknownMethod,
  checkConnectionTestRouteIsReachable,
  checkPrivatePlaybookChallenge,
]) {
  try {
    await check();
  } catch (error) {
    record(check.name, false, error instanceof Error ? error.message : String(error));
  }
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) {
  console.error(`\nFailed: ${failed.map((result) => result.name).join("; ")}`);
  process.exit(1);
}
