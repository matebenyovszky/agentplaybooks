import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { planHermesMemory, applyHermesMemory } from "../src/hermes-memory.js";

const guid = "0123456789abcdef";
async function fixture() {
  const home = await mkdtemp(path.join(tmpdir(), "apb-hermes-memory-"));
  return { hermesHome: home, playbook: guid, env: { AGENTPLAYBOOKS_MEMORY_API_KEY: "secret-do-not-copy" } };
}

test("installs a profile-scoped provider, preserves unrelated YAML, and becomes idempotent", async () => {
  const options = await fixture();
  await writeFile(path.join(options.hermesHome, "config.yaml"), "# keep my comment\nmodel: example\nmemory:\n  memory_enabled: true\n");
  const plan = await planHermesMemory(options);
  assert.equal(plan.conflicts.length, 0);
  assert.ok(!JSON.stringify(plan).includes("secret-do-not-copy"));
  await applyHermesMemory(plan);
  const yaml = await readFile(path.join(options.hermesHome, "config.yaml"), "utf8");
  assert.match(yaml, /# keep my comment/);
  assert.match(yaml, /model: example/);
  assert.match(yaml, /memory_enabled: true/);
  assert.match(yaml, /provider: agentplaybooks/);
  assert.match(await readFile(path.join(options.hermesHome, "plugins/agentplaybooks/__init__.py"), "utf8"), /register_memory_provider/);
  assert.equal((await planHermesMemory(options)).changed, false);
});

test("a conflicting provider prevents every write", async () => {
  const options = await fixture();
  const file = path.join(options.hermesHome, "config.yaml");
  await writeFile(file, "memory:\n  provider: honcho\n");
  const plan = await planHermesMemory(options);
  assert.equal(plan.conflicts.length, 1);
  await assert.rejects(applyHermesMemory(plan), /no files were written/);
  assert.equal(await readFile(file, "utf8"), "memory:\n  provider: honcho\n");
  await assert.rejects(readFile(path.join(options.hermesHome, "agentplaybooks/config.json")), { code: "ENOENT" });
});

test("does not overwrite a different playbook, disabled plugin, or changed source", async () => {
  const options = await fixture();
  await applyHermesMemory(await planHermesMemory(options));
  assert.ok((await planHermesMemory({ ...options, playbook: "abcdef0123456789" })).conflicts.length);
  await writeFile(path.join(options.hermesHome, "plugins/agentplaybooks/client.py"), "# user edit\n");
  assert.ok((await planHermesMemory(options)).conflicts.some(x => x.name.endsWith("client.py")));
  await writeFile(path.join(options.hermesHome, "config.yaml"), "plugins:\n  disabled: [agentplaybooks]\n");
  assert.ok((await planHermesMemory(options)).conflicts.some(x => x.name === "plugins.disabled"));
});

test("refuses a stale preview and malformed identifiers/endpoints", async () => {
  const options = await fixture();
  const plan = await planHermesMemory(options);
  await writeFile(path.join(options.hermesHome, "config.yaml"), "model: changed\n");
  await assert.rejects(applyHermesMemory(plan), /changed after planning/);
  for (const playbook of ["../../other", "", "not-a-guid"]) {
    await assert.rejects(planHermesMemory({ ...options, playbook }), /GUID/);
  }
  for (const url of ["http://example.com", "https://key@example.com", "https://example.com/?token=secret"]) {
    await assert.rejects(planHermesMemory({ ...options, url }), /HTTPS/);
  }
});

test("HERMES_HOME and shared sources stay in their chosen profile", async () => {
  const options = await fixture();
  const other = path.join(options.hermesHome, "second");
  await mkdir(other);
  const plan = await planHermesMemory({ playbook: guid, env: { HERMES_HOME: other }, sharedPlaybooks: "abcdef0123456789" });
  assert.equal(plan.profile, other);
  await applyHermesMemory(plan);
  const settings = JSON.parse(await readFile(path.join(other, "agentplaybooks/config.json"), "utf8"));
  assert.equal(settings.shared_playbooks, "abcdef0123456789");
});
