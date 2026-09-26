import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isMap, parseDocument } from "yaml";
import { applyAdapters } from "./adapters.js";
import { hermesProfile } from "./discovery.js";
import { resolveBaseUrl } from "./remote.js";

const GUID = /^(?:[a-f\d]{8,}|[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12})$/i;
const PROVIDER = "agentplaybooks-memory";
const LEGACY_PROVIDER = "agentplaybooks";
const PLUGIN_FILES = ["__init__.py", "client.py", "config_schema.py", "plugin.yaml", "README.md", "LICENSE"];
const digest = (value) => value === null ? null : createHash("sha256").update(value).digest("hex");

async function readOptional(filename) {
  try { return await readFile(filename, "utf8"); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

export async function planHermesMemory(options = {}) {
  if (!GUID.test(options.playbook ?? "")) throw new Error("Pass the private memory playbook GUID.");
  const env = options.env ?? process.env;
  const profile = await hermesProfile({ ...options, env: options.hermesHome ? { ...env, HERMES_HOME: options.hermesHome } : env });
  const baseUrl = resolveBaseUrl(options.url, env);
  const url = new URL(baseUrl);
  if (url.username || url.password || url.search || url.hash ||
      !(url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) {
    throw new Error("Use HTTPS (HTTP is allowed only on localhost).");
  }
  const shared = [...new Set((options.sharedPlaybooks ?? "").split(",").map(x => x.trim()).filter(Boolean))];
  if (shared.some(guid => !GUID.test(guid))) throw new Error("Shared playbooks must be comma-separated GUIDs.");
  const fileActions = [], conflicts = [];
  const add = (name, old, content) => {
    if (old === content) return;
    fileActions.push({ target: "hermes", kind: "memory-provider", name, path: `${profile.display}/${name}`,
      absolutePath: path.join(profile.directory, name), action: old === null ? "create" : "merge", expectedHash: digest(old), content });
  };
  const conflict = (name, reason) => conflicts.push({ kind: "memory-provider", name, reason });
  const configPath = path.join(profile.directory, "config.yaml");
  const oldYaml = await readOptional(configPath);
  const yaml = parseDocument(oldYaml ?? "{}\n");
  if (yaml.errors.length || !isMap(yaml.contents)) throw new Error("Hermes config.yaml must be a valid YAML mapping.");
  const memory = yaml.get("memory", true);
  if (memory !== undefined && !isMap(memory)) throw new Error("Hermes memory configuration must be a mapping.");
  const selected = yaml.getIn(["memory", "provider"]);
  if (selected && ![PROVIDER, LEGACY_PROVIDER, "builtin", "built-in", "none", "default"].includes(selected)) {
    conflict("memory.provider", `The profile uses '${selected}'. Select AgentPlaybooks explicitly with 'hermes memory setup' before rerunning.`);
  }
  const disabled = yaml.getIn(["plugins", "disabled"]);
  if (disabled?.toJSON?.()?.includes(PROVIDER)) conflict("plugins.disabled", "AgentPlaybooks Memory is disabled; enable it in Hermes before setup.");
  if (selected !== PROVIDER) {
    yaml.setIn(["memory", "provider"], PROVIDER);
    add("config.yaml", oldYaml, String(yaml));
  }

  const settingsName = "agentplaybooks/config.json";
  const oldSettings = await readOptional(path.join(profile.directory, settingsName));
  const settings = oldSettings === null ? {} : JSON.parse(oldSettings);
  const desired = { base_url: baseUrl, playbook_guid: options.playbook, shared_playbooks: shared.join(",") };
  if (Object.entries(desired).some(([key, value]) => settings[key] !== undefined && settings[key] !== value)) {
    conflict(settingsName, "Existing memory settings differ. Edit them in 'hermes memory setup' to switch playbooks; no memory is migrated automatically.");
  }
  if (Object.entries(desired).some(([key, value]) => settings[key] !== value)) {
    add(settingsName, oldSettings, JSON.stringify({ ...settings, ...desired }, null, 2) + "\n");
  }
  // Bundled for npm installations; source fallback supports repository development.
  const bundled = fileURLToPath(new URL("../hermes-plugin/", import.meta.url));
  const source = fileURLToPath(new URL("../../hermes-memory/agentplaybooks/", import.meta.url));
  const pluginDirectory = options.pluginDirectory ?? ((await readOptional(path.join(bundled, "plugin.yaml"))) !== null ? bundled : source);
  for (const name of PLUGIN_FILES) {
    const relative = `plugins/${PROVIDER}/${name}`;
    const content = await readFile(path.join(pluginDirectory, name), "utf8");
    const old = await readOptional(path.join(profile.directory, relative));
    if (old !== null && old !== content) conflict(relative, "An installed plugin file differs; update through Hermes or reconcile it explicitly.");
    add(relative, old, content);
  }
  return { profile: profile.directory, fileActions, conflicts, changed: fileActions.length > 0,
    keyEnvVar: "AGENTPLAYBOOKS_MEMORY_API_KEY", playbook: options.playbook,
    keyPresentInEnvironment: Boolean(env.AGENTPLAYBOOKS_MEMORY_API_KEY) };
}

export async function applyHermesMemory(plan) {
  if (plan.conflicts.length) throw new Error("Resolve memory setup conflicts before applying; no files were written.");
  // Refuse a stale plan if a user edited any target after preview.
  // applyAdapters preserves existing files in the profile's backup directory.
  for (const action of plan.fileActions) {
    if (digest(await readOptional(action.absolutePath)) !== action.expectedHash) {
      throw new Error(`Setup target changed after planning: ${action.path}. Rerun the plan.`);
    }
  }
  return applyAdapters(plan.fileActions, path.join(plan.profile, ".agentplaybooks", "backups", `memory-${Date.now()}`));
}

export function printHermesMemoryPlan(plan, log = console.log) {
  log(`Hermes memory: private playbook ${plan.playbook}`);
  log(`Profile: ${plan.profile}`);
  for (const action of plan.fileActions) log(`  ${action.action} ${action.path}`);
  for (const item of plan.conflicts) log(`  [conflict] ${item.name}: ${item.reason}`);
  log(`Credential: ${plan.keyEnvVar} (profile-scoped environment; never copied by this command).`);
  log("Use 'hermes memory setup' for credential setup, then 'hermes memory status' to verify.");
}
