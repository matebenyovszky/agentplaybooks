import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { snapshotDigest } from "../src/snapshot.js";
import {
  applyPull,
  applyPush,
  planGlobalPush,
  planPull,
  planPush,
  readLink,
  resolveApiKey,
  resolveBaseUrl,
  saveApiKey,
} from "../src/remote.js";

const URL_BASE = "https://remote.test";
const API_KEY = "apb_test_key";

async function fixture(prefix) {
  return mkdtemp(path.join(tmpdir(), prefix));
}

async function put(root, relativePath, content) {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}

function fakeApi(state) {
  const calls = [];
  const respond = (status, body) => ({ ok: status < 400, status, json: async () => body });
  const fetchImpl = async (requestUrl, init = {}) => {
    const method = init.method ?? "GET";
    const { pathname } = new URL(requestUrl);
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, path: pathname, body });

    if (init.headers?.Authorization !== `Bearer ${API_KEY}`) {
      return respond(401, { error: "Unauthorized" });
    }
    if (method === "GET" && pathname === "/api/manage/playbooks") {
      return respond(200, state.playbooks.map((playbook) => ({
        id: playbook.id,
        guid: playbook.guid,
        name: playbook.name,
        visibility: "private",
        skill_count: playbook.skills.length,
      })));
    }
    const latestMatch = pathname.match(/^\/api\/manage\/playbooks\/([^/]+)\/snapshots\/latest$/);
    if (method === "GET" && latestMatch) {
      const playbook = state.playbooks.find((item) => item.id === latestMatch[1]);
      if (!playbook) return respond(404, { error: "Playbook not found" });
      const latest = (state.backups ?? []).filter((item) => item.playbookId === playbook.id).at(-1);
      return respond(200, latest
        ? { id: latest.id, snapshot: latest.snapshot, digest: snapshotDigest(latest.snapshot), created_at: latest.createdAt }
        : { snapshot: null });
    }
    const snapshotMatch = pathname.match(/^\/api\/manage\/playbooks\/([^/]+)\/snapshots\/([^/]+)$/);
    if (method === "GET" && snapshotMatch) {
      const saved = (state.backups ?? []).find((item) => item.playbookId === snapshotMatch[1] && item.id === snapshotMatch[2]);
      return saved ? respond(200, { id: saved.id, snapshot: saved.snapshot, digest: snapshotDigest(saved.snapshot), created_at: saved.createdAt })
        : respond(404, { error: "Snapshot not found" });
    }
    const snapshotsMatch = pathname.match(/^\/api\/manage\/playbooks\/([^/]+)\/snapshots$/);
    if (method === "POST" && snapshotsMatch) {
      const playbook = state.playbooks.find((item) => item.id === snapshotsMatch[1]);
      if (!playbook) return respond(404, { error: "Playbook not found" });
      state.backups ??= [];
      const saved = { id: `backup-${state.backups.length + 1}`, playbookId: playbook.id, guid: playbook.guid,
        name: playbook.name, snapshot: body.snapshot, createdAt: new Date().toISOString() };
      state.backups.push(saved);
      return respond(201, { id: saved.id, digest: snapshotDigest(body.snapshot) });
    }
    const backupMatch = pathname.match(/^\/api\/manage\/backups\/([^/]+)$/);
    if (method === "GET" && backupMatch) {
      const saved = (state.backups ?? []).filter((item) => item.guid === backupMatch[1]);
      if (new URL(requestUrl).searchParams.has("list")) return respond(200, saved.map((item) => ({ id: item.id, digest: snapshotDigest(item.snapshot), created_at: item.createdAt, file_count: item.snapshot.files.length, size_bytes: 1 })));
      const wanted = new URL(requestUrl).searchParams.get("snapshot");
      const selected = wanted ? saved.find((item) => item.id === wanted) : saved.at(-1);
      return selected ? respond(200, { id: selected.id, snapshot: selected.snapshot, digest: snapshotDigest(selected.snapshot), created_at: selected.createdAt, playbook_name: selected.name })
        : respond(404, { error: "Backup not found" });
    }
    const detailMatch = pathname.match(/^\/api\/manage\/playbooks\/([^/]+)$/);
    if (detailMatch) {
      const playbook = state.playbooks.find((item) => item.id === detailMatch[1]);
      if (!playbook) return respond(404, { error: "Playbook not found" });
      if (method === "GET") return respond(200, playbook);
      if (method === "PUT") {
        Object.assign(playbook, body);
        return respond(200, playbook);
      }
    }
    const skillsMatch = pathname.match(/^\/api\/manage\/playbooks\/([^/]+)\/skills$/);
    if (method === "POST" && skillsMatch) {
      const playbook = state.playbooks.find((item) => item.id === skillsMatch[1]);
      if (!playbook) return respond(404, { error: "Playbook not found" });
      const skill = { id: `skill-${playbook.skills.length + 1}`, ...body };
      playbook.skills.push(skill);
      return respond(201, skill);
    }
    const skillMatch = pathname.match(/^\/api\/manage\/playbooks\/([^/]+)\/skills\/([^/]+)$/);
    if (method === "PUT" && skillMatch) {
      const playbook = state.playbooks.find((item) => item.id === skillMatch[1]);
      const skill = playbook?.skills.find((item) => item.id === skillMatch[2]);
      if (!skill) return respond(404, { error: "Skill not found" });
      Object.assign(skill, body);
      return respond(200, skill);
    }
    const mcpMatch = pathname.match(/^\/api\/manage\/playbooks\/([^/]+)\/mcp-servers$/);
    if (method === "POST" && mcpMatch) {
      const playbook = state.playbooks.find((item) => item.id === mcpMatch[1]);
      if (!playbook) return respond(404, { error: "Playbook not found" });
      playbook.mcp_servers ??= [];
      const server = { id: `mcp-${playbook.mcp_servers.length + 1}`, ...body };
      playbook.mcp_servers.push(server);
      return respond(201, server);
    }
    const mcpItemMatch = pathname.match(/^\/api\/manage\/playbooks\/([^/]+)\/mcp-servers\/([^/]+)$/);
    if (method === "PUT" && mcpItemMatch) {
      const playbook = state.playbooks.find((item) => item.id === mcpItemMatch[1]);
      const server = playbook?.mcp_servers?.find((item) => item.id === mcpItemMatch[2]);
      if (!server) return respond(404, { error: "MCP server not found" });
      Object.assign(server, body);
      return respond(200, server);
    }
    if (method === "POST" && pathname === "/api/manage/playbooks") {
      const playbook = {
        id: `id-${state.playbooks.length + 1}`,
        guid: `guid-${state.playbooks.length + 1}`,
        name: body.name,
        config: body.config ?? {},
        skills: [],
      };
      state.playbooks.push(playbook);
      return respond(201, playbook);
    }
    return respond(404, { error: `No route for ${method} ${pathname}` });
  };
  return { fetchImpl, calls };
}

test("resolveBaseUrl prefers the flag, then the environment, then the default", () => {
  assert.equal(resolveBaseUrl("https://x.test/", {}), "https://x.test");
  assert.equal(resolveBaseUrl(undefined, { AGENTPLAYBOOKS_URL: "https://env.test" }), "https://env.test");
  assert.equal(resolveBaseUrl(undefined, {}), "https://agentplaybooks.ai");
});

test("saveApiKey stores credentials that resolveApiKey reads back", async () => {
  const home = await fixture("agentplaybooks-home-");
  await saveApiKey(URL_BASE, API_KEY, home);
  assert.equal(await resolveApiKey(URL_BASE, { env: {}, homedir: home }), API_KEY);
  assert.equal(await resolveApiKey("https://other.test", { env: {}, homedir: home }), null);
  assert.equal(await resolveApiKey(URL_BASE, { env: { AGENTPLAYBOOKS_API_KEY: "apb_env" }, homedir: home }), "apb_env");
});

test("pull plans remote skills into .agents/skills and apply writes them with a link", async () => {
  const root = await fixture("agentplaybooks-pull-");
  const state = {
    playbooks: [{
      id: "11111111-2222-4333-8444-555555555555",
      guid: "abc123",
      name: "Team playbook",
      config: {},
      skills: [
        { id: "s1", name: "release", description: "Prepare a release.", content: "Use the checklist.\n" },
        { id: "s2", name: "triage", description: "Triage bugs.", content: "---\nname: triage\ndescription: Triage bugs.\n---\nSteps.\n" },
      ],
    }],
  };
  const { fetchImpl } = fakeApi(state);

  // Resolved via GUID through the list endpoint.
  const plan = await planPull(root, "abc123", { url: URL_BASE, apiKey: API_KEY, fetchImpl });
  assert.equal(plan.playbook.id, state.playbooks[0].id);
  assert.deepEqual(plan.actions.map((action) => action.path).sort(), [
    ".agents/skills/release/SKILL.md",
    ".agents/skills/triage/SKILL.md",
  ]);
  assert.equal(plan.conflicts.length, 0);

  await applyPull(root, plan);
  const release = await readFile(path.join(root, ".agents", "skills", "release", "SKILL.md"), "utf8");
  assert.match(release, /^---\nname: release\ndescription: Prepare a release\.\n---\n/);
  const triage = await readFile(path.join(root, ".agents", "skills", "triage", "SKILL.md"), "utf8");
  assert.match(triage, /^---\nname: triage/);

  const link = await readLink(root);
  assert.equal(link.guid, "abc123");
  assert.equal(link.url, URL_BASE);

  // Re-planning after apply converges to no actions.
  const followUp = await planPull(root, "abc123", { url: URL_BASE, apiKey: API_KEY, fetchImpl });
  assert.equal(followUp.actions.length, 0);
  assert.equal(followUp.conflicts.length, 0);
});

test("global push uploads this machine's skills and never its MCP configuration", async () => {
  const home = await fixture("agentplaybooks-global-push-");
  await put(home, ".claude/skills/task-admin/SKILL.md", "---\nname: task-admin\ndescription: Log work items.\n---\nSteps.\n");
  await put(home, ".cursor/skills/review/SKILL.md", "---\nname: review\ndescription: Review a diff.\n---\nSteps.\n");
  // A home-scoped MCP config with a live credential in a header. Uploading it
  // would put the credential in a playbook other people can be given access to.
  await put(home, ".cursor/mcp.json", JSON.stringify({
    mcpServers: { db: { url: "https://db.example.com/mcp", headers: { "X-Password": "plaintext-secret" } } },
  }));
  const { fetchImpl, calls } = fakeApi({ playbooks: [] });

  // `env: {}` alongside `homedir` is how this suite isolates global scans: a
  // real HERMES_HOME (or %LOCALAPPDATA%) overrides the profile location by
  // design, so without it a developer's own Hermes skills leak into the fixture
  // and this assertion fails on their machine but passes in CI.
  const plan = await planGlobalPush({ url: URL_BASE, apiKey: API_KEY, fetchImpl, homedir: home, env: {} });

  assert.equal(plan.scope, "global");
  assert.deepEqual(plan.skills.map((skill) => skill.name).sort(), ["review", "task-admin"]);
  assert.deepEqual(plan.mcpServers, []);
  assert.ok(!plan.actions.some((action) => action.kind === "mcp"));

  const result = await applyPush(home, plan, { apiKey: API_KEY, fetchImpl });
  const bodies = JSON.stringify(calls.map((call) => call.body));
  assert.ok(!bodies.includes("plaintext-secret"));
  // The machine is linked to its own playbook, in our own directory.
  const link = await readLink(home);
  assert.equal(link.guid, result.guid);
});

test("pull writes the playbook persona to the portable store, ignoring the API default", async () => {
  const root = await fixture("agentplaybooks-pull-persona-");
  const state = {
    playbooks: [{
      id: "11111111-2222-4333-8444-555555555555",
      guid: "abc123",
      name: "Team playbook",
      config: {},
      skills: [],
      persona: { name: "Release manager", system_prompt: "You ship releases carefully." },
    }],
  };
  const { fetchImpl } = fakeApi(state);

  const plan = await planPull(root, "abc123", { url: URL_BASE, apiKey: API_KEY, fetchImpl });
  const persona = plan.actions.find((action) => action.kind === "persona");
  assert.equal(persona.path, ".agents/persona.md");

  await applyPull(root, plan);
  assert.equal(await readFile(path.join(root, ".agents", "persona.md"), "utf8"), "You ship releases carefully.\n");

  // A playbook that never set a persona gets the API's stock sentence, which
  // must not become an identity file.
  const bare = await fixture("agentplaybooks-pull-persona-default-");
  state.playbooks[0].persona = { name: "Assistant", system_prompt: "You are a helpful AI assistant." };
  const barePlan = await planPull(bare, "abc123", { url: URL_BASE, apiKey: API_KEY, fetchImpl });
  assert.equal(barePlan.actions.filter((action) => action.kind === "persona").length, 0);
});

test("pull preserves client-specific frontmatter on a remote skill", async () => {
  const root = await fixture("agentplaybooks-pull-frontmatter-");
  const state = {
    playbooks: [{
      id: "11111111-2222-4333-8444-555555555555",
      guid: "abc123",
      name: "Team playbook",
      config: {},
      skills: [{
        id: "s1",
        name: "deploy",
        description: "Deploy the service.",
        // A skill authored for Hermes Agent: fields outside the Agent Skills
        // spec that only its own client understands.
        content: `---
name: deploy
description: Deploy the service.
version: 1.2.0
platforms: [linux, macos]
metadata:
  hermes:
    category: devops
required_environment_variables:
  - DEPLOY_TOKEN
---
Run the deploy script.
`,
      }],
    }],
  };
  const { fetchImpl } = fakeApi(state);

  const plan = await planPull(root, "abc123", { url: URL_BASE, apiKey: API_KEY, fetchImpl });
  await applyPull(root, plan);

  const written = await readFile(path.join(root, ".agents", "skills", "deploy", "SKILL.md"), "utf8");
  assert.match(written, /version: 1\.2\.0/);
  assert.match(written, /platforms:/);
  assert.match(written, /category: devops/);
  assert.match(written, /DEPLOY_TOKEN/);
});

test("pull emits valid YAML frontmatter for descriptions containing YAML punctuation", async () => {
  const root = await fixture("agentplaybooks-pull-yaml-");
  const state = {
    playbooks: [{
      id: "11111111-2222-4333-8444-555555555555",
      guid: "abc123",
      name: "Team playbook",
      config: {},
      skills: [{
        id: "s1",
        name: "code-review",
        description: "Use when: a pull request needs review.",
        content: "# Review\nCheck the diff.\n",
      }],
    }],
  };
  const { fetchImpl } = fakeApi(state);

  const plan = await planPull(root, "abc123", { url: URL_BASE, apiKey: API_KEY, fetchImpl });
  await applyPull(root, plan);
  const content = await readFile(path.join(root, ".agents", "skills", "code-review", "SKILL.md"), "utf8");

  assert.match(content, /name: code-review/);
  assert.match(content, /description: "Use when: a pull request needs review\."/);
  assert.match(content, /# Review/);
});

test("pull reports a conflict for differing local content instead of overwriting", async () => {
  const root = await fixture("agentplaybooks-pull-conflict-");
  await put(root, ".agents/skills/release/SKILL.md", "local variant\n");
  const state = {
    playbooks: [{
      id: "11111111-2222-4333-8444-555555555555",
      guid: "abc123",
      name: "Team playbook",
      config: {},
      skills: [{ id: "s1", name: "release", description: "Prepare a release.", content: "remote variant\n" }],
    }],
  };
  const { fetchImpl } = fakeApi(state);

  const plan = await planPull(root, "abc123", { url: URL_BASE, apiKey: API_KEY, fetchImpl });
  assert.equal(plan.actions.length, 0);
  assert.equal(plan.conflicts.length, 1);
  await applyPull(root, plan);
  assert.equal(await readFile(path.join(root, ".agents", "skills", "release", "SKILL.md"), "utf8"), "local variant\n");
});

test("push creates a playbook with local skills and links the project", async () => {
  const root = await fixture("agentplaybooks-push-");
  await put(root, ".claude/skills/release/SKILL.md", "---\nname: release\ndescription: Prepare a release.\n---\nChecklist.\n");
  const state = { playbooks: [] };
  const { fetchImpl, calls } = fakeApi(state);

  const plan = await planPush(root, { url: URL_BASE, apiKey: API_KEY, fetchImpl });
  assert.equal(plan.remote, null);
  assert.deepEqual(plan.actions.map((action) => `${action.kind}:${action.action}`), ["snapshot:create", "playbook:create", "skill:create"]);

  const result = await applyPush(root, plan, { apiKey: API_KEY, fetchImpl });
  assert.equal(state.playbooks.length, 1);
  assert.equal(state.playbooks[0].skills.length, 1);
  assert.equal(state.playbooks[0].skills[0].name, "release");
  assert.ok(state.playbooks[0].config.agentplaybook);
  assert.equal(state.playbooks[0].config.agentplaybook.metadata.generatedAt, undefined);

  const link = await readLink(root);
  assert.equal(link.playbookId, result.playbookId);

  // No secret values anywhere in what was sent.
  const sent = JSON.stringify(calls);
  assert.doesNotMatch(sent, /apb_test_key/);
});

test("push updates only changed skills on a linked playbook", async () => {
  const root = await fixture("agentplaybooks-push-update-");
  const skillContent = "---\nname: release\ndescription: Prepare a release.\n---\nChecklist.\n";
  await put(root, ".claude/skills/release/SKILL.md", skillContent);
  const playbookId = "11111111-2222-4333-8444-555555555555";
  await put(root, ".agentplaybooks/remote.json", JSON.stringify({ url: URL_BASE, playbookId, guid: "abc123", name: "Team playbook" }));
  const state = {
    playbooks: [{
      id: playbookId,
      guid: "abc123",
      name: "Team playbook",
      config: {},
      skills: [{ id: "s1", name: "release", description: "Prepare a release.", content: skillContent }],
    }],
  };
  const { fetchImpl } = fakeApi(state);

  const plan = await planPush(root, { url: URL_BASE, apiKey: API_KEY, fetchImpl });
  assert.equal(plan.remote.id, playbookId);
  assert.equal(plan.actions.filter((action) => action.kind === "skill").length, 0);

  // Change the local skill: exactly one skill update is planned.
  await put(root, ".claude/skills/release/SKILL.md", `${skillContent}More.\n`);
  const changedPlan = await planPush(root, { url: URL_BASE, apiKey: API_KEY, fetchImpl });
  const skillActions = changedPlan.actions.filter((action) => action.kind === "skill");
  assert.deepEqual(skillActions, [{ kind: "skill", action: "update", name: "release", skillId: "s1" }]);

  await applyPush(root, changedPlan, { apiKey: API_KEY, fetchImpl });
  assert.equal(state.playbooks[0].skills[0].content, `${skillContent}More.\n`);
});

test("push refuses when a skill contains a likely hard-coded credential", async () => {
  const root = await fixture("agentplaybooks-push-secret-");
  await put(root, ".claude/skills/deploy/SKILL.md", "---\nname: deploy\ndescription: Deploy.\n---\napi_key = \"sk-ABCDEFGHIJKLMNOPQRSTUVWX1234\"\n");
  const { fetchImpl } = fakeApi({ playbooks: [] });

  await assert.rejects(
    planPush(root, { url: URL_BASE, apiKey: API_KEY, fetchImpl }),
    /Refusing to push/,
  );
});

test("central backup round-trips skill assets, agents, MCP references, and revision history", async () => {
  const source = await fixture("agentplaybooks-backup-source-");
  const target = await fixture("agentplaybooks-backup-target-");
  const olderTarget = await fixture("agentplaybooks-backup-older-");
  await put(source, "AGENTS.md", "# Project rules\nKeep changes small.\n");
  await put(source, ".agents/skills/release/SKILL.md", "---\nname: release\ndescription: Prepare a release.\n---\nUse the checklist.\n");
  const asset = Buffer.from([0, 1, 2, 255]);
  await put(source, ".agents/skills/release/assets/logo.bin", asset);
  await put(source, ".agents/agents/reviewer.md", "---\nname: reviewer\ndescription: Review code.\n---\nInspect changes.\n");
  await put(source, ".agents/mcp.json", JSON.stringify({ mcpServers: { docs: { url: "https://example.com/mcp", headers: { Authorization: "Bearer ${DOCS_TOKEN}" } } } }));
  const state = { playbooks: [] };
  const { fetchImpl } = fakeApi(state);

  const first = await planPush(source, { url: URL_BASE, apiKey: API_KEY, fetchImpl });
  assert.equal(first.conflicts.length, 0);
  assert.ok(first.actions.some((action) => action.kind === "snapshot"));
  const pushed = await applyPush(source, first, { apiKey: API_KEY, fetchImpl });
  assert.equal(state.backups.length, 1);
  const originalId = state.backups[0].id;
  assert.equal((await planPush(source, { url: URL_BASE, apiKey: API_KEY, fetchImpl })).actions.some((action) => action.kind === "snapshot"), false);

  const restore = await planPull(target, pushed.guid, { url: URL_BASE, apiKey: API_KEY, fetchImpl });
  assert.equal(restore.conflicts.length, 0);
  await applyPull(target, restore);
  assert.deepEqual(await readFile(path.join(target, ".agents/skills/release/assets/logo.bin")), asset);
  assert.match(await readFile(path.join(target, ".agents/agents/reviewer.md"), "utf8"), /Inspect changes/);
  assert.match(await readFile(path.join(target, ".agents/mcp.json"), "utf8"), /DOCS_TOKEN/);
  assert.equal(await readFile(path.join(target, "AGENTS.md"), "utf8"), "# Project rules\nKeep changes small.\n");
  assert.ok(await readFile(path.join(target, "agentplaybook.json"), "utf8"));

  await put(source, ".agents/skills/release/assets/logo.bin", Buffer.from([9, 8, 7]));
  const second = await planPush(source, { url: URL_BASE, apiKey: API_KEY, fetchImpl });
  assert.ok(second.actions.some((action) => action.kind === "snapshot"));
  await applyPush(source, second, { apiKey: API_KEY, fetchImpl });
  assert.equal(state.backups.length, 2);
  await applyPull(olderTarget, await planPull(olderTarget, pushed.guid, { url: URL_BASE, apiKey: API_KEY, fetchImpl, snapshotId: originalId }));
  assert.deepEqual(await readFile(path.join(olderTarget, ".agents/skills/release/assets/logo.bin")), asset);

  state.playbooks = []; // The backup survives deletion of the hosted playbook.
  const recovered = await fixture("agentplaybooks-backup-recovered-");
  const orphanPlan = await planPull(recovered, pushed.guid, { url: URL_BASE, apiKey: API_KEY, fetchImpl });
  await applyPull(recovered, orphanPlan);
  assert.deepEqual(await readFile(path.join(recovered, ".agents/skills/release/assets/logo.bin")), Buffer.from([9, 8, 7]));
});
