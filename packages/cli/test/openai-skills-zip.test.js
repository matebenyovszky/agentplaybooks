import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { containsLiteralCredential } from "../src/plugin-package.js";
import {
  collectOpenAiSkillsFiles,
  defaultOutputPath,
  listZipStore,
  packOpenAiSkillsZip,
  packageRoot,
} from "../scripts/pack-openai-skills-zip.mjs";

const PLUGIN_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";
const EXPECTED_NAMES = [
  "LICENSE",
  "assets/icon.svg",
  "plugin.json",
  "skills/agentplaybooks/SKILL.md",
];

test("default Skills-only ZIP path is packages/cli/dist/agentplaybooks-openai-skills.zip", () => {
  assert.equal(
    defaultOutputPath,
    path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), "dist", "agentplaybooks-openai-skills.zip"),
  );
});

test("Skills-only packer collects MIT plugin files and omits MCP", async () => {
  const files = await collectOpenAiSkillsFiles(packageRoot);
  assert.deepEqual([...files.keys()].sort(), EXPECTED_NAMES);

  const plugin = JSON.parse(files.get("plugin.json").toString("utf8"));
  assert.equal(plugin.$schema, PLUGIN_SCHEMA);
  assert.equal(plugin.license, "MIT");
  assert.equal(plugin.name, "agentplaybooks");
  assert.equal(Object.hasOwn(plugin, "mcpServers"), false);
  assert.equal(Object.hasOwn(plugin.extensions["com.openai"], "apps"), false);
  assert.equal(Object.hasOwn(plugin.extensions["com.openai"].interface, "screenshots"), false);
  assert.equal(plugin.extensions["com.openai"].interface.logo, "./assets/icon.svg");
  assert.equal(plugin.extensions["com.openai"].interface.privacyPolicyURL, "https://agentplaybooks.ai/privacy");
  assert.equal(plugin.extensions["com.openai"].interface.termsOfServiceURL, "https://agentplaybooks.ai/terms");

  const skill = files.get("skills/agentplaybooks/SKILL.md").toString("utf8");
  assert.match(skill, /^---\r?\nname: agentplaybooks\r?\n/);
  assert.match(skill, /^description: Audit, migrate/m);

  const license = files.get("LICENSE").toString("utf8");
  assert.match(license, /MIT License/);
  assert.equal(license, await readFile(path.join(packageRoot, "LICENSE"), "utf8"));
  assert.equal(
    files.get("assets/icon.svg").toString("utf8"),
    await readFile(path.join(packageRoot, "assets", "icon.svg"), "utf8"),
  );

  for (const [name, data] of files) {
    assert.doesNotMatch(name, /mcp\.json|\.mcp\.json|\.app\.json|\.codex-plugin/);
    assert.equal(containsLiteralCredential(data.toString("utf8")), false, name);
  }
});

test("Skills-only ZIP round-trips the collected files with POSIX paths", async () => {
  const outputPath = path.join(await mkdtemp(path.join(tmpdir(), "apb-openai-skills-")), "agentplaybooks-openai-skills.zip");
  const packed = await packOpenAiSkillsZip({ outputPath });
  assert.equal(packed.outputPath, outputPath);
  assert.ok(packed.bytes > 0);
  assert.deepEqual(packed.names, EXPECTED_NAMES);

  const zip = await readFile(outputPath);
  const entries = listZipStore(zip);
  assert.deepEqual(entries.map((entry) => entry.name), EXPECTED_NAMES);
  for (const entry of entries) {
    assert.equal(entry.name.includes("\\"), false);
    assert.equal(entry.data.equals(packed.files.get(entry.name)), true);
  }

  const plugin = JSON.parse(entries.find((entry) => entry.name === "plugin.json").data.toString("utf8"));
  assert.equal(Object.hasOwn(plugin, "mcpServers"), false);
});

test("Skills-only packer refuses account MCP in plugin.json", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "apb-openai-mcp-"));
  const plugin = JSON.parse(await readFile(path.join(packageRoot, "plugin.json"), "utf8"));
  plugin.mcpServers = { "agentplaybooks-account": { type: "http", url: "https://agentplaybooks.ai/api/mcp/manage" } };
  await writeFile(path.join(root, "plugin.json"), `${JSON.stringify(plugin, null, 2)}\n`);
  await writeFile(path.join(root, "LICENSE"), await readFile(path.join(packageRoot, "LICENSE")));
  await mkdir(path.join(root, "skills", "agentplaybooks"), { recursive: true });
  await writeFile(
    path.join(root, "skills", "agentplaybooks", "SKILL.md"),
    await readFile(path.join(packageRoot, "skills", "agentplaybooks", "SKILL.md")),
  );
  await assert.rejects(() => collectOpenAiSkillsFiles(root), /omit mcpServers/);
});
