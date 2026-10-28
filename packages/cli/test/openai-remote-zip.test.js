import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { packOpenAiRemoteZip } from "../scripts/pack-openai-remote-zip.mjs";
import { listZipStore } from "../scripts/pack-openai-skills-zip.mjs";

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
