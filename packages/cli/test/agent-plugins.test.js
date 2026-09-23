import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { MCP_SCHEMA, PLUGIN_SCHEMA, applyPluginPlan, planPluginExport, planPluginImport } from "../src/agent-plugins.js";
import { applySync, planSync } from "../src/sync.js";

async function fixture() {
  return mkdtemp(path.join(tmpdir(), "agentplaybooks-plugin-"));
}

async function put(root, relative, content) {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
}

const SKILL = "---\nname: release\ndescription: Prepare a release.\n---\nUse the checklist.\n";
const AGENT = "---\nname: security-reviewer\ndescription: Review code for vulnerabilities.\ntools:\n  - Read\n  - Grep\nmodel: fast\nextensions:\n  gemini:\n    kind: local\n    temperature: 0.2\n---\nInspect the change and explain concrete risks.\n";

test("Copilot and Gemini adapters receive skills, agents, and their native MCP files", async () => {
  const root = await fixture();
  await put(root, ".agents/skills/release/SKILL.md", SKILL);
  await put(root, ".agents/agents/security-reviewer.md", AGENT);
  await put(root, ".agents/mcp.json", JSON.stringify({ mcpServers: { docs: { url: "https://example.com/mcp" } } }));

  const targets = ["copilot", "gemini"];
  const plan = await planSync(root, { targets });
  const paths = plan.fileActions.map((action) => action.path).sort();
  assert.deepEqual(paths, [
    ".gemini/agents/security-reviewer.md",
    ".gemini/settings.json",
    ".gemini/skills/release/SKILL.md",
    ".github/agents/security-reviewer.agent.md",
    ".github/skills/release/SKILL.md",
    ".mcp.json",
  ]);

  await applySync(plan);
  const gemini = JSON.parse(await readFile(path.join(root, ".gemini", "settings.json"), "utf8"));
  assert.equal(gemini.mcpServers.docs.url, "https://example.com/mcp");
  assert.match(await readFile(path.join(root, ".gemini", "agents", "security-reviewer.md"), "utf8"), /temperature: 0\.2/);
  assert.match(await readFile(path.join(root, ".github", "agents", "security-reviewer.agent.md"), "utf8"), /tools:\r?\n {2}- Read/);

  const followUp = await planSync(root, { targets });
  assert.equal(followUp.fileActions.length, 0);
  assert.equal(followUp.conflicts.length, 0);
  const autodetected = await planSync(root);
  assert.equal(autodetected.manifest.spec.targets.some((target) => target.type === "claude"), false);
});

test("one portable custom agent converges across Claude, Cursor, Codex, Copilot, and Gemini", async () => {
  const root = await fixture();
  await put(root, ".agents/agents/security-reviewer.md", AGENT);
  const targets = ["claude", "cursor", "codex", "copilot", "gemini"];
  const plan = await planSync(root, { targets });
  assert.deepEqual(plan.fileActions.map((action) => action.path).sort(), [
    ".claude/agents/security-reviewer.md",
    ".codex/agents/security-reviewer.toml",
    ".cursor/agents/security-reviewer.md",
    ".gemini/agents/security-reviewer.md",
    ".github/agents/security-reviewer.agent.md",
  ]);
  await applySync(plan);
  assert.match(await readFile(path.join(root, ".codex", "agents", "security-reviewer.toml"), "utf8"), /developer_instructions/);
  const followUp = await planSync(root, { targets });
  assert.equal(followUp.fileActions.length, 0);
  assert.equal(followUp.conflicts.length, 0);
});

test("Agent Plugins export/import round-trips resources, custom agents, MCP, and secret bindings", async () => {
  const source = await fixture();
  const output = path.join(await fixture(), "plugin");
  const target = await fixture();
  await put(source, ".agents/skills/release/SKILL.md", SKILL);
  await put(source, ".agents/skills/release/references/checklist.md", "# Checklist\n");
  await put(source, ".agents/agents/security-reviewer.md", AGENT);
  await put(source, ".agents/mcp.json", JSON.stringify({
    mcpServers: {
      privateDocs: {
        url: "https://example.com/mcp",
        headers: { Authorization: "Bearer ${DOCS_TOKEN}" },
      },
    },
  }));
  await applySync(await planSync(source));

  const exportPlan = await planPluginExport(source, { output });
  assert.equal(exportPlan.conflicts.length, 0);
  await applyPluginPlan(exportPlan);

  const plugin = JSON.parse(await readFile(path.join(output, "plugin.json"), "utf8"));
  const mcp = JSON.parse(await readFile(path.join(output, "mcp.json"), "utf8"));
  assert.equal(plugin.$schema, PLUGIN_SCHEMA);
  assert.equal(mcp.$schema, MCP_SCHEMA);
  assert.equal(mcp.mcpServers.privateDocs.type, "streamable-http");
  assert.equal(mcp.mcpServers.privateDocs.headers, undefined);
  const secret = plugin.extensions["ai.agentplaybooks"].secrets.find((item) => item.name === "DOCS_TOKEN");
  assert.equal(secret.ref, "env:DOCS_TOKEN");
  assert.deepEqual(secret.bindings[0].path, ["headers", "Authorization"]);
  assert.doesNotMatch(JSON.stringify(plugin), /actual-secret/);
  assert.equal(await readFile(path.join(output, "skills", "release", "references", "checklist.md"), "utf8"), "# Checklist\n");
  assert.match(await readFile(path.join(output, "com.github.copilot", "agents", "security-reviewer.agent.md"), "utf8"), /security-reviewer/);

  const importPlan = await planPluginImport(output, target);
  assert.equal(importPlan.conflicts.length, 0);
  await applyPluginPlan(importPlan);
  assert.equal(await readFile(path.join(target, ".agents", "skills", "release", "references", "checklist.md"), "utf8"), "# Checklist\n");
  assert.match(await readFile(path.join(target, ".agents", "agents", "security-reviewer.md"), "utf8"), /Inspect the change/);
  const importedMcp = JSON.parse(await readFile(path.join(target, ".agents", "mcp.json"), "utf8"));
  assert.equal(importedMcp.mcpServers.privateDocs.headers.Authorization, "Bearer ${DOCS_TOKEN}");
  const importedManifest = JSON.parse(await readFile(path.join(target, "agentplaybook.json"), "utf8"));
  assert.ok(importedManifest.spec.agents.some((item) => item.name === "security-reviewer"));
  assert.deepEqual(importedManifest.spec.secrets, [{ name: "DOCS_TOKEN", ref: "env:DOCS_TOKEN", required: true }]);

  await applySync(await planSync(target, { targets: ["gemini"] }));
  assert.equal(await readFile(path.join(target, ".gemini", "skills", "release", "references", "checklist.md"), "utf8"), "# Checklist\n");
});

test("Agent Plugins import rejects non-1.0 manifests", async () => {
  const plugin = await fixture();
  const target = await fixture();
  await put(plugin, "plugin.json", JSON.stringify({ $schema: "https://example.com/schema.json", name: "bad" }));
  await assert.rejects(() => planPluginImport(plugin, target), /Agent Plugins 1\.0/);
});

test("Agent Plugins import tolerates unknown manifest fields and a non-object extensions field", async () => {
  const plugin = await fixture();
  const target = await fixture();
  await put(plugin, "plugin.json", JSON.stringify({ $schema: PLUGIN_SCHEMA, name: "portable", unknownFutureField: true, extensions: "invalid" }));
  await put(plugin, "skills/release/SKILL.md", SKILL);
  const plan = await planPluginImport(plugin, target);
  assert.equal(plan.actions.some((action) => action.path === ".agents/skills/release/SKILL.md"), true);
  assert.deepEqual(plan.conflicts.filter((item) => item.kind === "manifest").map((item) => item.name), ["unknownFutureField", "extensions"]);
  await applyPluginPlan(plan);
  assert.equal(await readFile(path.join(target, ".agents/skills/release/SKILL.md"), "utf8"), SKILL);
});

test("Agent Plugins import skips a malformed MCP entry without losing good servers or skills", async () => {
  const plugin = await fixture();
  const target = await fixture();
  await put(plugin, "plugin.json", JSON.stringify({ $schema: PLUGIN_SCHEMA, name: "portable" }));
  await put(plugin, "skills/release/SKILL.md", SKILL);
  await put(plugin, "mcp.json", JSON.stringify({
    $schema: MCP_SCHEMA,
    mcpServers: {
      docs: { type: "streamable-http", url: "https://example.com/mcp" },
      broken: { type: "streamable-http", url: "not-a-url" },
    },
  }));
  const plan = await planPluginImport(plugin, target);
  assert.equal(plan.conflicts.some((item) => item.kind === "mcp" && item.name === "broken"), true);
  await applyPluginPlan(plan);
  const imported = JSON.parse(await readFile(path.join(target, ".agents/mcp.json"), "utf8"));
  assert.deepEqual(Object.keys(imported.mcpServers), ["docs"]);
  assert.equal(await readFile(path.join(target, ".agents/skills/release/SKILL.md"), "utf8"), SKILL);
});

test("Agent Plugins import skips one invalid skill without losing its siblings", async () => {
  const plugin = await fixture();
  const target = await fixture();
  await put(plugin, "plugin.json", JSON.stringify({ $schema: PLUGIN_SCHEMA, name: "portable" }));
  await put(plugin, "skills/release/SKILL.md", SKILL);
  await put(plugin, "skills/broken/SKILL.md", "# Missing frontmatter\n");
  const plan = await planPluginImport(plugin, target);
  assert.equal(plan.conflicts.some((item) => item.kind === "skill" && item.name === "broken"), true);
  assert.equal(plan.actions.some((item) => item.path === ".agents/skills/release/SKILL.md"), true);
  assert.equal(plan.actions.some((item) => item.path === ".agents/skills/broken/SKILL.md"), false);
});

test("Agent Plugins export refuses credential-bearing skill resources", async () => {
  const source = await fixture();
  const output = path.join(await fixture(), "plugin");
  await put(source, ".agents/skills/release/SKILL.md", SKILL);
  await put(source, ".agents/skills/release/references/private.md", 'api_key = "sk-ABCDEFGHIJKLMNOPQRSTUVWX1234"\n');
  const plan = await planPluginExport(source, { output });
  assert.match(plan.conflicts.find((item) => item.kind === "skill")?.reason ?? "", /credential/);
  await assert.rejects(() => applyPluginPlan(plan), /incomplete Agent Plugins export/);
});
