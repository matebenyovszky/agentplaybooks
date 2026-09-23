import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(packageRoot, relativePath), "utf8"));
}

test("Codex plugin uses OAuth discovery for the account MCP", async () => {
  const [manifest, packageJson] = await Promise.all([
    readJson(".codex-plugin/plugin.json"),
    readJson("package.json"),
  ]);
  const account = manifest.mcpServers["agentplaybooks-account"];

  assert.equal(manifest.version, packageJson.version);
  assert.equal(account.url, "https://agentplaybooks.ai/api/mcp/manage");
  assert.equal(account.bearer_token_env_var, undefined);
  assert.equal(account.headers, undefined);
});

test("Claude plugin uses OAuth discovery and bundles the account MCP", async () => {
  const [manifest, packageJson] = await Promise.all([
    readJson(".claude-plugin/plugin.json"),
    readJson("package.json"),
  ]);
  const account = manifest.mcpServers["agentplaybooks-account"];

  assert.equal(manifest.version, packageJson.version);
  assert.equal(manifest.userConfig, undefined);
  assert.equal(account.url, "https://agentplaybooks.ai/api/mcp/manage");
  assert.equal(account.headers, undefined);
});
