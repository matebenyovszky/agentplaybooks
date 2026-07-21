import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { runDoctor } from "../src/doctor.js";

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

test("doctor ignores generated and dependency directories", async () => {
  const root = await fixture();
  await put(root, "node_modules/bad/SKILL.md", "broken");
  await put(root, ".next/bad/SKILL.md", "broken");

  const report = await runDoctor(root);
  assert.equal(report.inventory.skills.length, 0);
});
