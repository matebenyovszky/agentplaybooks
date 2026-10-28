import test from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { createMcpRelay, runMcpStdio } from "../src/mcp-stdio.js";
import { serverDefinition } from "../src/connect.js";

const url = "https://example.test/api/mcp/manage";
const env = { AGENTPLAYBOOKS_API_KEY: "test-secret" };
const request = (method, id = 1) => ({ jsonrpc: "2.0", id, method });

test("relay stays offline when idle and answers local ping without HTTP", async () => {
  let count = 0;
  const input = new PassThrough(), output = new PassThrough();
  let text = ""; output.on("data", chunk => { text += chunk; });
  const running = runMcpStdio({ url, env, input, output, fetchImpl: async () => { count++; throw new Error("unexpected HTTP"); } });
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(count, 0);
  input.write(JSON.stringify(request("ping")) + "\n");
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(JSON.parse(text), { jsonrpc: "2.0", id: 1, result: {} });
  assert.equal(count, 0);
  input.end(); await running;
});

test("actual MCP requests forward once with credentials, protocol, session and unchanged results", async () => {
  const methods = [];
  const relay = createMcpRelay({ url, env, fetchImpl: async (_url, options) => {
    const body = JSON.parse(options.body); methods.push(body.method);
    assert.equal(options.headers["X-API-Key"], "test-secret");
    assert.equal(options.redirect, "error");
    if (body.method === "initialize") return Response.json({ jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2025-03-26" } }, { headers: { "mcp-session-id": "session" } });
    assert.equal(options.headers["Mcp-Session-Id"], "session");
    assert.equal(options.headers["MCP-Protocol-Version"], "2025-03-26");
    if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
    return Response.json({ jsonrpc: "2.0", id: body.id, result: { tools: [{ name: "example" }] } });
  } });
  await relay(request("initialize"));
  assert.equal(await relay({ jsonrpc: "2.0", method: "notifications/initialized" }), null);
  assert.equal((await relay(request("tools/list", 2))).result.tools[0].name, "example");
  assert.deepEqual(methods, ["initialize", "notifications/initialized", "tools/list"]);
});

test("transport failures never retry or expose response bodies and keys", async () => {
  let calls = 0;
  const relay = createMcpRelay({ url, env, fetchImpl: async () => { calls++; return new Response("test-secret", { status: 503 }); } });
  const result = await relay(request("tools/list"));
  assert.match(result.error.message, /HTTP 503/);
  assert.ok(!JSON.stringify(result).includes("test-secret"));
  assert.equal(calls, 1);
  const missing = createMcpRelay({ url, env: {}, fetchImpl: async () => { throw new Error("must not fetch"); } });
  assert.equal((await missing(request("initialize"))).error.code, -32001);
  for (const bad of ["http://remote.test/api/mcp/manage", "https://user:secret@example.test/api/mcp/manage", url + "?key=secret"]) assert.throws(() => createMcpRelay({ url: bad }), /HTTPS/);
});

test("rejects mismatched response ids and excessive responses", async () => {
  const mismatch = createMcpRelay({ url, env, fetchImpl: async () => Response.json({ jsonrpc: "2.0", id: 999, result: {} }) });
  assert.equal((await mismatch(request("tools/list"))).error.code, -32000);
  const huge = createMcpRelay({ url, env, fetchImpl: async () => new Response("x".repeat(8 * 1024 * 1024 + 1)) });
  assert.equal((await huge(request("tools/list"))).error.code, -32000);
});

test("Hermes uses credential references and stdio, without a keepalive setting", () => {
  const config = serverDefinition({ url, keyEnvVar: "AGENTPLAYBOOKS_API_KEY", target: "hermes" });
  assert.ok(config.command); assert.ok(config.args.includes("stdio"));
  assert.equal(config.env.AGENTPLAYBOOKS_API_KEY, "${AGENTPLAYBOOKS_API_KEY}");
  assert.equal(config.url, undefined); assert.equal(config.keepalive_interval, undefined);
});
