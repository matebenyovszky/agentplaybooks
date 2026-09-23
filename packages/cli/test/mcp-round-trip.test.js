import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { applyPull, applyPush, planPull, planPush } from "../src/remote.js";
import { applySync, planSync } from "../src/sync.js";
import { snapshotDigest } from "../src/snapshot.js";

const URL_BASE = "https://remote.test";
const API_KEY = "apb_test_key";
const PLAYBOOK_ID = "11111111-2222-4333-8444-555555555555";

async function fixture() {
  return mkdtemp(path.join(tmpdir(), "agentplaybooks-mcp-"));
}

async function put(root, relativePath, content) {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}

async function readJson(root, relativePath) {
  return JSON.parse(await readFile(path.join(root, ...relativePath.split("/")), "utf8"));
}

function fakeApi(playbook) {
  const respond = (status, body) => ({ ok: status < 400, status, json: async () => body });
  const fetchImpl = async (requestUrl, init = {}) => {
    const method = init.method ?? "GET";
    const { pathname } = new URL(requestUrl);
    const body = init.body ? JSON.parse(init.body) : undefined;

    if (method === "GET" && pathname === "/api/manage/playbooks") {
      return respond(200, playbook ? [{ id: playbook.id, guid: playbook.guid, name: playbook.name }] : []);
    }
    if (method === "POST" && pathname === "/api/manage/playbooks") {
      playbook = { id: PLAYBOOK_ID, guid: "abc123", name: body.name, config: body.config ?? {}, skills: [], mcp_servers: [] };
      return respond(201, playbook);
    }
    if (pathname === `/api/manage/playbooks/${playbook?.id}`) {
      if (method === "GET") return respond(200, playbook);
      if (method === "PUT") {
        Object.assign(playbook, body);
        return respond(200, playbook);
      }
    }
    if (method === "GET" && pathname === `/api/manage/playbooks/${playbook?.id}/snapshots/latest`) {
      return respond(200, playbook.snapshot ? { snapshot: playbook.snapshot, digest: snapshotDigest(playbook.snapshot) } : { snapshot: null });
    }
    if (method === "POST" && pathname === `/api/manage/playbooks/${playbook?.id}/snapshots`) {
      playbook.snapshot = body.snapshot;
      return respond(201, { digest: snapshotDigest(body.snapshot) });
    }
    if (method === "POST" && pathname === `/api/manage/playbooks/${playbook?.id}/skills`) {
      const skill = { id: `skill-${playbook.skills.length + 1}`, ...body };
      playbook.skills.push(skill);
      return respond(201, skill);
    }
    if (method === "POST" && pathname === `/api/manage/playbooks/${playbook?.id}/mcp-servers`) {
      // Mirrors the API defaults for fields the CLI does not send.
      const server = { id: `mcp-${playbook.mcp_servers.length + 1}`, description: null, tools: [], resources: [], ...body };
      playbook.mcp_servers.push(server);
      return respond(201, server);
    }
    const mcpMatch = pathname.match(/^\/api\/manage\/playbooks\/[^/]+\/mcp-servers\/([^/]+)$/);
    if (method === "PUT" && mcpMatch) {
      const server = playbook.mcp_servers.find((item) => item.id === mcpMatch[1]);
      if (!server) return respond(404, { error: "MCP server not found" });
      Object.assign(server, body);
      return respond(200, server);
    }
    return respond(404, { error: `No route for ${method} ${pathname}` });
  };
  return { fetchImpl, current: () => playbook };
}

test("push uploads local MCP servers with their transport mapped for the hosted playbook", async () => {
  const root = await fixture();
  await put(root, ".mcp.json", JSON.stringify({
    mcpServers: {
      deploy: { command: "npx", args: ["deploy-mcp"], env: { API_KEY: "${DEPLOY_API_KEY}" } },
      search: { url: "https://mcp.example.com/http" },
      stream: { url: "https://mcp.example.com/sse" },
    },
  }));
  const api = fakeApi(null);

  const plan = await planPush(root, { url: URL_BASE, apiKey: API_KEY, fetchImpl: api.fetchImpl });
  assert.deepEqual(
    plan.actions.filter((action) => action.kind === "mcp").map((action) => action.name).sort(),
    ["deploy", "search", "stream"],
  );

  await applyPush(root, plan, { apiKey: API_KEY, fetchImpl: api.fetchImpl });
  const servers = api.current().mcp_servers;
  const byName = Object.fromEntries(servers.map((server) => [server.name, server]));

  assert.equal(byName.deploy.transport_type, "stdio");
  assert.deepEqual(byName.deploy.transport_config, { command: "npx", args: ["deploy-mcp"], env: { API_KEY: "${DEPLOY_API_KEY}" } });
  assert.equal(byName.search.transport_type, "http");
  assert.equal(byName.search.transport_config.url, "https://mcp.example.com/http");
  assert.equal(byName.stream.transport_type, "sse");

  // A second push is a no-op: the remote projection already matches.
  const followUp = await planPush(root, { url: URL_BASE, apiKey: API_KEY, fetchImpl: api.fetchImpl });
  assert.equal(followUp.actions.filter((action) => action.kind === "mcp").length, 0);
});

test("pull writes remote MCP servers into the portable store and sync fans them out", async () => {
  const root = await fixture();
  const api = fakeApi({
    id: PLAYBOOK_ID,
    guid: "abc123",
    name: "Team playbook",
    config: {},
    skills: [],
    mcp_servers: [
      { id: "mcp-1", name: "deploy", transport_type: "stdio", transport_config: { command: "npx", args: ["deploy-mcp"] } },
      { id: "mcp-2", name: "search", transport_type: "http", transport_config: { url: "https://mcp.example.com/http", timeout_ms: 15000, access: "public" } },
    ],
  });

  const pullPlan = await planPull(root, "abc123", { url: URL_BASE, apiKey: API_KEY, fetchImpl: api.fetchImpl });
  const mcpAction = pullPlan.actions.find((action) => action.kind === "mcp-config");
  assert.equal(mcpAction.path, ".agents/mcp.json");
  assert.deepEqual(mcpAction.servers, ["deploy", "search"]);

  await applyPull(root, pullPlan);
  const portable = await readJson(root, ".agents/mcp.json");
  assert.deepEqual(portable.mcpServers.deploy, { command: "npx", args: ["deploy-mcp"] });
  // Platform-only federation settings stay on the hosted side.
  assert.deepEqual(portable.mcpServers.search, { url: "https://mcp.example.com/http" });

  // A freshly pulled project holds only the portable store, which is not a
  // deployment target: sync must say so instead of doing nothing quietly.
  const home = await fixture();
  await mkdir(path.join(home, ".claude"), { recursive: true });
  const bareplan = await planSync(root, { homedir: home, env: {} });
  assert.deepEqual(bareplan.fileActions, []);
  assert.deepEqual(bareplan.suggestedTargets, ["claude"]);

  // Enabling a target is what distributes the portable store to real files.
  const syncPlan = await planSync(root, { homedir: home, env: {}, targets: ["claude"] });
  await applySync(syncPlan);
  const claudeConfig = await readJson(root, ".mcp.json");
  assert.ok(claudeConfig.mcpServers.deploy);
  assert.ok(claudeConfig.mcpServers.search);

  // The full circle converges: nothing left to pull, sync, or push.
  const pullAgain = await planPull(root, "abc123", { url: URL_BASE, apiKey: API_KEY, fetchImpl: api.fetchImpl });
  assert.deepEqual(pullAgain.actions, []);
  assert.deepEqual(pullAgain.conflicts, []);
  const syncAgain = await planSync(root, { homedir: home, env: {} });
  assert.deepEqual(syncAgain.fileActions, []);
  assert.deepEqual(syncAgain.suggestedTargets, []);
  const pushAgain = await planPush(root, { url: URL_BASE, apiKey: API_KEY, fetchImpl: api.fetchImpl });
  assert.equal(pushAgain.actions.filter((action) => action.kind === "mcp").length, 0);
});

test("an unknown --target is rejected instead of silently ignored", async () => {
  const root = await fixture();
  await assert.rejects(planSync(root, { targets: ["notatool"] }), /Unknown target 'notatool'/);
});

test("push updates the connection but preserves hosted federation settings", async () => {
  const root = await fixture();
  await put(root, ".mcp.json", JSON.stringify({ mcpServers: { search: { url: "https://mcp.example.com/v2/http" } } }));
  await put(root, ".agentplaybooks/remote.json", JSON.stringify({ url: URL_BASE, playbookId: PLAYBOOK_ID, guid: "abc123", name: "Team playbook" }));
  const api = fakeApi({
    id: PLAYBOOK_ID,
    guid: "abc123",
    name: "Team playbook",
    config: {},
    skills: [],
    mcp_servers: [{
      id: "mcp-1",
      name: "search",
      description: "Curated search",
      tools: [{ name: "query" }],
      transport_type: "http",
      transport_config: { url: "https://mcp.example.com/http", timeout_ms: 30000, auth: { type: "bearer", token_secret: "SEARCH_TOKEN" } },
    }],
  });

  const plan = await planPush(root, { url: URL_BASE, apiKey: API_KEY, fetchImpl: api.fetchImpl });
  const update = plan.actions.find((action) => action.kind === "mcp");
  assert.equal(update.action, "update");
  assert.equal(update.mcpServerId, "mcp-1");

  await applyPush(root, plan, { apiKey: API_KEY, fetchImpl: api.fetchImpl });
  const server = api.current().mcp_servers[0];
  assert.equal(server.transport_config.url, "https://mcp.example.com/v2/http");
  assert.equal(server.transport_config.timeout_ms, 30000);
  assert.deepEqual(server.transport_config.auth, { type: "bearer", token_secret: "SEARCH_TOKEN" });
  assert.equal(server.description, "Curated search");
  assert.deepEqual(server.tools, [{ name: "query" }]);
});

test("remote-only MCP servers are left untouched by push", async () => {
  const root = await fixture();
  await put(root, ".mcp.json", JSON.stringify({ mcpServers: { deploy: { command: "npx" } } }));
  await put(root, ".agentplaybooks/remote.json", JSON.stringify({ url: URL_BASE, playbookId: PLAYBOOK_ID, guid: "abc123", name: "Team playbook" }));
  const api = fakeApi({
    id: PLAYBOOK_ID,
    guid: "abc123",
    name: "Team playbook",
    config: {},
    skills: [],
    mcp_servers: [{ id: "mcp-1", name: "legacy", transport_type: "http", transport_config: { url: "https://legacy.example.com/http" } }],
  });

  const plan = await planPush(root, { url: URL_BASE, apiKey: API_KEY, fetchImpl: api.fetchImpl });
  assert.deepEqual(
    plan.actions.filter((action) => action.kind === "mcp").map((action) => `${action.action}:${action.name}`),
    ["create:deploy"],
  );

  await applyPush(root, plan, { apiKey: API_KEY, fetchImpl: api.fetchImpl });
  assert.ok(api.current().mcp_servers.some((server) => server.name === "legacy"));
});

test("an OpenAPI federation server is reported, not half-translated, on pull", async () => {
  const root = await fixture();
  const api = fakeApi({
    id: PLAYBOOK_ID,
    guid: "abc123",
    name: "Team playbook",
    config: {},
    skills: [],
    mcp_servers: [{ id: "mcp-1", name: "billing", transport_type: "openapi", transport_config: { spec_url: "https://api.example.com/openapi.json" } }],
  });

  const plan = await planPull(root, "abc123", { url: URL_BASE, apiKey: API_KEY, fetchImpl: api.fetchImpl });
  assert.equal(plan.actions.length, 0);
  assert.match(plan.conflicts[0].reason, /OpenAPI federation server/);
});

test("push refuses when an MCP config contains a literal credential", async () => {
  const root = await fixture();
  await put(root, ".mcp.json", JSON.stringify({
    mcpServers: { deploy: { url: "https://mcp.example.com/http", headers: { Authorization: "Bearer sk-ABCDEFGHIJKLMNOPQRSTUVWX1234" } } },
  }, null, 2));
  const api = fakeApi(null);

  await assert.rejects(
    planPush(root, { url: URL_BASE, apiKey: API_KEY, fetchImpl: api.fetchImpl }),
    /Refusing to push/,
  );
});
