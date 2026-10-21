import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { planConnect, applyConnect } from "../src/connect.js";
import { planHermesMemory } from "../src/hermes-memory.js";
import { hermesProfile } from "../src/discovery.js";
const exec = promisify(execFile);
const guid = "0123456789abcdef";
const runner = ["--input-type=module", "-e", `import { run } from ${JSON.stringify(new URL("../src/cli.js", import.meta.url).href)}; await run(process.argv.slice(1));`];

test("connect and memory select the same named profile and preserve the default", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "apb-profile-"));
  await writeFile(path.join(home, "config.yaml"), "model: default\n");
  const options = { playbook: guid, targets: ["hermes"], hermesHome: home, profile: "work", env: {} };
  const connect = await planConnect(home, options);
  const memory = await planHermesMemory(options);
  const target = path.join(home, "profiles/work");
  assert.equal(connect.fileActions[0].absolutePath, path.join(target, "config.yaml"));
  assert.equal(memory.profile, target);
  await applyConnect(connect);
  assert.equal(await readFile(path.join(home, "config.yaml"), "utf8"), "model: default\n");
  assert.match(await readFile(path.join(target, "config.yaml"), "utf8"), /agentplaybooks:/);
});

test("profile traversal and applying stale connection previews fail closed", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "apb-profile-"));
  for (const profile of ["../other", "/tmp/other", "a/b", "a\\b"]) await assert.rejects(hermesProfile({ hermesHome: home, profile }), /Invalid Hermes profile/);
  const plan = await planConnect(home, { playbook: guid, targets: ["hermes"], hermesHome: home });
  await writeFile(path.join(home, "config.yaml"), "model: edited\n");
  await assert.rejects(applyConnect(plan), /changed after preview/);
  assert.equal(await readFile(path.join(home, "config.yaml"), "utf8"), "model: edited\n");
});

test("CLI accepts both profile spellings and rejects unknown options before writing", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "apb-profile-"));
  const env = { ...process.env, HERMES_HOME: home };
  for (const flag of [["--profile=work"], ["--profile", "work"]]) {
    const { stdout } = await exec(process.execPath, [...runner, "connect", guid, home, "--target=hermes", ...flag, "--json"], { env });
    assert.equal(JSON.parse(stdout).fileActions[0].absolutePath, path.join(home, "profiles/work/config.yaml"));
  }
  await assert.rejects(exec(process.execPath, [...runner, "connect", guid, "--target=hermes", "--profiel=work", "--apply"], { env }), /Unknown option/);
  await assert.rejects(exec(process.execPath, [...runner, "connect", guid, "--profile"], { env }), /Missing value/);
  await assert.rejects(readFile(path.join(home, "config.yaml")), { code: "ENOENT" });
});
