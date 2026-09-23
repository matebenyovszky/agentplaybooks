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
const INSTRUCTIONS = "# Project rules\n\nUse pnpm. Run the tests before committing.\n";

async function fixture() {
  return mkdtemp(path.join(tmpdir(), "agentplaybooks-instr-"));
}

async function put(root, relativePath, content) {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
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
      playbook = {
        id: PLAYBOOK_ID,
        guid: "abc123",
        name: body.name,
        config: body.config ?? {},
        instructions: body.instructions ?? null,
        skills: [],
        mcp_servers: [],
      };
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
    return respond(404, { error: `No route for ${method} ${pathname}` });
  };
  return { fetchImpl, current: () => playbook };
}

test("push uploads the project-root instruction file as playbook instructions", async () => {
  const root = await fixture();
  await put(root, "AGENTS.md", INSTRUCTIONS);
  const api = fakeApi(null);

  const plan = await planPush(root, { url: URL_BASE, apiKey: API_KEY, fetchImpl: api.fetchImpl });
  assert.deepEqual(
    plan.actions.filter((action) => action.kind === "instructions"),
    [{ kind: "instructions", action: "create", name: "AGENTS.md" }],
  );

  await applyPush(root, plan, { apiKey: API_KEY, fetchImpl: api.fetchImpl });
  assert.equal(api.current().instructions, INSTRUCTIONS);

  const followUp = await planPush(root, { url: URL_BASE, apiKey: API_KEY, fetchImpl: api.fetchImpl });
  assert.equal(followUp.actions.filter((action) => action.kind === "instructions").length, 0);
});

test("AGENTS.md wins over CLAUDE.md, and disagreeing root files are a conflict", async () => {
  const shared = await fixture();
  await put(shared, "AGENTS.md", INSTRUCTIONS);
  await put(shared, "CLAUDE.md", INSTRUCTIONS);
  const agreeing = await planPush(shared, { url: URL_BASE, apiKey: API_KEY, fetchImpl: fakeApi(null).fetchImpl });
  assert.equal(agreeing.instructions.source, "AGENTS.md");
  assert.equal(agreeing.conflicts.length, 0);

  const diverged = await fixture();
  await put(diverged, "AGENTS.md", INSTRUCTIONS);
  await put(diverged, "CLAUDE.md", "# Different rules\n");
  const plan = await planPush(diverged, { url: URL_BASE, apiKey: API_KEY, fetchImpl: fakeApi(null).fetchImpl });
  assert.equal(plan.instructions, null);
  assert.equal(plan.actions.filter((action) => action.kind === "instructions").length, 0);
  assert.match(plan.conflicts.find((item) => item.kind === "instructions").reason, /differ from each other/);
});

test("a generated CLAUDE.md import is the same project instruction source", async () => {
  const root = await fixture();
  await put(root, "AGENTS.md", INSTRUCTIONS);
  await put(root, "CLAUDE.md", "@AGENTS.md\n");
  const plan = await planPush(root, { url: URL_BASE, apiKey: API_KEY, fetchImpl: fakeApi(null).fetchImpl });
  assert.equal(plan.conflicts.length, 0);
  assert.equal(plan.instructions.content, INSTRUCTIONS);
  assert.ok(plan.actions.some((action) => action.kind === "snapshot"));
});

test("nested instruction files stay local", async () => {
  const root = await fixture();
  await put(root, "packages/api/AGENTS.md", "# Scoped to the api package\n");
  const plan = await planPush(root, { url: URL_BASE, apiKey: API_KEY, fetchImpl: fakeApi(null).fetchImpl });
  assert.equal(plan.instructions, null);
  assert.equal(plan.conflicts.length, 0);
});

test("push leaves remote instructions alone when the project has none", async () => {
  const root = await fixture();
  await put(root, ".agentplaybooks/remote.json", JSON.stringify({ url: URL_BASE, playbookId: PLAYBOOK_ID, guid: "abc123", name: "Team playbook" }));
  const api = fakeApi({
    id: PLAYBOOK_ID, guid: "abc123", name: "Team playbook", config: {},
    instructions: INSTRUCTIONS, skills: [], mcp_servers: [],
  });

  const plan = await planPush(root, { url: URL_BASE, apiKey: API_KEY, fetchImpl: api.fetchImpl });
  assert.equal(plan.actions.filter((action) => action.kind === "instructions").length, 0);
  await applyPush(root, plan, { apiKey: API_KEY, fetchImpl: api.fetchImpl });
  assert.equal(api.current().instructions, INSTRUCTIONS);
});

test("pull writes AGENTS.md and the claude target bridges it with an import", async () => {
  const root = await fixture();
  const home = await fixture();
  await mkdir(path.join(home, ".claude"), { recursive: true });
  const api = fakeApi({
    id: PLAYBOOK_ID, guid: "abc123", name: "Team playbook", config: {},
    instructions: INSTRUCTIONS, skills: [], mcp_servers: [],
  });

  const pullPlan = await planPull(root, "abc123", { url: URL_BASE, apiKey: API_KEY, fetchImpl: api.fetchImpl });
  const action = pullPlan.actions.find((item) => item.kind === "instructions");
  assert.equal(action.path, "AGENTS.md");
  await applyPull(root, pullPlan);
  assert.equal(await readFile(path.join(root, "AGENTS.md"), "utf8"), INSTRUCTIONS);

  // Claude Code does not read AGENTS.md, so the adapter writes a CLAUDE.md that
  // imports it rather than copying the text.
  const syncPlan = await planSync(root, { homedir: home, targets: ["claude"] });
  const bridge = syncPlan.fileActions.find((item) => item.kind === "instructions");
  assert.equal(bridge.path, "CLAUDE.md");
  await applySync(syncPlan);
  const claudeFile = await readFile(path.join(root, "CLAUDE.md"), "utf8");
  assert.match(claudeFile, /@AGENTS\.md/);
  assert.doesNotMatch(claudeFile, /Use pnpm/);

  // Converges, and the bridge file never becomes a push conflict.
  const syncAgain = await planSync(root, { homedir: home, targets: ["claude"] });
  assert.equal(syncAgain.fileActions.length, 0);
  assert.equal(syncAgain.conflicts.length, 0);
  const pullAgain = await planPull(root, "abc123", { url: URL_BASE, apiKey: API_KEY, fetchImpl: api.fetchImpl });
  assert.deepEqual(pullAgain.actions, []);
  assert.deepEqual(pullAgain.conflicts, []);
});

test("an existing CLAUDE.md without the import is reported, never rewritten", async () => {
  const root = await fixture();
  await put(root, "AGENTS.md", INSTRUCTIONS);
  await put(root, "CLAUDE.md", "# My own notes\n");

  const plan = await planSync(root, { targets: ["claude"] });
  assert.equal(plan.fileActions.filter((item) => item.kind === "instructions").length, 0);
  assert.match(
    plan.conflicts.find((item) => item.kind === "instructions").reason,
    /does not import AGENTS\.md/,
  );

  await applySync(plan);
  assert.equal(await readFile(path.join(root, "CLAUDE.md"), "utf8"), "# My own notes\n");
});

test("push refuses when the instruction file contains a literal credential", async () => {
  const root = await fixture();
  await put(root, "AGENTS.md", "# Rules\n\nDeploy with api_key = \"sk-ABCDEFGHIJKLMNOPQRSTUVWX1234\"\n");
  await assert.rejects(
    planPush(root, { url: URL_BASE, apiKey: API_KEY, fetchImpl: fakeApi(null).fetchImpl }),
    /Refusing to push/,
  );
});
