/**
 * A skill is a directory, not a single document: `SKILL.md` plus the scripts
 * and references its instructions reach for. These tests cover that round trip
 * -- a skill's files going up with `push` and coming back down with `pull` --
 * because a skill that arrives without them is instructions pointing at
 * nothing.
 */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { applyPull, applyPush, planPull, planPush } from "../src/remote.js";

const URL_BASE = "https://remote.test";
const API_KEY = "apb_test_key";

async function fixture(prefix) {
  return mkdtemp(path.join(tmpdir(), prefix));
}

async function put(root, relativePath, content) {
  const target = path.join(root, ...relativePath.split("/"));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}

/**
 * The subset of the hosted API these tests exercise, including the attachment
 * endpoints. Attachments live on the skill the way the real API returns them:
 * embedded in the playbook detail response, with an id.
 */
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
      return respond(200, state.playbooks.map(({ id, guid, name }) => ({ id, guid, name })));
    }

    const detail = pathname.match(/^\/api\/manage\/playbooks\/([^/]+)$/);
    if (detail) {
      const playbook = state.playbooks.find((item) => item.id === detail[1]);
      if (!playbook) return respond(404, { error: "Playbook not found" });
      if (method === "GET") return respond(200, playbook);
      if (method === "PUT") {
        Object.assign(playbook, body);
        return respond(200, playbook);
      }
    }

    const snapshots = pathname.match(/^\/api\/manage\/playbooks\/([^/]+)\/snapshots$/);
    if (method === "POST" && snapshots) {
      const snapshot = { id: `backup-${(state.backups ?? []).length + 1}`, snapshot: body.snapshot };
      state.backups = [...(state.backups ?? []), snapshot];
      return respond(201, snapshot);
    }

    const skills = pathname.match(/^\/api\/manage\/playbooks\/([^/]+)\/skills$/);
    if (method === "POST" && skills) {
      const playbook = state.playbooks.find((item) => item.id === skills[1]);
      const skill = { id: `skill-${playbook.skills.length + 1}`, attachments: [], ...body };
      playbook.skills.push(skill);
      return respond(201, skill);
    }

    const attachments = pathname.match(/^\/api\/manage\/skills\/([^/]+)\/attachments$/);
    if (method === "POST" && attachments) {
      const skill = state.playbooks.flatMap((item) => item.skills).find((item) => item.id === attachments[1]);
      if (!skill) return respond(404, { error: "Skill not found" });
      const attachment = { id: `file-${(skill.attachments ?? []).length + 1}`, ...body };
      skill.attachments = [...(skill.attachments ?? []), attachment];
      return respond(201, attachment);
    }

    const attachment = pathname.match(/^\/api\/manage\/skills\/([^/]+)\/attachments\/([^/]+)$/);
    if (method === "PUT" && attachment) {
      const skill = state.playbooks.flatMap((item) => item.skills).find((item) => item.id === attachment[1]);
      const file = skill?.attachments?.find((item) => item.id === attachment[2]);
      if (!file) return respond(404, { error: "Attachment not found" });
      Object.assign(file, body);
      return respond(200, file);
    }

    return respond(404, { error: `No route for ${method} ${pathname}` });
  };

  return { fetchImpl, calls };
}

const PLAYBOOK_ID = "11111111-2222-4333-8444-555555555555";

function playbookWith(skills) {
  return {
    playbooks: [{
      id: PLAYBOOK_ID,
      guid: "abc123",
      name: "Office playbook",
      config: {},
      skills,
    }],
  };
}

/**
 * Link the working tree to the playbook, the way a previous `pull` or `push`
 * would have. Without it a push plans a brand new playbook, which is a
 * different path from the one these tests are about.
 */
async function link(root) {
  await put(root, ".agentplaybooks/remote.json", `${JSON.stringify({
    url: URL_BASE,
    playbookId: PLAYBOOK_ID,
    guid: "abc123",
    name: "Office playbook",
  })}
`);
}

test("pull writes a skill's bundled files next to its SKILL.md", async () => {
  const root = await fixture("apb-pull-files-");
  const state = playbookWith([{
    id: "s1",
    name: "office-live",
    description: "Drive the open Office document.",
    content: "Import the module in scripts/.\n",
    attachments: [
      { id: "f1", filename: "scripts/office.py", content: "def attach():\n    pass\n" },
      { id: "f2", filename: "references/api.md", content: "# API\n" },
    ],
  }]);
  const { fetchImpl } = fakeApi(state);

  const plan = await planPull(root, "abc123", { url: URL_BASE, apiKey: API_KEY, fetchImpl });
  const written = plan.actions.filter((action) => action.kind === "skill-file").map((action) => action.path);
  assert.deepEqual(written.sort(), [
    ".agents/skills/office-live/references/api.md",
    ".agents/skills/office-live/scripts/office.py",
  ]);

  await applyPull(root, plan);
  const script = await readFile(path.join(root, ".agents/skills/office-live/scripts/office.py"), "utf8");
  assert.equal(script, "def attach():\n    pass\n");
});

test("pull refuses a remote file name that is not a safe path", async () => {
  const root = await fixture("apb-pull-unsafe-");
  const state = playbookWith([{
    id: "s1",
    name: "office-live",
    description: "Drive the open Office document.",
    content: "Body.\n",
    attachments: [
      { id: "f1", filename: "../../../etc/passwd", content: "root\n" },
      { id: "f2", filename: "secrets/key.txt", content: "shh\n" },
    ],
  }]);
  const { fetchImpl } = fakeApi(state);

  const plan = await planPull(root, "abc123", { url: URL_BASE, apiKey: API_KEY, fetchImpl });
  assert.equal(plan.actions.filter((action) => action.kind === "skill-file").length, 0);
  assert.equal(plan.conflicts.filter((item) => item.kind === "skill-file").length, 2);
});

test("pull reports a local file that differs rather than overwriting it", async () => {
  const root = await fixture("apb-pull-differs-");
  await put(root, ".agents/skills/office-live/scripts/office.py", "mine\n");
  const state = playbookWith([{
    id: "s1",
    name: "office-live",
    description: "Drive the open Office document.",
    content: "Body.\n",
    attachments: [{ id: "f1", filename: "scripts/office.py", content: "theirs\n" }],
  }]);
  const { fetchImpl } = fakeApi(state);

  const plan = await planPull(root, "abc123", { url: URL_BASE, apiKey: API_KEY, fetchImpl });
  assert.equal(plan.actions.filter((action) => action.kind === "skill-file").length, 0);
  assert.match(plan.conflicts[0].reason, /differs from the remote file/);

  await applyPull(root, plan);
  assert.equal(await readFile(path.join(root, ".agents/skills/office-live/scripts/office.py"), "utf8"), "mine\n");
});

test("push uploads the files beside a skill and updates one that changed", async () => {
  const root = await fixture("apb-push-files-");
  await put(root, ".agents/skills/office-live/SKILL.md",
    "---\nname: office-live\ndescription: Drive the open Office document.\n---\n\nImport scripts/office.py.\n");
  await put(root, ".agents/skills/office-live/scripts/office.py", "def attach():\n    return 1\n");
  await put(root, ".agents/skills/office-live/references/api.md", "# API\n");
  await link(root);

  const state = playbookWith([]);
  const { fetchImpl, calls } = fakeApi(state);

  const plan = await planPush(root, { url: URL_BASE, apiKey: API_KEY, fetchImpl });
  assert.deepEqual(
    plan.actions.filter((action) => action.kind === "skill-file").map((action) => action.name).sort(),
    ["office-live/references/api.md", "office-live/scripts/office.py"],
  );
  await applyPush(root, plan, { apiKey: API_KEY, fetchImpl });

  const uploaded = calls.filter((call) => call.path.endsWith("/attachments") && call.method === "POST");
  assert.deepEqual(uploaded.map((call) => call.body.filename).sort(), ["references/api.md", "scripts/office.py"]);
  assert.equal(state.playbooks[0].skills[0].attachments.length, 2);

  // Second push with one file changed: an update in place, nothing re-created.
  await put(root, ".agents/skills/office-live/scripts/office.py", "def attach():\n    return 2\n");
  const second = await planPush(root, { url: URL_BASE, apiKey: API_KEY, fetchImpl });
  const fileActions = second.actions.filter((action) => action.kind === "skill-file");
  assert.equal(fileActions.length, 1);
  assert.equal(fileActions[0].action, "update");
  assert.equal(fileActions[0].name, "office-live/scripts/office.py");

  await applyPush(root, second, { apiKey: API_KEY, fetchImpl });
  const stored = state.playbooks[0].skills[0].attachments.find((file) => file.filename === "scripts/office.py");
  assert.equal(stored.content, "def attach():\n    return 2\n");
});

test("push leaves a remote file the working tree no longer has", async () => {
  const root = await fixture("apb-push-keep-");
  await put(root, ".agents/skills/office-live/SKILL.md",
    "---\nname: office-live\ndescription: Drive the open Office document.\n---\n\nBody.\n");
  await link(root);

  const state = playbookWith([{
    id: "s1",
    name: "office-live",
    description: "Drive the open Office document.",
    content: "---\nname: office-live\ndescription: Drive the open Office document.\n---\n\nBody.\n",
    attachments: [{ id: "f1", filename: "scripts/office.py", content: "still here\n" }],
  }]);
  const { fetchImpl } = fakeApi(state);

  const plan = await planPush(root, { url: URL_BASE, apiKey: API_KEY, fetchImpl });
  assert.equal(plan.actions.filter((action) => action.kind === "skill-file").length, 0);
  await applyPush(root, plan, { apiKey: API_KEY, fetchImpl });
  assert.equal(state.playbooks[0].skills[0].attachments.length, 1);
});

test("push keeps a file too large for hosted attachments in its portable snapshot", async () => {
  const root = await fixture("apb-push-large-");
  await put(root, ".agents/skills/office-live/SKILL.md",
    "---\nname: office-live\ndescription: Drive the open Office document.\n---\n\nBody.\n");
  await put(root, ".agents/skills/office-live/scripts/huge.py", "x".repeat(262145));

  const state = playbookWith([]);
  const { fetchImpl } = fakeApi(state);

  const plan = await planPush(root, { url: URL_BASE, apiKey: API_KEY, fetchImpl });
  const warning = plan.warnings.find((item) => item.kind === "skill-file");
  assert.ok(warning, "the hosted attachment limit must be reported");
  assert.match(warning.reason, /262145 bytes/);
  assert.equal(plan.conflicts.length, 0);
  assert.ok(plan.snapshot.files.some((file) => file.path === ".agents/skills/office-live/scripts/huge.py"));
  assert.equal(plan.actions.filter((action) => action.kind === "skill-file").length, 0);
});
