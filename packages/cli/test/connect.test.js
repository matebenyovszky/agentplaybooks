import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { applyConnect, defaultKeyEnvVar, planConnect, serverDefinition } from "../src/connect.js";

// `connect` points a local tool at a hosted playbook's own MCP endpoint. The
// rule it must never break: the key stays in the environment, and only a
// reference to it reaches the disk.

async function fixture() {
  return mkdtemp(path.join(tmpdir(), "agentplaybooks-connect-"));
}

const GUID = "011d8a7fa0ec4016";

test("writes a reference to the key, never the key", async () => {
  const root = await fixture();
  const plan = await planConnect(root, {
    playbook: GUID,
    env: { APBKS_KEY_AGENTPLAYBOOKS: "apb_super_secret_value" },
  });

  await applyConnect(plan);
  const written = await readFile(path.join(root, ".mcp.json"), "utf8");

  assert.ok(!written.includes("apb_super_secret_value"), "the key value must not reach the disk");
  assert.match(written, /\$\{APBKS_KEY_AGENTPLAYBOOKS\}/);
  assert.match(written, /"X-API-Key"/);
  assert.match(written, new RegExp(`https://agentplaybooks\\.ai/api/mcp/${GUID}`));
});

test("defaults the credential to a header a client will not reserve for itself", () => {
  // Authorization can be claimed by the client's own authentication handling,
  // and then the credential vanishes with no error: connection fine, no tools.
  const definition = serverDefinition({ url: "https://example.test/api/mcp/x", keyEnvVar: "APBKS_KEY_X" });
  assert.deepEqual(Object.keys(definition.headers), ["X-API-Key"]);
  assert.equal(definition.headers["X-API-Key"], "${APBKS_KEY_X}");
});

test("honours an explicit header and entry name", async () => {
  const root = await fixture();
  const plan = await planConnect(root, {
    playbook: GUID,
    name: "apbks-dev",
    keyHeader: "Authorization",
    env: {},
  });

  assert.equal(plan.entryName, "apbks-dev");
  assert.equal(plan.keyEnvVar, "APBKS_KEY_APBKS_DEV");
  await applyConnect(plan);

  const document = JSON.parse(await readFile(path.join(root, ".mcp.json"), "utf8"));
  assert.equal(document.mcpServers["apbks-dev"].headers.Authorization, "${APBKS_KEY_APBKS_DEV}");
});

test("names the environment variable after the entry", () => {
  assert.equal(defaultKeyEnvVar("apbks-dev"), "APBKS_KEY_APBKS_DEV");
  assert.equal(defaultKeyEnvVar("my playbook"), "APBKS_KEY_MY_PLAYBOOK");
});

test("reports a key the planning process cannot see", async () => {
  const root = await fixture();

  const missing = await planConnect(root, { playbook: GUID, env: {} });
  assert.equal(missing.keyPresentInEnvironment, false);

  const present = await planConnect(root, {
    playbook: GUID,
    env: { APBKS_KEY_AGENTPLAYBOOKS: "apb_x" },
  });
  assert.equal(present.keyPresentInEnvironment, true);
});

test("merges into an existing config instead of replacing it", async () => {
  const root = await fixture();
  await writeFile(
    path.join(root, ".mcp.json"),
    `${JSON.stringify({ mcpServers: { existing: { command: "node", args: ["server.js"] } } }, null, 2)}\n`,
    "utf8",
  );

  const plan = await planConnect(root, { playbook: GUID, env: {} });
  assert.equal(plan.fileActions[0].action, "merge");

  const result = await applyConnect(plan);
  const document = JSON.parse(await readFile(path.join(root, ".mcp.json"), "utf8"));

  assert.deepEqual(document.mcpServers.existing, { command: "node", args: ["server.js"] });
  assert.ok(document.mcpServers.agentplaybooks);
  // A rewrite of a file the user already had is backed up, like sync does.
  assert.equal(result.backups.length, 1);
});

test("refuses a target whose format cannot carry the credential", async () => {
  const root = await fixture();
  // Codex config is TOML, and the writer represents command/url/args/env only —
  // a headers map would be silently dropped, which is worse than a refusal.
  const plan = await planConnect(root, { playbook: GUID, targets: ["codex"], env: {} });

  assert.equal(plan.changed, false);
  assert.equal(plan.conflicts.length, 1);
  assert.match(plan.conflicts[0].reason, /cannot be represented/i);
});

test("rejects an argument that is not a playbook GUID", async () => {
  const root = await fixture();
  await assert.rejects(
    () => planConnect(root, { playbook: "https://agentplaybooks.ai/playbooks/mine", env: {} }),
    /not a playbook GUID/,
  );
  await assert.rejects(() => planConnect(root, { env: {} }), /Which playbook/);
});

test("does not write anything while only planning", async () => {
  const root = await fixture();
  await planConnect(root, { playbook: GUID, env: {} });

  await assert.rejects(() => readFile(path.join(root, ".mcp.json"), "utf8"), /ENOENT/);
});
