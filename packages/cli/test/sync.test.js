import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { applySync, planSync } from "../src/sync.js";

async function fixture() {
  return mkdtemp(path.join(tmpdir(), "agentplaybooks-sync-"));
}

async function put(root, relativePath, content) {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
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
  assert.doesNotMatch(manifestText, /DEPLOY_API_KEY/);
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
