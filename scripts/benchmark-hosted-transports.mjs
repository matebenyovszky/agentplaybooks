/** Explicit read-only benchmark. Never prints credentials, response bodies or schemas. */
import { performance } from "node:perf_hooks";
import { resolveApiKey } from "../packages/cli/src/remote.js";

const base = "https://agentplaybooks.ai";
const playbookId = process.argv.find(arg => arg.startsWith("--playbook="))?.slice(11);
if (!playbookId || !/^[a-f0-9-]{36}$/.test(playbookId)) throw new Error("--playbook=<UUID> is required");
const key = await resolveApiKey(base);
if (!key) throw new Error("CLI login required");
const headers = { "Content-Type": "application/json", Accept: "application/json", "X-API-Key": key };
const args = { playbook_id: playbookId };
const samples = { mcp: [], rest: [] };
let expectedNames;
async function sample(transport, record = true) {
  const mcp = transport === "mcp";
  const body = mcp ? { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_skills", arguments: args } } : args;
  const start = performance.now();
  const response = await fetch(`${base}${mcp ? "/api/mcp/manage" : "/api/control/list_skills"}`, {
    method: "POST", headers, body: JSON.stringify(body), redirect: "error", signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`${transport} HTTP ${response.status}; benchmark stopped`);
  const raw = await response.text();
  const elapsed = performance.now() - start;
  const payload = JSON.parse(raw);
  if (payload.error || payload.result?.isError) throw new Error(`${transport} operation refused; benchmark stopped`);
  const data = mcp ? payload.result.structuredContent ?? JSON.parse(payload.result.content[0].text) : payload;
  const skills = Array.isArray(data) ? data : data.skills;
  if (!Array.isArray(skills)) throw new Error(`${transport} invalid skill metadata response`);
  const names = JSON.stringify(skills.map(skill => skill.id).sort());
  expectedNames ??= names;
  if (names !== expectedNames) throw new Error("Transport results differ; benchmark stopped");
  if (record) samples[transport].push({ ms: elapsed, bytes: Buffer.byteLength(raw) });
}
// One warm-up each, then alternate order to reduce startup and ordering bias.
await sample("mcp", false); await sample("rest", false);
for (let i = 0; i < 10; i++) for (const type of i % 2 ? ["rest", "mcp"] : ["mcp", "rest"]) await sample(type);
console.log(JSON.stringify({ operation: "list_skills", equivalentResults: true, scope: "Warm HTTP requests from this machine; excludes model, tool routing, OAuth and shell startup", transports: Object.fromEntries(Object.entries(samples).map(([type, values]) => {
  const sorted = values.map(value => value.ms).sort((a, b) => a - b);
  return [type, { n: values.length, medianMs: Math.round((sorted[4] + sorted[5]) / 2), minMs: Math.round(sorted[0]), maxMs: Math.round(sorted.at(-1)), meanResponseBytes: Math.round(values.reduce((total, value) => total + value.bytes, 0) / values.length) }];
})) }, null, 2));
