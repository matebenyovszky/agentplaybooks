import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { printDoctor, publicReport, runDoctor } from "../src/doctor.js";
import { buildPortableSnapshot } from "../src/snapshot.js";

function capturePrint(report) {
  const lines = [];
  const original = console.log;
  console.log = (...args) => lines.push(args.map(String).join(" "));
  try {
    printDoctor(report);
  } finally {
    console.log = original;
  }
  return lines.join("\n");
}

async function fixture() {
  return mkdtemp(path.join(tmpdir(), "agentplaybooks-doctor-"));
}

async function put(root, relativePath, content) {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}

test("doctor discovers instructions, skills, and MCP servers", async () => {
  const root = await fixture();
  await put(root, "AGENTS.md", "# Project guidance\nRun tests.\n");
  await put(root, ".codex/skills/code-review/SKILL.md", "---\nname: code-review\ndescription: Review code safely.\n---\n# Review\n");
  await put(root, ".codex/config.toml", "[mcp_servers.docs]\nurl = \"https://example.com/mcp\"\n");

  const report = await runDoctor(root);

  assert.equal(report.inventory.instructions.length, 1);
  assert.equal(report.inventory.skills.length, 1);
  assert.equal(report.inventory.mcpServers.length, 1);
  assert.equal(report.findings.length, 0);
  assert.equal(report.score, 100);
});
test("doctor reports spec errors, secret exposure, insecure MCP, and drift", async () => {
  const root = await fixture();
  await put(root, ".claude/skills/shared/SKILL.md", "# Missing frontmatter\n");
  await put(root, ".codex/skills/shared/SKILL.md", "---\nname: shared\ndescription: Shared workflow.\n---\nAPI_KEY=sk-abcdefghijklmnopqrstuvwxyz123456\n");
  await put(root, ".cursor/mcp.json", JSON.stringify({
    mcpServers: { tools: { url: "http://mcp.example.com/mcp" } },
  }));
  await put(root, ".mcp.json", JSON.stringify({
    mcpServers: { tools: { command: "npx", args: ["-y", "example-mcp"] } },
  }));

  const report = await runDoctor(root);
  const codes = new Set(report.findings.map((item) => item.code));

  assert.ok(codes.has("skill.frontmatter.invalid"));
  assert.ok(codes.has("skill.name.missing"));
  assert.ok(codes.has("secret.hardcoded"));
  assert.ok(codes.has("mcp.url.insecure"));
  assert.ok(codes.has("skill.drift"));
  assert.ok(codes.has("mcp.drift"));
  assert.ok(report.score < 100);

  const secretFinding = report.findings.find((item) => item.code === "secret.hardcoded");
  assert.deepEqual(secretFinding.lines, [5]);
  assert.doesNotMatch(JSON.stringify(secretFinding), /sk-abcdefghijklmnopqrstuvwxyz/);
});

test("doctor names Cursor and missing Claude on a healthy Cursor-only project", async () => {
  const root = await fixture();
  await put(root, "AGENTS.md", "# Project guidance\nRun tests.\n");
  await put(root, ".cursor/skills/code-review/SKILL.md", "---\nname: code-review\ndescription: Review code safely.\n---\n# Review\n");
  await put(root, ".cursor/mcp.json", JSON.stringify({
    mcpServers: { docs: { url: "https://example.com/mcp" } },
  }));

  const report = await runDoctor(root);
  const published = publicReport(report);
  const output = capturePrint(report);

  assert.equal(report.score, 100);
  assert.equal(report.findings.length, 0);
  assert.deepEqual(published.platforms, { present: ["cursor"], missing: ["claude"] });
  assert.match(output, /Cursor present/);
  assert.match(output, /Claude not present/);
  assert.doesNotMatch(output, /Cursor not present/);
  assert.doesNotMatch(output, /\bCodex\b/);
  assert.doesNotMatch(JSON.stringify(report.findings), /claude/);
});

test("doctor names Claude and missing Cursor on a healthy Claude-only project", async () => {
  const root = await fixture();
  await put(root, "AGENTS.md", "# Project guidance\nRun tests.\n");
  await put(root, ".claude/skills/code-review/SKILL.md", "---\nname: code-review\ndescription: Review code safely.\n---\n# Review\n");
  await put(root, ".mcp.json", JSON.stringify({
    mcpServers: { docs: { url: "https://example.com/mcp" } },
  }));

  const report = await runDoctor(root);
  const published = publicReport(report);
  const output = capturePrint(report);

  assert.equal(report.score, 100);
  assert.equal(report.findings.length, 0);
  assert.deepEqual(published.platforms, { present: ["claude"], missing: ["cursor"] });
  assert.match(output, /Claude present/);
  assert.match(output, /Cursor not present/);
  assert.doesNotMatch(output, /\bCodex\b/);
  assert.doesNotMatch(output, /Cursor present/);
  assert.doesNotMatch(JSON.stringify(report.findings), /cursor/);
});

test("doctor ignores generated and dependency directories", async () => {
  const root = await fixture();
  await put(root, "node_modules/bad/SKILL.md", "broken");
  await put(root, ".next/bad/SKILL.md", "broken");

  const report = await runDoctor(root);
  assert.equal(report.inventory.skills.length, 0);
});

test("doctor accepts the optional Agent Skills frontmatter fields", async () => {
  const root = await fixture();
  await put(root, ".agents/skills/code-review/SKILL.md", `---
name: code-review
description: >-
  Review code safely when a pull request needs validation.
license: Apache-2.0
compatibility: Requires git.
metadata:
  author: AgentPlaybooks
  version: "1.0"
allowed-tools: Bash(git:*) Read
---
# Review
`);

  const report = await runDoctor(root);
  assert.equal(report.findings.length, 0);
});

test("doctor enforces Agent Skills directory and optional field constraints", async () => {
  const root = await fixture();
  await put(root, ".agents/skills/wrong-directory/SKILL.md", `---
name: actual-name
description: Valid description.
compatibility: ${"x".repeat(501)}
metadata:
  version: 1
allowed-tools:
  - Bash
---
Body.
`);

  const report = await runDoctor(root);
  const findings = new Map(report.findings.map((item) => [item.code, item]));
  assert.equal(findings.get("skill.directory.mismatch")?.severity, "high");
  assert.ok(findings.has("skill.compatibility.invalid"));
  assert.ok(findings.has("skill.metadata.invalid"));
  assert.ok(findings.has("skill.allowed-tools.invalid"));
});

// A skill is its directory. Before this, a key in scripts/deploy.py scored a
// clean 100 while the backup refused the very same file, so the check meant to
// run before a push — or in CI with --strict — missed what the push caught.
test("doctor scans the files a skill bundles for credentials", async () => {
  const root = await fixture();
  await put(root, ".agents/skills/deploy/SKILL.md", "---\nname: deploy\ndescription: Deploy the app.\n---\nRun scripts/deploy.py.\n");
  await put(root, ".agents/skills/deploy/scripts/deploy.py", 'import requests\nAPI_KEY = "sk-abcdefghijklmnopqrstuvwxyz123456"\n');
  // A reference to the environment is the behaviour to encourage, not report.
  await put(root, ".agents/skills/deploy/references/USAGE.md", "Set API_KEY=${DEPLOY_API_KEY} before running.\n");
  // Binary assets are not text and are not scanned.
  await put(root, ".agents/skills/deploy/assets/blob.bin", "\u0000password=hunter2-not-really-text\n");

  const report = await runDoctor(root);
  const secrets = report.findings.filter((item) => item.code === "secret.hardcoded");

  assert.equal(secrets.length, 1);
  assert.equal(secrets[0].source, ".agents/skills/deploy/scripts/deploy.py");
  assert.equal(secrets[0].severity, "critical");
  assert.deepEqual(secrets[0].lines, [2]);
  assert.doesNotMatch(JSON.stringify(report.findings), /sk-abcdefghijklmnopqrstuvwxyz/);
  assert.ok(report.score < 100);

  // The backup refuses the same file, and now names it rather than SKILL.md.
  const { snapshot, conflicts } = await buildPortableSnapshot(report, root, {}, null);
  assert.equal(snapshot, null);
  assert.match(conflicts.map((item) => item.reason).join("\n"), /in \.agents\/skills\/deploy\/scripts\/deploy\.py;/);
});

test("doctor reports a credential in a nested skill once", async () => {
  const root = await fixture();
  await put(root, ".agents/skills/outer/SKILL.md", "---\nname: outer\ndescription: Outer skill.\n---\nBody.\n");
  await put(root, ".agents/skills/outer/inner/SKILL.md", "---\nname: inner\ndescription: Inner skill.\n---\nAPI_KEY=sk-abcdefghijklmnopqrstuvwxyz123456\n");

  const report = await runDoctor(root);
  const secrets = report.findings.filter((item) => item.code === "secret.hardcoded");

  assert.deepEqual(secrets.map((item) => item.source), [".agents/skills/outer/inner/SKILL.md"]);
});
