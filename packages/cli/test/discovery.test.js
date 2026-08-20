import assert from "node:assert/strict";
import { chmod, mkdir, readdir as realReaddir, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { runDoctor } from "../src/doctor.js";
import { discover, isPermissionError } from "../src/discovery.js";

async function fixture() {
  return mkdtemp(path.join(tmpdir(), "agentplaybooks-discovery-"));
}

async function put(root, relativePath, content) {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}

function scandirError(code, dir) {
  const error = new Error(`${code}: operation not permitted, scandir '${dir}'`);
  error.code = code;
  error.syscall = "scandir";
  error.path = dir;
  return error;
}

function readdirSkipping(blocked, code) {
  const blockedAbs = new Set(
    (Array.isArray(blocked) ? blocked : [blocked]).map((dir) => path.resolve(dir)),
  );
  return async (dir, options) => {
    if (blockedAbs.has(path.resolve(dir))) throw scandirError(code, dir);
    return realReaddir(dir, options);
  };
}

function protectedScanRootDirs(root) {
  return [
    path.join(root, "System Volume Information"),
    path.join(root, "$Recycle.Bin"),
  ];
}

async function readablePlaybook(root) {
  await put(root, "AGENTS.md", "# Project guidance\nRun tests.\n");
  await put(
    root,
    ".cursor/skills/code-review/SKILL.md",
    "---\nname: code-review\ndescription: Review code safely.\n---\n# Review\n",
  );
  await put(root, ".cursor/mcp.json", JSON.stringify({
    mcpServers: { docs: { url: "https://example.com/mcp" } },
  }));
}

async function plantUnreadableTrees(dirs) {
  for (const blocked of dirs) {
    await put(blocked, "hidden/SKILL.md", "---\nname: hidden\ndescription: Must not be discovered.\n---\n");
  }
}

function assertReadableInventory(inventory) {
  assert.equal(inventory.instructions.length, 1);
  assert.equal(inventory.instructions[0].source, "AGENTS.md");
  assert.equal(inventory.skills.length, 1);
  assert.equal(inventory.skills[0].source, ".cursor/skills/code-review/SKILL.md");
  assert.equal(inventory.mcpConfigs.length, 1);
  assert.equal(inventory.mcpConfigs[0].source, ".cursor/mcp.json");
  assert.equal(
    inventory.skills.some((item) => /System Volume Information|\$Recycle\.Bin|ElevatedDiagnostics/i.test(item.source)),
    false,
  );
}

test("isPermissionError matches EPERM/EACCES and ignores other fs errors", () => {
  assert.equal(isPermissionError({ code: "EPERM", syscall: "scandir" }), true);
  assert.equal(isPermissionError({ code: "EACCES", syscall: "scandir" }), true);
  assert.equal(isPermissionError({ code: "ENOENT", syscall: "scandir" }), false);
  assert.equal(isPermissionError({ code: "EIO", syscall: "scandir" }), false);
  assert.equal(isPermissionError(new Error("disk full")), false);
});

for (const code of ["EPERM", "EACCES"]) {
  test(`doctor and discover skip ${code} scandir on scan-root protected dirs and still find readable files`, async () => {
    const root = await fixture();
    await readablePlaybook(root);
    const blocked = [
      ...protectedScanRootDirs(root),
      path.join(root, "AppData", "Local", "ElevatedDiagnostics"),
    ];
    await plantUnreadableTrees(blocked);

    const listDir = readdirSkipping(blocked, code);
    const inventory = await discover(root, { readdir: listDir });
    const report = await runDoctor(root, { readdir: listDir });

    assertReadableInventory(inventory);
    assertReadableInventory(report.inventory);
    assert.equal(report.inventory.mcpServers.length, 1);
    assert.equal(report.findings.length, 0);
    assert.equal(report.score, 100);
  });
}

test("doctor still reports findings on readable files when a scan-root directory is unreadable", async () => {
  const root = await fixture();
  await put(root, ".claude/skills/shared/SKILL.md", "# Missing frontmatter\n");
  const blocked = path.join(root, "System Volume Information");
  await mkdir(blocked, { recursive: true });

  const report = await runDoctor(root, { readdir: readdirSkipping(blocked, "EPERM") });
  const codes = new Set(report.findings.map((item) => item.code));
  assert.ok(codes.has("skill.frontmatter.invalid"));
  assert.ok(codes.has("skill.name.missing"));
  assert.ok(report.score < 100);
});

test("discover still throws non-permission scandir errors", async () => {
  const root = await fixture();
  await readablePlaybook(root);
  const broken = path.join(root, "lost-dir");
  await mkdir(broken, { recursive: true });

  await assert.rejects(
    () => discover(root, { readdir: readdirSkipping(broken, "ENOENT") }),
    { code: "ENOENT" },
  );
});

test("doctor skips a scan-root directory the process cannot read and still finds readable files", async (t) => {
  if (process.platform === "win32") {
    t.skip("POSIX directory mode 000 is not a Windows ACL");
    return;
  }

  const root = await fixture();
  await readablePlaybook(root);
  const blocked = path.join(root, "System Volume Information");
  await put(blocked, "hidden/SKILL.md", "---\nname: hidden\ndescription: Must not be discovered.\n---\n");
  await chmod(blocked, 0o000);
  t.after(async () => {
    await chmod(blocked, 0o700);
  });

  const report = await runDoctor(root);
  assertReadableInventory(report.inventory);
  assert.equal(report.inventory.mcpServers.length, 1);
  assert.equal(report.findings.length, 0);
  assert.equal(report.score, 100);
});
