import assert from "node:assert/strict";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { printDoctor, publicReport, runDoctor } from "../src/doctor.js";
import { applySync, planSync } from "../src/sync.js";

async function fixture() {
  return mkdtemp(path.join(tmpdir(), "agentplaybooks-sync-"));
}

async function put(root, relativePath, content) {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}

function capturePrint(report) {
  const lines = [];
  const original = console.log;
  console.log = (...args) => lines.push(args.map(String).join(" "));
  try {
    printDoctor(report);
  } finally {
    console.log = original;
  }
  return lines.join("\n");
}

async function listFiles(root) {
  const files = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else files.push(path.relative(root, full).split(path.sep).join("/"));
    }
  }
  await walk(root);
  return files.sort();
}

const HELLO_SKILL = "---\nname: hello\ndescription: Greet the user.\n---\nSay hello.\n";
const CLAUDE_MCP = `${JSON.stringify({ mcpServers: { docs: { url: "https://example.com/mcp" } } }, null, 2)}\n`;

async function claudeOnlyFixture() {
  const root = await fixture();
  await put(root, "AGENTS.md", "# Project guidance\nRun tests.\n");
  await put(root, ".claude/skills/hello/SKILL.md", HELLO_SKILL);
  await put(root, ".mcp.json", CLAUDE_MCP);
  return root;
}

test("sync is plan-only until apply and writes a safe manifest", async () => {
  const root = await fixture();
  await put(root, ".claude/skills/release/SKILL.md", "---\nname: release\ndescription: Prepare a release.\n---\nUse the release checklist.\n");
  await put(root, ".mcp.json", JSON.stringify({
    mcpServers: {
      deploy: {
        command: "npx",
        args: ["deploy-mcp"],
        env: { API_KEY: "${DEPLOY_API_KEY}" }
      },
      // A server whose URL embeds a literal token: the manifest records the
      // connection, never the credential itself.
      search: {
        url: "https://mcp.example.com/http?token=sk-LITERALVALUE1234567890"
      }
    }
  }));

  const plan = await planSync(root);
  assert.equal(plan.action, "create");
  assert.equal(plan.changed, true);
  await assert.rejects(readFile(plan.manifestPath, "utf8"), { code: "ENOENT" });

  const result = await applySync(plan);
  assert.equal(result.applied, true);
  assert.equal(result.backupPath, null);

  const manifestText = await readFile(plan.manifestPath, "utf8");
  const manifest = JSON.parse(manifestText);
  assert.equal(manifest.apiVersion, "agentplaybooks.ai/v1alpha1");
  assert.equal(manifest.spec.policies.physicalActions, "deny");
  assert.equal(manifest.spec.governance.environment, "draft");
  assert.equal(manifest.spec.skills[0].name, "release");

  // Secret values never enter the manifest; the reference by name does, so the
  // playbook can state what it needs on another machine.
  assert.doesNotMatch(manifestText, /sk-LITERALVALUE1234567890/);
  assert.doesNotMatch(manifestText, /"npx"/);
  assert.deepEqual(manifest.spec.secrets, [
    { name: "DEPLOY_API_KEY", ref: "env:DEPLOY_API_KEY", required: true },
  ]);
});

test("sync backs up an existing manifest before update", async () => {
  const root = await fixture();
  await put(root, "AGENTS.md", "# Initial instructions\n");
  const initialPlan = await planSync(root);
  await applySync(initialPlan);
  const original = await readFile(initialPlan.manifestPath, "utf8");

  await put(root, "AGENTS.md", "# Updated instructions\n");
  const updatePlan = await planSync(root);
  assert.equal(updatePlan.action, "update");
  const result = await applySync(updatePlan);

  assert.ok(result.backupPath);
  assert.equal(await readFile(result.backupPath, "utf8"), original);
  assert.notEqual(await readFile(updatePlan.manifestPath, "utf8"), original);
});

test("sync preserves robot targets and enforced policy from an existing manifest", async () => {
  const root = await fixture();
  await put(root, "AGENTS.md", "# Project instructions\n");
  const initialPlan = await planSync(root);
  const existing = initialPlan.manifest;
  existing.spec.targets.push({ id: "factory-robot", type: "ros2", enabled: true, config: { namespace: "/cell-a" } });
  existing.spec.policies.physicalActions = "simulate";
  existing.spec.policies.emergencyStopRequired = true;
  existing.spec.governance.environment = "staging";
  existing.spec.governance.approvalRequired = true;
  await put(root, "agentplaybook.json", `${JSON.stringify(existing, null, 2)}\n`);

  await put(root, "AGENTS.md", "# Updated project instructions\n");
  const updatePlan = await planSync(root);
  const robot = updatePlan.manifest.spec.targets.find((target) => target.id === "factory-robot");

  assert.equal(robot.type, "ros2");
  assert.equal(robot.config.namespace, "/cell-a");
  assert.equal(updatePlan.manifest.spec.policies.physicalActions, "simulate");
  assert.equal(updatePlan.manifest.spec.policies.emergencyStopRequired, true);
  assert.equal(updatePlan.manifest.spec.governance.environment, "staging");
  assert.equal(updatePlan.manifest.spec.governance.approvalRequired, true);
});

test("sync --target=cursor on a Claude-only fixture does not write CLAUDE.md or rewrite Claude files", async () => {
  const root = await claudeOnlyFixture();
  const beforeDoctor = await runDoctor(root);
  assert.deepEqual(publicReport(beforeDoctor).platforms, { present: ["claude"], missing: ["cursor"] });
  assert.match(capturePrint(beforeDoctor), /Platforms: Claude present; Cursor not present\./);

  const claudeSkill = await readFile(path.join(root, ".claude", "skills", "hello", "SKILL.md"), "utf8");
  const claudeMcp = await readFile(path.join(root, ".mcp.json"), "utf8");

  const plan = await planSync(root, { targets: ["cursor"] });
  assert.equal(plan.fileActions.some((action) => action.path === "CLAUDE.md"), false);
  assert.equal(plan.fileActions.some((action) => action.path === ".mcp.json" || action.path.startsWith(".claude/")), false);
  assert.deepEqual(plan.fileActions.map((action) => action.path).sort(), [
    ".cursor/mcp.json",
    ".cursor/skills/hello/SKILL.md",
  ]);

  await applySync(plan);
  assert.deepEqual(await listFiles(root), [
    ".claude/skills/hello/SKILL.md",
    ".cursor/mcp.json",
    ".cursor/skills/hello/SKILL.md",
    ".mcp.json",
    "AGENTS.md",
    "agentplaybook.json",
  ]);
  assert.equal(await readFile(path.join(root, ".claude", "skills", "hello", "SKILL.md"), "utf8"), claudeSkill);
  assert.equal(await readFile(path.join(root, ".mcp.json"), "utf8"), claudeMcp);
  await assert.rejects(readFile(path.join(root, "CLAUDE.md"), "utf8"), { code: "ENOENT" });
  assert.equal(await readFile(path.join(root, ".cursor", "skills", "hello", "SKILL.md"), "utf8"), HELLO_SKILL);

  const afterDoctor = await runDoctor(root);
  assert.deepEqual(publicReport(afterDoctor).platforms, { present: ["claude", "cursor"], missing: [] });
  assert.match(capturePrint(afterDoctor), /Platforms: Claude present; Cursor present\./);
  assert.doesNotMatch(JSON.stringify(afterDoctor.findings), /sk-/);
});

test("sync --apply without --target still detect-and-enables Claude on a Claude-only fixture", async () => {
  const root = await claudeOnlyFixture();

  const plan = await planSync(root);
  assert.equal(plan.fileActions.some((action) => action.path === "CLAUDE.md" && action.target === "claude"), true);
  assert.equal(plan.fileActions.some((action) => action.path.startsWith(".cursor/")), false);

  await applySync(plan);
  const files = await listFiles(root);
  assert.ok(files.includes("CLAUDE.md"));
  assert.ok(files.includes("agentplaybook.json"));
  assert.equal(files.some((item) => item.startsWith(".cursor/")), false);
  assert.match(await readFile(path.join(root, "CLAUDE.md"), "utf8"), /@AGENTS\.md/);
  assert.equal(await readFile(path.join(root, ".claude", "skills", "hello", "SKILL.md"), "utf8"), HELLO_SKILL);
  assert.equal(await readFile(path.join(root, ".mcp.json"), "utf8"), CLAUDE_MCP);
});

test("sync --target=cursor,claude still writes both on a Claude-only fixture", async () => {
  const root = await claudeOnlyFixture();
  const claudeSkill = await readFile(path.join(root, ".claude", "skills", "hello", "SKILL.md"), "utf8");
  const claudeMcp = await readFile(path.join(root, ".mcp.json"), "utf8");

  const plan = await planSync(root, { targets: ["cursor", "claude"] });
  assert.deepEqual(plan.fileActions.map((action) => action.path).sort(), [
    ".cursor/mcp.json",
    ".cursor/skills/hello/SKILL.md",
    "CLAUDE.md",
  ]);

  await applySync(plan);
  assert.deepEqual(await listFiles(root), [
    ".claude/skills/hello/SKILL.md",
    ".cursor/mcp.json",
    ".cursor/skills/hello/SKILL.md",
    ".mcp.json",
    "AGENTS.md",
    "CLAUDE.md",
    "agentplaybook.json",
  ]);
  assert.match(await readFile(path.join(root, "CLAUDE.md"), "utf8"), /@AGENTS\.md/);
  assert.equal(await readFile(path.join(root, ".claude", "skills", "hello", "SKILL.md"), "utf8"), claudeSkill);
  assert.equal(await readFile(path.join(root, ".mcp.json"), "utf8"), claudeMcp);
});
