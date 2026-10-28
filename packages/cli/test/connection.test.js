import test from "node:test";
import assert from "node:assert/strict";
import { checkConnection, connectionEndpoint } from "../src/connection.js";
const base = "https://example.test";
const endpoint = `${base}/api/mcp/manage`;

function mockTransport({ status = 200, sse = false, tools = [{ name: "get_profile" }], malformed = false } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.includes("/.well-known/oauth-protected-resource")) return Response.json({ resource: endpoint, authorization_servers: ["https://auth.example.test"] });
    if (url.includes("/.well-known/oauth-authorization-server")) return Response.json({
      issuer: "https://auth.example.test", authorization_endpoint: "https://auth.example.test/authorize",
      token_endpoint: "https://auth.example.test/token", code_challenge_methods_supported: ["S256"],
    });
    if (status !== 200) return new Response("secret-error-body", { status });
    const { id, method } = JSON.parse(options.body);
    if (method === "notifications/initialized") return new Response(null, { status: 202 });
    const result = method === "initialize" ? { protocolVersion: "2025-11-25" }
      : method === "tools/list" ? { tools }
      : { structuredContent: { id: "account-1", name: "Test account" } };
    const payload = { jsonrpc: "2.0", id: malformed ? 999 : id, result };
    return sse
      ? new Response(`event: message\ndata: ${JSON.stringify(payload)}\n\n`, { headers: { "content-type": "text/event-stream" } })
      : Response.json(payload, { headers: { "mcp-session-id": "session-1" } });
  };
  return { calls, fetchImpl };
}

for (const sse of [false, true]) test(`connection validates MCP stages and identity (${sse ? "SSE" : "JSON"})`, async () => {
  const transport = mockTransport({ sse });
  const report = await checkConnection(base, { apiKey: "private-test-value", fetchImpl: transport.fetchImpl });
  assert.equal(report.ok, true);
  assert.equal(report.profile.id, "account-1");
  assert.equal(report.toolCount, 1);
  assert.match(report.toolCatalogDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(transport.calls.length, 6);
  assert.equal(transport.calls[0].options.headers["X-API-Key"], undefined);
  assert.equal(transport.calls[1].options.headers["X-API-Key"], undefined);
  assert.equal(transport.calls[2].options.headers["X-API-Key"], "private-test-value");
  assert.doesNotMatch(JSON.stringify(report), /private-test-value/);
});

test("authentication failures stop after initialize without retries or leaking bodies", async () => {
  const transport = mockTransport({ status: 401 });
  const report = await checkConnection(base, { apiKey: "private-test-value", fetchImpl: transport.fetchImpl });
  assert.equal(report.ok, false);
  assert.equal(transport.calls.length, 3);
  assert.equal(report.stages.at(-1).httpStatus, 401);
  assert.doesNotMatch(JSON.stringify(report), /private-test-value|secret-error-body/);
});

test("empty catalogs and mismatched JSON-RPC ids do not pass", async () => {
  for (const options of [{ tools: [] }, { malformed: true }]) {
    const transport = mockTransport(options);
    assert.equal((await checkConnection(base, { fetchImpl: transport.fetchImpl })).ok, false);
  }
});

test("rejects credential URLs and remote cleartext before sending any request", () => {
  for (const url of ["http://remote.test", "https://user:secret@example.test", "https://example.test?token=secret"]) {
    assert.throws(() => connectionEndpoint(url), /HTTPS/);
  }
  assert.equal(connectionEndpoint(base), endpoint);
  assert.equal(connectionEndpoint(endpoint), endpoint);
  assert.equal(connectionEndpoint(endpoint + "/"), endpoint);
});

test("self-check distinguishes network failures from invalid protocol responses", async () => {
  const offline = await checkConnection(base, { fetchImpl: async () => { throw new Error("private-transport-detail"); } });
  assert.equal(offline.stages.at(-1).reason, "transport-error");
  assert.doesNotMatch(JSON.stringify(offline), /private-transport-detail/);
  const transport = mockTransport({ malformed: true });
  const invalid = await checkConnection(base, { fetchImpl: transport.fetchImpl });
  assert.equal(invalid.stages.at(-1).reason, "response-or-protocol-error");
});
