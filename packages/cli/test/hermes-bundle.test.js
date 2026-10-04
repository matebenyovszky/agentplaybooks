import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  applyHermesSync,
  botDistribution,
  mergeDefaults,
  planHermesSync,
  publicSyncPlan,
  readBundleConfig,
  recordedSource,
} from "../src/hermes-bundle.js";

const BUNDLE = "1111111111111111";
const BOT = "2222222222222222";
const SHARED = "3333333333333333";
const MEMORY = "4444444444444444";
const URL_BASE = "http://localhost:3000";

function bundlePlaybook(overrides = {}) {
  return {
    guid: BUNDLE,
    name: "Org baseline",
    config: {
      hermes: {
        managed: {
          providers: { "local-llm": { base_url: "http://llm.example:11434/v1", key_env: "LOCAL_LLM_KEY" } },
          mcp_servers: { mssql: { url: "http://sql.example:8006/mcp", timeout: 120 } },
        },
        defaults: { model: { default: "qwen3.8:27b", provider: "local-llm" } },
        env: { MSGRAPH_CLIENT_ID: "client-id", LOCAL_LLM_KEY: "ollama" },
        bots: [BOT],
        shared_memory: [SHARED],
      },
    },
    skills: [
      { name: "office-live", description: "Edit open Office documents.", content: "# Office\n",
        attachments: [{ filename: "scripts/office.py", content: "print('x')\n" }, { filename: "../escape.py", content: "bad" }] },
      { name: "Bad Name", description: "x", content: "x" },
    ],
    ...overrides,
  };
}

function botPlaybook() {
  return {
    guid: BOT,
    name: "Elemző Bot",
    description: "Adatbányász bot",
    persona_system_prompt: "Te egy adatelemző bot vagy.",
    instructions: "Mindig SQL-lel ellenőrizz.",
    config: { hermes: { profile_name: "analyst" } },
    skills: [{ name: "mssql-mcp-usage", description: "Query SQL Server via MCP.", content: "# SQL\n" }],
    mcp_servers: [{ name: "pricing", transport_type: "http", transport_config: { url: "https://api.pricing.example/mcp" } },
      { name: "fed", transport_type: "openapi", transport_config: {} }],
  };
}

function fakeFetch(playbooks) {
  return async (url) => {
    const guid = decodeURIComponent(new URL(url).pathname.split("/").pop());
    const playbook = playbooks[guid];
    return playbook
      ? { ok: true, status: 200, json: async () => structuredClone(playbook) }
      : { ok: false, status: 404, json: async () => ({ error: "Playbook not found" }) };
  };
}

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "apb-hermes-bundle-"));
  const hermesHome = path.join(root, "hermes");
  await mkdir(hermesHome, { recursive: true });
  await writeFile(path.join(hermesHome, "config.yaml"), "# mine\nmodel:\n  default: my-model\n");
  return { root, hermesHome, managedDir: path.join(root, "managed") };
}

// Stands in for the Hermes CLI: `profile install` creates the profile with its
// manifest, which is what the next sync detects as already installed.
function fakeHermes(calls) {
  return (binary, args, { home }) => {
    calls.push(args.join(" "));
    if (args[1] === "install") {
      const profile = path.join(home, "profiles", args[args.indexOf("--name") + 1]);
      mkdirSync(profile, { recursive: true });
      // Real Hermes stamps the install source; `profile update` re-pulls it.
      writeFileSync(path.join(profile, "distribution.yaml"), `name: analyst\nsource: ${JSON.stringify(args[2])}\n`);
    }
    return { status: 0, output: "ok" };
  };
}

test("sync writes the managed layer, skills, bots, defaults and memory, and never prints the key", async () => {
  const { hermesHome, managedDir } = await fixture();
  const options = {
    bundle: BUNDLE, url: URL_BASE, memory: MEMORY, managedDir, hermesHome,
    env: { AGENTPLAYBOOKS_MEMORY_API_KEY: "apb_secret_do_not_print", HERMES_MANAGED_DIR: managedDir },
    fetchImpl: fakeFetch({ [BUNDLE]: bundlePlaybook(), [BOT]: botPlaybook() }),
  };
  const plan = await planHermesSync(options);
  assert.deepEqual(plan.installs.map((install) => install.action), ["install"]);
  assert.ok(plan.warnings.some((warning) => warning.includes("Bad Name")));
  assert.ok(plan.warnings.some((warning) => warning.includes("../escape.py")));
  assert.ok(!JSON.stringify(publicSyncPlan(plan)).includes("apb_secret_do_not_print"));

  const calls = [];
  const result = await applyHermesSync(plan, { runHermes: fakeHermes(calls) });
  assert.deepEqual(result.failures, []);
  assert.deepEqual(calls, [`profile install ${path.join(managedDir, "bots", "analyst")} --name analyst -y`]);

  const managed = await readFile(path.join(managedDir, "config.yaml"), "utf8");
  assert.match(managed, /llm.example/);
  assert.match(managed, /provider: agentplaybooks-memory/);
  assert.match(managed, /external_dirs:/);
  assert.ok(managed.includes(path.join(managedDir, "skills")));
  const env = await readFile(path.join(managedDir, ".env"), "utf8");
  assert.match(env, /^AGENTPLAYBOOKS_MEMORY_API_KEY=apb_secret_do_not_print$/m);
  assert.match(env, /^MSGRAPH_CLIENT_ID=client-id$/m);
  if (process.platform !== "win32") assert.equal((await stat(path.join(managedDir, ".env"))).mode & 0o777, 0o600);

  assert.match(await readFile(path.join(managedDir, "skills", "office-live", "SKILL.md"), "utf8"), /name: office-live/);
  assert.equal(await readFile(path.join(managedDir, "skills", "office-live", "scripts", "office.py"), "utf8"), "print('x')\n");
  const soul = await readFile(path.join(managedDir, "bots", "analyst", "SOUL.md"), "utf8");
  assert.match(soul, /adatelemző bot vagy/);
  assert.match(soul, /SQL-lel ellenőrizz/);

  const userConfig = await readFile(path.join(hermesHome, "config.yaml"), "utf8");
  assert.match(userConfig, /# mine/);
  assert.match(userConfig, /default: my-model/);
  assert.match(userConfig, /provider: local-llm/);
  // Hermes reads skills.external_dirs from the profile config without the managed overlay.
  assert.ok(userConfig.includes(path.join(managedDir, "skills")));
  const botConfig = await readFile(path.join(hermesHome, "profiles", "analyst", "config.yaml"), "utf8");
  assert.match(botConfig, /default: qwen3\.8:27b/);
  assert.match(botConfig, /api.pricing.example/);
  assert.doesNotMatch(botConfig, /fed:/);

  assert.deepEqual(result.memory, ["default", "analyst"]);
  const memorySettings = JSON.parse(await readFile(path.join(hermesHome, "profiles", "analyst", "agentplaybooks", "config.json"), "utf8"));
  assert.equal(memorySettings.playbook_guid, MEMORY);
  assert.equal(memorySettings.shared_playbooks, SHARED);
  const state = JSON.parse(await readFile(path.join(managedDir, "state.json"), "utf8"));
  assert.equal(state.bundle.guid, BUNDLE);
});

test("a second sync updates the bot, keeps the memory key, and drops a removed skill", async () => {
  const { hermesHome, managedDir } = await fixture();
  const playbooks = { [BUNDLE]: bundlePlaybook(), [BOT]: botPlaybook() };
  const base = { bundle: BUNDLE, url: URL_BASE, memory: MEMORY, managedDir, hermesHome, fetchImpl: fakeFetch(playbooks) };
  await applyHermesSync(await planHermesSync({ ...base, env: { AGENTPLAYBOOKS_MEMORY_API_KEY: "apb_first" } }), { runHermes: fakeHermes([]) });

  playbooks[BUNDLE] = bundlePlaybook({ skills: [] });
  const plan = await planHermesSync({ ...base, env: {} });
  assert.equal(plan.memoryKeySource, "kept");
  assert.deepEqual(plan.installs.map((install) => install.action), ["update"]);
  const calls = [];
  await applyHermesSync(plan, { runHermes: fakeHermes(calls) });
  assert.deepEqual(calls, ["profile update analyst -y"]);
  assert.match(await readFile(path.join(managedDir, ".env"), "utf8"), /AGENTPLAYBOOKS_MEMORY_API_KEY=apb_first/);
  await assert.rejects(readFile(path.join(managedDir, "skills", "office-live", "SKILL.md")), { code: "ENOENT" });
});

test("credentials from --env-file survive later syncs; keys the bundle drops are removed", async () => {
  const { root, hermesHome, managedDir } = await fixture();
  const secrets = path.join(root, "secrets.env");
  await writeFile(secrets, "PRICING_API_TOKEN=pricing-secret\nCLOUD_LLM_KEY=\"azure secret\"\n");
  const playbooks = { [BUNDLE]: bundlePlaybook(), [BOT]: botPlaybook() };
  const base = { bundle: BUNDLE, url: URL_BASE, managedDir, hermesHome, env: {}, fetchImpl: fakeFetch(playbooks) };
  const first = await planHermesSync({ ...base, envFile: secrets });
  assert.ok(!JSON.stringify(publicSyncPlan(first)).includes("pricing-secret"));
  await applyHermesSync(first, { runHermes: fakeHermes([]) });

  const bundleWithoutClientId = bundlePlaybook();
  delete bundleWithoutClientId.config.hermes.env.MSGRAPH_CLIENT_ID;
  playbooks[BUNDLE] = bundleWithoutClientId;
  const second = await planHermesSync({ ...base, envFile: path.join(root, "unreachable.env") });
  assert.ok(second.warnings.some((warning) => warning.includes("not readable")));
  await applyHermesSync(second, { runHermes: fakeHermes([]) });
  const env = await readFile(path.join(managedDir, ".env"), "utf8");
  assert.match(env, /^PRICING_API_TOKEN=pricing-secret$/m);
  assert.match(env, /^CLOUD_LLM_KEY="azure secret"$/m);
  assert.match(env, /^LOCAL_LLM_KEY=ollama$/m);
  assert.doesNotMatch(env, /MSGRAPH_CLIENT_ID/);
});

test("a bot installed from another source is reinstalled from the bundle, keeping user data", async () => {
  const { hermesHome, managedDir } = await fixture();
  const profile = path.join(hermesHome, "profiles", "analyst");
  await mkdir(profile, { recursive: true });
  await writeFile(path.join(profile, "distribution.yaml"), "name: analyst\nsource: D:\\old-package\\profiles\\analyst\n");
  const plan = await planHermesSync({ bundle: BUNDLE, url: URL_BASE, managedDir, hermesHome, env: {},
    fetchImpl: fakeFetch({ [BUNDLE]: bundlePlaybook(), [BOT]: botPlaybook() }) });
  assert.deepEqual(plan.installs.map((install) => install.action), ["reinstall"]);
  const calls = [];
  await applyHermesSync(plan, { runHermes: fakeHermes(calls) });
  assert.deepEqual(calls, [`profile install ${path.join(managedDir, "bots", "analyst")} --name analyst --force -y`]);
  assert.equal(recordedSource(await readFile(path.join(profile, "distribution.yaml"), "utf8")), path.join(managedDir, "bots", "analyst"));
});

test("bundle plugins are installed into every synced profile that lacks them", async () => {
  const { hermesHome, managedDir } = await fixture();
  const bundle = bundlePlaybook();
  bundle.config.hermes.plugins = ["agentplaybooks-tools", "agentplaybooks-memory",
    { name: "pinned", source: "https://git.example/pinned.git", ref: "a".repeat(40) }];
  await mkdir(path.join(hermesHome, "plugins", "agentplaybooks-tools"), { recursive: true });
  const plan = await planHermesSync({ bundle: BUNDLE, url: URL_BASE, managedDir, hermesHome, env: {},
    fetchImpl: fakeFetch({ [BUNDLE]: bundle, [BOT]: botPlaybook() }) });
  assert.deepEqual(publicSyncPlan(plan).plugins, ["agentplaybooks-tools", "pinned"]);
  assert.ok(plan.warnings.some((warning) => warning.includes("installed by --memory")));
  const calls = [];
  const result = await applyHermesSync(plan, { runHermes: fakeHermes(calls) });
  assert.deepEqual(calls.filter((call) => call.includes("plugins")), [
    `plugins install https://git.example/pinned.git --enable --ref ${"a".repeat(40)}`,
    "-p analyst plugins install agentplaybooks-tools --enable",
    `-p analyst plugins install https://git.example/pinned.git --enable --ref ${"a".repeat(40)}`,
  ]);
  assert.equal(result.plugins.length, 3);
  assert.throws(() => readBundleConfig({ config: { hermes: { plugins: [{ name: "x", ref: "short" }] } } }), /40-character/);
});

test("a hand-made profile with a bot's name is left alone", async () => {
  const { hermesHome, managedDir } = await fixture();
  await mkdir(path.join(hermesHome, "profiles", "analyst"), { recursive: true });
  await writeFile(path.join(hermesHome, "profiles", "analyst", "config.yaml"), "model: mine\n");
  const plan = await planHermesSync({ bundle: BUNDLE, url: URL_BASE, managedDir, hermesHome, env: {},
    fetchImpl: fakeFetch({ [BUNDLE]: bundlePlaybook(), [BOT]: botPlaybook() }) });
  assert.deepEqual(plan.installs, []);
  assert.deepEqual(plan.profiles.map((profile) => profile.name), ["default"]);
  assert.ok(plan.warnings.some((warning) => warning.includes("left alone")));
});

test("a bot the user deleted (Hermes tombstone) is not reinstalled", async () => {
  const { hermesHome, managedDir } = await fixture();
  await mkdir(path.join(hermesHome, "profiles", ".deleted"), { recursive: true });
  await writeFile(path.join(hermesHome, "profiles", ".deleted", "analyst"), "deleted\n");
  const plan = await planHermesSync({ bundle: BUNDLE, url: URL_BASE, managedDir, hermesHome, env: {},
    fetchImpl: fakeFetch({ [BUNDLE]: bundlePlaybook(), [BOT]: botPlaybook() }) });
  assert.deepEqual(plan.installs, []);
  assert.ok(plan.warnings.some((warning) => warning.includes("was deleted on this machine")));
});

test("refuses insecure transport, unreadable bundles and invalid bundle config", async () => {
  const { hermesHome, managedDir } = await fixture();
  const base = { bundle: BUNDLE, managedDir, hermesHome, env: {}, fetchImpl: fakeFetch({ [BUNDLE]: bundlePlaybook(), [BOT]: botPlaybook() }) };
  await assert.rejects(planHermesSync({ ...base, url: "http://intranet.example:8007" }), /HTTPS/);
  await planHermesSync({ ...base, url: "http://intranet.example:8007", allowInsecureHttp: true });
  await assert.rejects(planHermesSync({ ...base, url: URL_BASE, bundle: "5555555555555555" }), /public or unlisted/);
  await assert.rejects(planHermesSync({ ...base, url: URL_BASE, memory: "not-a-guid" }), /--memory/);
  assert.throws(() => readBundleConfig({ config: { hermes: { env: { "bad-name": "x" } } } }), /environment variable name/);
  assert.throws(() => readBundleConfig({ config: { hermes: { env: { AGENTPLAYBOOKS_MEMORY_API_KEY: "x" } } } }), /personal/);
  assert.throws(() => readBundleConfig({ config: { hermes: { bots: ["../x"] } } }), /GUIDs/);
  assert.throws(() => botDistribution({ name: "!!!", config: {} }), /profile name/);
});

test("defaults never override a set key and keep comments", () => {
  const merged = mergeDefaults("# keep\nmodel:\n  default: mine\n", { model: { default: "theirs", provider: "local-llm" }, display: { compact: true } });
  assert.match(merged, /# keep/);
  assert.match(merged, /default: mine/);
  assert.match(merged, /provider: local-llm/);
  assert.match(merged, /compact: true/);
  assert.equal(mergeDefaults("model:\n  default: mine\n", {}), null);
  const withDirs = mergeDefaults("skills:\n  external_dirs:\n    - /mine\n", {}, { externalDirs: ["/org"] });
  assert.match(withDirs, /- \/mine\n\s+- \/org/);
  assert.equal(mergeDefaults(withDirs, {}, { externalDirs: ["/org"] }), null);
  assert.match(mergeDefaults("model: x\n", {}, { externalDirs: ["/org"] }), /external_dirs:\n\s+- \/org/);
  const fromCommentOnly = mergeDefaults("# only a comment\n", { model: { default: "theirs" } });
  assert.match(fromCommentOnly, /# only a comment/);
  assert.match(fromCommentOnly, /default: theirs/);
  assert.equal(mergeDefaults("model:\n  default: mine\n", { model: { default: "theirs" } }), null);
});
