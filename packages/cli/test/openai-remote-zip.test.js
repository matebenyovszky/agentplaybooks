import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { packOpenAiRemoteZip } from "../scripts/pack-openai-remote-zip.mjs";
import { listZipStore } from "../scripts/pack-openai-skills-zip.mjs";
import { packageRoot } from "../scripts/pack-openai-skills-zip.mjs";

test("full cloud ZIP includes OAuth remote MCP and skills, with no local process dependency", async () => {
  const outputPath = path.join(await mkdtemp(path.join(os.tmpdir(), "apb-remote-plugin-")), "remote.zip");
  await packOpenAiRemoteZip({ outputPath });
  const entries = listZipStore(await readFile(outputPath));
  const mcp = JSON.parse(entries.find(item => item.name === "mcp.json").data);
  const server = mcp.mcpServers["agentplaybooks-account"];
  assert.equal(server.extensions["com.openai"].auth.type, "oauth");
  assert.equal(server.command, undefined);
  assert.equal(server.headers, undefined);
  assert.ok(entries.some(item => item.name === "skills/agentplaybooks/SKILL.md"));
  assert.ok(entries.some(item => item.name === "skills/agentplaybooks/references/local-cli.md"));
  const before = await readFile(outputPath);
  await packOpenAiRemoteZip({ outputPath });
  assert.deepEqual(await readFile(outputPath), before);
});

test("full cloud ZIP rejects unexpected server headers even with environment-only credentials", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "apb-remote-config-"));
  for (const item of ["assets", "skills", "LICENSE", "plugin.json", "mcp.json"]) {
    await cp(path.join(packageRoot, item), path.join(root, item), { recursive: true });
  }
  const config = JSON.parse(await readFile(path.join(root, "mcp.json")));
  config.mcpServers["agentplaybooks-account"].headers = { Authorization: "Bearer ${TOKEN}" };
  await writeFile(path.join(root, "mcp.json"), JSON.stringify(config));
  await assert.rejects(packOpenAiRemoteZip({ root }), /canonical remote MCP endpoint and OAuth/);
});
