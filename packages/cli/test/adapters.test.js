import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { applySync, planGlobalSync, planSync } from "../src/sync.js";

async function fixture() {
  return mkdtemp(path.join(tmpdir(), "agentplaybooks-adapters-"));
}

function normalizedPath(value) {
  return value.split(path.sep).join("/");
}

async function put(root, relativePath, content) {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}

const SKILL = "---\nname: release\ndescription: Prepare a release.\n---\nUse the release checklist.\n";

async function manifestWithCursorTarget(root) {
  const plan = await planSync(root);
  const manifest = plan.manifest;
  manifest.spec.targets.push({ id: "cursor", type: "cursor", enabled: true, config: {} });
  await put(root, "agentplaybook.json", `${JSON.stringify(manifest, null, 2)}\n`);
}

test("sync plans and applies missing platform files for enabled targets", async () => {
  const root = await fixture();
  await put(root, ".claude/skills/release/SKILL.md", SKILL);
  await put(root, ".mcp.json", JSON.stringify({ mcpServers: { deploy: { command: "npx", args: ["deploy-mcp"] } } }));
  await manifestWithCursorTarget(root);

  const plan = await planSync(root);
  const skillAction = plan.fileActions.find((action) => action.kind === "skill");
  const mcpAction = plan.fileActions.find((action) => action.kind === "mcp-config");

  assert.equal(skillAction.target, "cursor");
  assert.equal(skillAction.path, ".cursor/skills/release/SKILL.md");
  assert.equal(mcpAction.path, ".cursor/mcp.json");
  assert.deepEqual(mcpAction.servers, ["deploy"]);
  assert.equal(plan.conflicts.length, 0);

  // Plan-only: nothing on disk yet.
  await assert.rejects(readFile(path.join(root, ".cursor", "mcp.json"), "utf8"), { code: "ENOENT" });

  const result = await applySync(plan);
  assert.ok(result.written.includes(".cursor/skills/release/SKILL.md"));
  assert.equal(await readFile(path.join(root, ".cursor", "skills", "release", "SKILL.md"), "utf8"), SKILL);
  const cursorMcp = JSON.parse(await readFile(path.join(root, ".cursor", "mcp.json"), "utf8"));
  assert.equal(cursorMcp.mcpServers.deploy.command, "npx");

  // A second sync converges to no further file actions.
  const followUp = await planSync(root);
  assert.equal(followUp.fileActions.length, 0);
});

test("sync merges into an existing MCP config with a backup and preserves other keys", async () => {
  const root = await fixture();
  await put(root, ".mcp.json", JSON.stringify({ mcpServers: { deploy: { command: "npx", args: ["deploy-mcp"] } } }));
  await put(root, ".cursor/mcp.json", JSON.stringify({ other: true, mcpServers: { search: { url: "https://mcp.example.com/http" } } }));
  await manifestWithCursorTarget(root);

  const plan = await planSync(root);
  const mcpActions = plan.fileActions.filter((action) => action.kind === "mcp-config");
  // Both directions: deploy is missing from cursor, search is missing from claude.
  assert.deepEqual(mcpActions.map((action) => action.path).sort(), [".cursor/mcp.json", ".mcp.json"]);

  const result = await applySync(plan);
  assert.equal(result.backups.length, 2);

  const cursorMcp = JSON.parse(await readFile(path.join(root, ".cursor", "mcp.json"), "utf8"));
  assert.equal(cursorMcp.other, true);
  assert.ok(cursorMcp.mcpServers.deploy);
  assert.ok(cursorMcp.mcpServers.search);
});

test("sync reports drift as a conflict and never overwrites", async () => {
  const root = await fixture();
  await put(root, ".claude/skills/release/SKILL.md", SKILL);
  await put(root, ".cursor/skills/release/SKILL.md", "---\nname: release\ndescription: Different.\n---\nDifferent content.\n");
  await manifestWithCursorTarget(root);

  const plan = await planSync(root);
  assert.equal(plan.fileActions.filter((action) => action.kind === "skill").length, 0);
  // Drift is already reported by doctor; adapters must not copy either variant
  // to a third target, and existing files must stay untouched.
  await applySync(plan);
  assert.equal(await readFile(path.join(root, ".claude", "skills", "release", "SKILL.md"), "utf8"), SKILL);
});

async function manifestWithTargets(root, types) {
  const plan = await planSync(root);
  const manifest = plan.manifest;
  for (const type of types) {
    manifest.spec.targets.push({ id: type, type, enabled: true, config: {} });
  }
  await put(root, "agentplaybook.json", `${JSON.stringify(manifest, null, 2)}\n`);
}

test("codex target gets skills and a TOML MCP config, both directions", async () => {
  const root = await fixture();
  await put(root, ".claude/skills/release/SKILL.md", SKILL);
  await put(root, ".mcp.json", JSON.stringify({
    mcpServers: { deploy: { command: "npx", args: ["deploy-mcp"], env: { API_KEY: "${DEPLOY_API_KEY}" } } },
  }));
  await put(root, ".codex/config.toml", '[mcp_servers.search]\nurl = "https://mcp.example.com/http"\n');
  await manifestWithTargets(root, ["codex"]);

  const plan = await planSync(root, { homedir: root });
  const skillAction = plan.fileActions.find((action) => action.kind === "skill" && action.target === "codex");
  assert.equal(skillAction.path, ".codex/skills/release/SKILL.md");

  const tomlAction = plan.fileActions.find((action) => action.path === ".codex/config.toml");
  assert.equal(tomlAction.action, "merge");
  assert.match(tomlAction.content, /\[mcp_servers\.search\]/);
  assert.match(tomlAction.content, /\[mcp_servers\.deploy\]\ncommand = "npx"\nargs = \["deploy-mcp"\]/);
  assert.match(tomlAction.content, /\[mcp_servers\.deploy\.env\]\nAPI_KEY = "\$\{DEPLOY_API_KEY\}"/);

  // The codex TOML server is copied into the claude JSON config too.
  const jsonAction = plan.fileActions.find((action) => action.path === ".mcp.json");
  assert.deepEqual(jsonAction.servers, ["search"]);

  await applySync(plan);
  const followUp = await planSync(root, { homedir: root });
  assert.equal(followUp.fileActions.length, 0);
  assert.equal(followUp.conflicts.length, 0);
});

test("antigravity target maps to the portable .agents store", async () => {
  const root = await fixture();
  await put(root, ".claude/skills/release/SKILL.md", SKILL);
  await manifestWithTargets(root, ["antigravity"]);

  const plan = await planSync(root, { homedir: root });
  const skillAction = plan.fileActions.find((action) => action.target === "antigravity");
  assert.equal(skillAction.path, ".agents/skills/release/SKILL.md");

  await applySync(plan);
  // Portable skills count as present for antigravity: no repeat action.
  const followUp = await planSync(root, { homedir: root });
  assert.equal(followUp.fileActions.filter((action) => action.target === "antigravity").length, 0);
});

test("hermes target registers the portable skill store instead of copying into the profile", async () => {
  const root = await fixture();
  const home = await fixture();
  await put(root, ".claude/skills/release/SKILL.md", SKILL);
  await manifestWithTargets(root, ["hermes"]);

  const plan = await planSync(root, { homedir: home, env: {} });
  const skillAction = plan.fileActions.find((action) => action.kind === "skill");
  // Skills land in the portable store, which Hermes is then told to read.
  assert.equal(skillAction.path, ".agents/skills/release/SKILL.md");

  const configAction = plan.fileActions.find((action) => action.kind === "hermes-config");
  assert.equal(configAction.path, "~/.hermes/config.yaml");
  assert.equal(configAction.action, "create");
  assert.deepEqual(configAction.externalDirs, [normalizedPath(path.join(root, ".agents", "skills"))]);

  await applySync(plan);
  const config = await readFile(path.join(home, ".hermes", "config.yaml"), "utf8");
  assert.match(config, /skills:\r?\n {2}external_dirs:/);
  // Nothing was copied into the profile: one store, no duplicate to drift.
  await assert.rejects(readFile(path.join(home, ".hermes", "skills", "release", "SKILL.md"), "utf8"), { code: "ENOENT" });

  const followUp = await planSync(root, { homedir: home, env: {} });
  assert.equal(followUp.fileActions.length, 0);
  assert.equal(followUp.conflicts.length, 0);
});

test("hermes target merges MCP servers into config.yaml and keeps other settings", async () => {
  const root = await fixture();
  const home = await fixture();
  await put(root, ".mcp.json", JSON.stringify({
    mcpServers: {
      deploy: { command: "npx", args: ["deploy-mcp"], env: { API_KEY: "${DEPLOY_API_KEY}" } },
      search: { url: "https://mcp.example.com/http" },
    },
  }));
  await put(home, ".hermes/config.yaml", "# Hermes profile\nmodel: nous/hermes-4\nskills:\n  write_approval: true\nmcp_servers:\n  filesystem:\n    command: npx\n");
  await manifestWithTargets(root, ["hermes"]);

  const plan = await planSync(root, { homedir: home, env: {} });
  const configAction = plan.fileActions.find((action) => action.kind === "hermes-config");
  assert.equal(configAction.action, "merge");
  assert.deepEqual(configAction.servers, ["deploy", "search"]);

  const result = await applySync(plan);
  assert.equal(result.backups.length, 1);

  const config = await readFile(path.join(home, ".hermes", "config.yaml"), "utf8");
  assert.match(config, /# Hermes profile/);
  assert.match(config, /model: nous\/hermes-4/);
  // An existing `skills` section keeps its own settings and gains the store.
  assert.match(config, /write_approval: true/);
  assert.match(config, /external_dirs:/);
  assert.match(config, /filesystem:/);
  assert.match(config, /deploy:/);
  assert.match(config, /API_KEY: \$\{DEPLOY_API_KEY\}/);
  assert.match(config, /url: https:\/\/mcp\.example\.com\/http/);

  const followUp = await planSync(root, { homedir: home, env: {} });
  assert.equal(followUp.fileActions.length, 0);
  assert.equal(followUp.conflicts.length, 0);
});

test("hermes target never overwrites a differing server or SOUL.md", async () => {
  const root = await fixture();
  const home = await fixture();
  await put(root, ".mcp.json", JSON.stringify({ mcpServers: { deploy: { command: "npx", args: ["deploy-mcp"] } } }));
  await put(root, ".agents/persona.md", "You are the release manager.\n");
  await put(home, ".hermes/config.yaml", "mcp_servers:\n  deploy:\n    command: other\n");
  await put(home, ".hermes/SOUL.md", "You are Hermes, a helpful agent.\n");
  await manifestWithTargets(root, ["hermes"]);

  const plan = await planSync(root, { homedir: home, env: {} });
  assert.ok(plan.conflicts.some((item) => item.kind === "mcp" && item.name === "deploy"));
  assert.ok(plan.conflicts.some((item) => item.kind === "persona"));
  assert.equal(plan.fileActions.filter((action) => action.kind === "persona").length, 0);

  await applySync(plan);
  assert.equal(await readFile(path.join(home, ".hermes", "SOUL.md"), "utf8"), "You are Hermes, a helpful agent.\n");
  assert.match(await readFile(path.join(home, ".hermes", "config.yaml"), "utf8"), /command: other/);
});

test("hermes target writes the persona as SOUL.md and honours HERMES_HOME", async () => {
  const root = await fixture();
  const home = await fixture();
  const profile = path.join(home, "profiles", "work");
  await put(root, ".agents/persona.md", "You are the release manager.\n");
  await manifestWithTargets(root, ["hermes"]);

  const plan = await planSync(root, { homedir: home, env: { HERMES_HOME: profile } });
  const personaAction = plan.fileActions.find((action) => action.kind === "persona");
  assert.equal(personaAction.path, "$HERMES_HOME/SOUL.md");

  await applySync(plan);
  assert.equal(await readFile(path.join(profile, "SOUL.md"), "utf8"), "You are the release manager.\n");
});

test("hermes target finds the Windows profile under LOCALAPPDATA", async () => {
  const root = await fixture();
  const home = await fixture();
  const localAppData = await fixture();
  // What the Windows installer actually creates. The documented `~/.hermes` does
  // not exist on such a machine, and writing there would create a second,
  // unused profile.
  await put(localAppData, "hermes/config.yaml", "model: nous/hermes-4\n");
  await put(root, ".mcp.json", JSON.stringify({ mcpServers: { deploy: { command: "npx" } } }));
  await manifestWithTargets(root, ["hermes"]);

  const plan = await planSync(root, { homedir: home, env: { LOCALAPPDATA: localAppData }, platform: "win32" });
  const configAction = plan.fileActions.find((action) => action.kind === "hermes-config");

  assert.equal(configAction.path, "%LOCALAPPDATA%/hermes/config.yaml");
  assert.equal(configAction.action, "merge");

  await applySync(plan);
  assert.match(await readFile(path.join(localAppData, "hermes", "config.yaml"), "utf8"), /deploy:/);
  // Nothing was created at the documented POSIX path.
  await assert.rejects(readFile(path.join(home, ".hermes", "config.yaml"), "utf8"), { code: "ENOENT" });
});

test("hermes target treats profile-only server settings as the same server", async () => {
  const root = await fixture();
  const home = await fixture();
  await put(root, ".mcp.json", JSON.stringify({ mcpServers: { search: { url: "https://mcp.example.com/http" } } }));
  // The same connection, with timeouts the user tuned in Hermes.
  await put(home, ".hermes/config.yaml", "mcp_servers:\n  search:\n    url: https://mcp.example.com/http\n    connect_timeout: 30\n    timeout: 120\n");
  await manifestWithTargets(root, ["hermes"]);

  const plan = await planSync(root, { homedir: home, env: {} });

  assert.equal(plan.conflicts.filter((item) => item.kind === "mcp").length, 0);
  assert.equal(plan.fileActions.filter((action) => action.servers?.includes("search")).length, 0);
});

test("hermes target reports a .hermes.md that hides AGENTS.md", async () => {
  const root = await fixture();
  const home = await fixture();
  await put(root, "AGENTS.md", "# Rules\n\nRun the tests.\n");
  await put(root, ".hermes.md", "# Something else entirely\n");
  await manifestWithTargets(root, ["hermes"]);

  const plan = await planSync(root, { homedir: home, env: {} });
  const conflict = plan.conflicts.find((item) => item.kind === "instructions" && item.name === ".hermes.md");
  assert.ok(conflict);
  assert.match(conflict.reason, /hides AGENTS\.md/);
});

test("antigravity and hermes together plan the shared store only once", async () => {
  const root = await fixture();
  const home = await fixture();
  await put(root, ".claude/skills/release/SKILL.md", SKILL);
  await manifestWithTargets(root, ["antigravity", "hermes"]);

  const plan = await planSync(root, { homedir: home, env: {} });
  const skillActions = plan.fileActions.filter((action) => action.kind === "skill");
  assert.equal(skillActions.length, 1);
  assert.equal(skillActions[0].path, ".agents/skills/release/SKILL.md");
});

test("global sync moves the user's own skills between home stores, not the vendors'", async () => {
  const home = await fixture();
  await put(home, ".cursor/skills/mine/SKILL.md", "---\nname: mine\ndescription: My own skill.\n---\nBody.\n");
  await put(home, ".cursor/skills-cursor/update-cursor-settings/SKILL.md", "---\nname: update-cursor-settings\ndescription: Cursor's own.\n---\nBody.\n");
  await put(home, ".claude/skills/theirs/SKILL.md", "---\nname: theirs\ndescription: Also mine, from Claude.\n---\nBody.\n");
  // A credential-bearing global MCP config: global sync must not copy it around.
  await put(home, ".cursor/mcp.json", JSON.stringify({ mcpServers: { api: { url: "https://api.example.com/mcp", headers: { Authorization: "Bearer real-token" } } } }));

  const plan = await planGlobalSync({ homedir: home, env: {}, targets: ["claude", "cursor", "hermes"] });
  const written = plan.fileActions.map((action) => action.path).sort();

  assert.deepEqual(written, [
    "%LOCALAPPDATA%/hermes/config.yaml".replace("%LOCALAPPDATA%/hermes", "~/.hermes"),
    ".agents/skills/mine/SKILL.md",
    ".agents/skills/theirs/SKILL.md",
    ".claude/skills/mine/SKILL.md",
    ".cursor/skills/theirs/SKILL.md",
  ].sort());
  // Cursor's managed skills stay where they are.
  assert.ok(!written.some((item) => item.includes("update-cursor-settings")));
  // And no MCP file is touched: the token would have been copied into two more
  // files on disk.
  assert.equal(plan.fileActions.filter((action) => action.kind === "mcp-config").length, 0);
  assert.equal(plan.manifestPath, path.join(home, ".agentplaybooks", "agentplaybook.json"));

  await applySync(plan);
  assert.match(await readFile(path.join(home, ".claude", "skills", "mine", "SKILL.md"), "utf8"), /My own skill/);
  assert.match(await readFile(path.join(home, ".cursor", "skills", "theirs", "SKILL.md"), "utf8"), /from Claude/);
  assert.match(await readFile(path.join(home, ".hermes", "config.yaml"), "utf8"), /external_dirs:/);
  // The vendor skill was neither copied nor rewritten.
  await assert.rejects(
    readFile(path.join(home, ".claude", "skills", "update-cursor-settings", "SKILL.md"), "utf8"),
    { code: "ENOENT" },
  );
});

test("global sync includes vendored skills only when asked", async () => {
  const home = await fixture();
  await put(home, ".cursor/skills-cursor/update-cursor-settings/SKILL.md", "---\nname: update-cursor-settings\ndescription: Cursor's own.\n---\nBody.\n");

  const bare = await planGlobalSync({ homedir: home, env: {}, targets: ["claude"] });
  assert.equal(bare.fileActions.length, 0);

  const withVendored = await planGlobalSync({ homedir: home, env: {}, targets: ["claude"], includeVendored: true });
  assert.deepEqual(withVendored.fileActions.map((action) => action.path), [".claude/skills/update-cursor-settings/SKILL.md"]);
});

test("conflicting MCP definitions across platforms are skipped with a conflict", async () => {
  const root = await fixture();
  await put(root, ".mcp.json", JSON.stringify({ mcpServers: { deploy: { command: "npx", args: ["deploy-mcp"] } } }));
  await put(root, ".vscode/mcp.json", JSON.stringify({ mcpServers: { deploy: { command: "npx", args: ["other-mcp"] } } }));
  await manifestWithCursorTarget(root);

  const plan = await planSync(root);
  const conflict = plan.conflicts.find((item) => item.kind === "mcp" && item.name === "deploy");
  assert.ok(conflict);
  assert.equal(plan.fileActions.filter((action) => action.kind === "mcp-config").length, 0);
});

test("grok target writes the portable store and needs no instruction bridge", async () => {
  const root = await fixture();
  await put(root, ".claude/skills/release/SKILL.md", SKILL);
  await put(root, "AGENTS.md", "# Project\nUse the release checklist.\n");
  await manifestWithTargets(root, ["grok"]);

  const plan = await planSync(root, { homedir: root });
  const skillAction = plan.fileActions.find((action) => action.target === "grok");
  // Grok Bot discovers `.agents/skills`, and loads AGENTS.md itself — so the
  // only thing to write is the portable store.
  assert.equal(skillAction.path, ".agents/skills/release/SKILL.md");
  // No bridge file for this target — Grok Bot reads AGENTS.md natively. (The
  // detected `claude` target still writes its own CLAUDE.md import; that is
  // Claude Code's requirement, not Grok's.)
  assert.equal(plan.fileActions.filter((action) => action.kind === "instructions" && action.target === "grok").length, 0);

  await applySync(plan);
  const followUp = await planSync(root, { homedir: root });
  assert.equal(followUp.fileActions.filter((action) => action.target === "grok").length, 0);
});

test("grok reports MCP servers it cannot receive instead of dropping them silently", async () => {
  const root = await fixture();
  await put(root, ".mcp.json", JSON.stringify({ mcpServers: { deploy: { command: "npx", args: ["deploy-mcp"] } } }));
  await manifestWithTargets(root, ["grok"]);

  const plan = await planSync(root, { homedir: root });
  const reported = plan.conflicts.find((item) => item.target === "grok" && item.kind === "mcp");
  assert.ok(reported, "expected the MCP Box limitation to be reported");
  assert.match(reported.reason, /MCP Box/);
  assert.match(reported.name, /deploy/);
  // Nothing is written for it: there is no project file to write.
  assert.equal(plan.fileActions.filter((action) => action.kind === "mcp-config" && action.target === "grok").length, 0);
});

test("grok stays quiet about MCP when the playbook has no servers", async () => {
  const root = await fixture();
  await put(root, ".claude/skills/release/SKILL.md", SKILL);
  await manifestWithTargets(root, ["grok"]);

  const plan = await planSync(root, { homedir: root });
  assert.equal(plan.conflicts.filter((item) => item.target === "grok").length, 0);
});

test("grok and antigravity together plan the shared portable store only once", async () => {
  const root = await fixture();
  await put(root, ".claude/skills/release/SKILL.md", SKILL);
  await manifestWithTargets(root, ["grok", "antigravity"]);

  const plan = await planSync(root, { homedir: root });
  const skillActions = plan.fileActions.filter((action) => action.kind === "skill");
  assert.equal(skillActions.length, 1);
  assert.equal(skillActions[0].path, ".agents/skills/release/SKILL.md");
});
