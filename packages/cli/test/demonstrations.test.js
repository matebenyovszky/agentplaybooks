import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { skillDemonstrations } from "../src/checks.js";
import { runDoctor } from "../src/doctor.js";
import { createManifest } from "../src/manifest.js";

async function fixture() {
  return mkdtemp(path.join(tmpdir(), "agentplaybooks-demos-"));
}

async function put(root, relativePath, content) {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}

function skill(demonstrationsBlock) {
  return [
    "---",
    "name: open-fire-door",
    "description: Opening a fire door by its handle.",
    ...demonstrationsBlock,
    "---",
    "# Open the door",
    "",
  ].join("\n");
}

test("a skill with no demonstrations block reports none", () => {
  assert.deepEqual(skillDemonstrations({ name: "x" }), { demonstrations: [], invalid: false });
  assert.deepEqual(skillDemonstrations({}), { demonstrations: [], invalid: false });
  assert.deepEqual(skillDemonstrations(undefined), { demonstrations: [], invalid: false });
});

test("defaults match the hosted playbook's defaults", () => {
  const { demonstrations, invalid } = skillDemonstrations({
    demonstrations: [
      { provider: "youtube", ref: "dQw4w9WgXcQ" },
      { provider: "hf_dataset", ref: "example-lab/fire-door-push@a1b2c3d" },
    ],
  });

  assert.equal(invalid, false);
  assert.deepEqual(demonstrations, [
    { provider: "youtube", ref: "dQw4w9WgXcQ", fidelity: "video", role: "demonstration" },
    { provider: "hf_dataset", ref: "example-lab/fire-door-push@a1b2c3d", fidelity: "sensorimotor", role: "demonstration" },
  ]);
});

test("an explicit fidelity and role win over the defaults", () => {
  const { demonstrations } = skillDemonstrations({
    demonstrations: [{ provider: "url", ref: "https://example.com/demo.mp4", fidelity: "sensorimotor", role: "warning" }],
  });
  assert.equal(demonstrations[0].fidelity, "sensorimotor");
  assert.equal(demonstrations[0].role, "warning");
});

test("entries without a known provider or a ref are reported, the rest survive", () => {
  const { demonstrations, invalid } = skillDemonstrations({
    demonstrations: [
      { provider: "youtube", ref: "dQw4w9WgXcQ" },
      { provider: "vimeo", ref: "12345" },
      { provider: "youtube" },
      { provider: "youtube", ref: "   " },
      "not an object",
    ],
  });

  assert.equal(invalid, true);
  assert.equal(demonstrations.length, 1);
});

test("a sha256 on a url reference reaches the manifest; anywhere else it is reported", () => {
  const hex = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
  const ok = skillDemonstrations({
    demonstrations: [{ provider: "url", ref: "https://example.com/demo.mp4", sha256: hex.toUpperCase() }],
  });
  assert.equal(ok.invalid, false);
  assert.equal(ok.demonstrations[0].sha256, hex);

  const bad = skillDemonstrations({
    demonstrations: [
      { provider: "url", ref: "https://example.com/demo.mp4", sha256: "abc123" },
      { provider: "youtube", ref: "dQw4w9WgXcQ", sha256: hex },
    ],
  });
  assert.equal(bad.invalid, true);
  assert.equal(bad.demonstrations.length, 0);
});

test("a lone entry counts as a one-item list", () => {
  const { demonstrations } = skillDemonstrations({
    demonstrations: { provider: "youtube", ref: "dQw4w9WgXcQ" },
  });
  assert.equal(demonstrations.length, 1);
});

test("doctor stays quiet for a well-formed demonstrations block", async () => {
  const root = await fixture();
  await put(root, ".claude/skills/open-fire-door/SKILL.md", skill([
    "demonstrations:",
    "  - provider: youtube",
    "    ref: dQw4w9WgXcQ",
    "    segments:",
    "      - { start: 134, end: 158, label: grip the handle }",
  ]));

  const report = await runDoctor(root);
  assert.equal(report.findings.filter((f) => f.code === "skill.demonstrations.invalid").length, 0);
  assert.equal(report.inventory.skills[0].demonstrations.length, 1);
});

test("doctor points at the skill whose demonstration is malformed", async () => {
  const root = await fixture();
  await put(root, ".claude/skills/open-fire-door/SKILL.md", skill([
    "demonstrations:",
    "  - provider: vimeo",
    "    ref: '12345'",
  ]));

  const report = await runDoctor(root);
  const found = report.findings.find((f) => f.code === "skill.demonstrations.invalid");
  assert.ok(found, "expected a skill.demonstrations.invalid finding");
  assert.equal(found.severity, "high");
  assert.match(found.source, /open-fire-door/);
});

test("the manifest declares what recordings a playbook reaches for", async () => {
  const root = await fixture();
  await put(root, ".claude/skills/open-fire-door/SKILL.md", skill([
    "demonstrations:",
    "  - provider: youtube",
    "    ref: dQw4w9WgXcQ",
    "  - provider: hf_dataset",
    "    ref: example-lab/fire-door-push@a1b2c3d",
  ]));
  await put(root, ".claude/skills/write-report/SKILL.md", [
    "---",
    "name: write-report",
    "description: Write the incident report.",
    "---",
    "# Report",
    "",
  ].join("\n"));

  const manifest = createManifest(await runDoctor(root));
  const door = manifest.spec.skills.find((entry) => entry.name === "open-fire-door");
  const report = manifest.spec.skills.find((entry) => entry.name === "write-report");

  assert.deepEqual(door.demonstrations, [
    { provider: "youtube", ref: "dQw4w9WgXcQ", fidelity: "video", role: "demonstration" },
    { provider: "hf_dataset", ref: "example-lab/fire-door-push@a1b2c3d", fidelity: "sensorimotor", role: "demonstration" },
  ]);
  // A text-only skill carries no empty array; absent means it needs nothing.
  assert.equal("demonstrations" in report, false);
});
