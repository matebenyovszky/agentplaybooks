/**
 * One playbook, one bot. These tests pin the shape of the directory
 * `hermes profile install` reads, because getting it subtly wrong produces a
 * profile that installs cleanly and then does nothing.
 */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { applyHermesExport, planHermesExport } from "../src/hermes-distribution.js";

async function fixture(prefix) {
  return mkdtemp(path.join(tmpdir(), prefix));
}

async function put(root, relativePath, content) {
  const target = path.join(root, ...relativePath.split("/"));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}

/** A project in the state `pull --apply` leaves it in. */
async function pulledProject(name = "Vambery bot") {
  const root = await fixture("apb-hermes-");
  await put(root, ".agentplaybooks/remote.json", `${JSON.stringify({
    url: "https://agentplaybooks.ai",
    playbookId: "p1",
    guid: "abc123",
    name,
  })}\n`);
  await put(root, ".agents/persona.md", "You are Vambery, an internal data analyst.\n");
  await put(root, ".agents/skills/office-live/SKILL.md",
    "---\nname: office-live\ndescription: Drive the open Office document.\n---\n\nImport scripts/office.py.\n");
  await put(root, ".agents/skills/office-live/scripts/office.py", "def attach():\n    return 1\n");
  await put(root, ".agents/skills/office-live/references/api.md", "# API\n");
  return root;
}

test("exports the layout hermes profile install expects", async () => {
  const root = await pulledProject();
  const destination = await fixture("apb-dist-");

  const plan = await planHermesExport(root, destination);
  assert.equal(plan.profileName, "vambery-bot");
  assert.deepEqual(plan.files.map((file) => file.path).sort(), [
    "SOUL.md",
    "distribution.yaml",
    "skills/office-live/SKILL.md",
    "skills/office-live/references/api.md",
    "skills/office-live/scripts/office.py",
  ]);

  await applyHermesExport(plan);
  const script = await readFile(path.join(destination, "skills/office-live/scripts/office.py"), "utf8");
  assert.equal(script, "def attach():\n    return 1\n");
  assert.equal(
    await readFile(path.join(destination, "SOUL.md"), "utf8"),
    "You are Vambery, an internal data analyst.\n",
  );
});

test("the manifest declares only what it ships, and never config.yaml", async () => {
  const root = await pulledProject();
  const destination = await fixture("apb-dist-");
  const plan = await planHermesExport(root, destination, { name: "vambery", version: "1.2.0" });
  await applyHermesExport(plan);

  const manifest = await readFile(path.join(destination, "distribution.yaml"), "utf8");
  assert.match(manifest, /^name: vambery$/m);
  assert.match(manifest, /^version: 1\.2\.0$/m);
  assert.match(manifest, /^hermes_requires: ">=0\.20\.0"$/m);
  assert.match(manifest, /^distribution_owned:$/m);
  assert.match(manifest, /^ {2}- SOUL\.md$/m);
  assert.match(manifest, /^ {2}- skills\/$/m);

  // Shipping config.yaml would replace the bot's providers and pin its model.
  assert.doesNotMatch(manifest, /^ {2}- config\.yaml$/m);
});

test("a playbook with no persona does not claim to own SOUL.md", async () => {
  const root = await fixture("apb-hermes-nopersona-");
  await put(root, ".agents/skills/triage/SKILL.md",
    "---\nname: triage\ndescription: Triage incoming bugs.\n---\n\nSteps.\n");

  const plan = await planHermesExport(root, await fixture("apb-dist-"), { name: "triage-bot" });
  assert.ok(!plan.files.some((file) => file.path === "SOUL.md"));

  const manifest = plan.files.find((file) => file.path === "distribution.yaml").content;
  // Declaring a file the distribution does not ship makes `profile update`
  // delete the one the user wrote.
  assert.doesNotMatch(manifest, /- SOUL\.md/);
});

test("derives a profile name from the playbook, and takes one that is given", async () => {
  const destination = await fixture("apb-dist-");
  const fancy = await pulledProject("Vámbéry: Data Analyst!");
  assert.equal((await planHermesExport(fancy, destination)).profileName, "v-mb-ry-data-analyst");

  const plain = await pulledProject();
  assert.equal((await planHermesExport(plain, destination, { name: "Vambery" })).profileName, "vambery");
});

test("refuses a project that has nothing to export", async () => {
  const root = await fixture("apb-hermes-empty-");
  const destination = await fixture("apb-dist-");
  await assert.rejects(
    () => planHermesExport(root, destination),
    /Run 'agentplaybooks pull/,
  );
});

test("re-exporting over an existing distribution replaces the changed file", async () => {
  const root = await pulledProject();
  const destination = await fixture("apb-dist-");
  await applyHermesExport(await planHermesExport(root, destination));

  await put(root, ".agents/skills/office-live/scripts/office.py", "def attach():\n    return 2\n");
  await applyHermesExport(await planHermesExport(root, destination));

  assert.equal(
    await readFile(path.join(destination, "skills/office-live/scripts/office.py"), "utf8"),
    "def attach():\n    return 2\n",
  );
});
