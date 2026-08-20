import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
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
  assert.deepEqual(plan.actions.map((action) => `${action.kind}:${action.action}`), ["playbook:create", "skill:create"]);

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
