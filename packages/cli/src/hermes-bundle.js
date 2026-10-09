/**
 * An organisation's Hermes baseline, delivered from one playbook.
 *
 * A bundle playbook carries, in `config.hermes`, what every Hermes install in
 * the organisation should share: the LLM providers, the MCP servers, the bots
 * to install, the shared knowledge to read. Its skills are the organisation's
 * skills. `apb hermes sync <bundle>` turns that into files Hermes already
 * understands, so nothing here reimplements Hermes:
 *
 *   managed/config.yaml   Hermes's managed scope (HERMES_MANAGED_DIR): pinned
 *                         values the user cannot override from the UI.
 *   managed/.env          managed environment, loaded last by Hermes.
 *   managed/skills/       the bundle's skills, pinned as skills.external_dirs.
 *   managed/bots/<name>/  one profile distribution per bot playbook, installed
 *                         with `hermes profile install` / `profile update`.
 *
 * `config.hermes.defaults` is the one part that is not pinned: it is merged
 * into a profile's own config.yaml only where that key is unset, so a user can
 * still pick another default model.
 *
 * The managed directory is regenerated on every sync; anything edited by hand
 * inside it is replaced. The user's own profiles are only ever added to.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isMap, parseDocument, stringify } from "yaml";

import { hermesProfile, normalizeText } from "./discovery.js";
import { applyHermesMemory, planHermesMemory } from "./hermes-memory.js";
import {
  DEFAULT_PERSONA_PROMPT,
  isSafeSkillFile,
  localMcpDefinition,
  resolveBaseUrl,
  SAFE_SKILL_NAME,
  skillFileContent,
} from "./remote.js";

const GUID = /^(?:[a-f\d]{8,}|[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12})$/i;
const SAFE_PROFILE_NAME = /^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/;
const ENV_NAME = /^[A-Z_][A-Z0-9_]*$/;
const MEMORY_KEY_ENV = "AGENTPLAYBOOKS_MEMORY_API_KEY";
const HERMES_REQUIRES = ">=0.20.0";
const STATE_FILE = "state.json";
const digest = (value) => value === null ? null : createHash("sha256").update(value).digest("hex");

async function readOptional(filename) {
  try { return await readFile(filename, "utf8"); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

async function exists(filename) {
  try { await access(filename); return true; } catch { return false; }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Same rule as `apb memory setup`: HTTPS, or HTTP on localhost, or an explicit intranet opt-in. */
export function assertBundleUrl(baseUrl, allowInsecureHttp = false) {
  const url = new URL(baseUrl);
  if (url.username || url.password || url.search || url.hash ||
      !(url.protocol === "https:" || (url.protocol === "http:" &&
        (allowInsecureHttp || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))))) {
    throw new Error("Use HTTPS (HTTP is allowed only on localhost, or with --allow-insecure-http for an intranet instance).");
  }
  return url;
}

export function defaultManagedDir({ env = process.env, platform = process.platform, homedir = os.homedir() } = {}) {
  const base = platform === "win32" && env.LOCALAPPDATA
    ? env.LOCALAPPDATA
    : path.join(homedir, ".local", "share");
  return path.join(base, "agentplaybooks", "hermes-managed");
}

/**
 * Bundle and bot playbooks are read from the agent-facing endpoint, which
 * answers anonymously for public and unlisted playbooks. On an intranet-only
 * instance an unlisted bundle is therefore readable by every employee without
 * handing each of them a credential.
 */
export async function fetchPlaybook(baseUrl, guid, { fetchImpl = fetch } = {}) {
  if (!GUID.test(guid ?? "")) throw new Error(`'${guid}' is not a playbook GUID.`);
  const response = await fetchImpl(`${baseUrl}/api/playbooks/${encodeURIComponent(guid)}?format=json`, {
    headers: { Accept: "application/json" },
    redirect: "error",
  });
  if (response.status === 404) {
    throw new Error(`Playbook ${guid} was not found at ${baseUrl}. Bundle and bot playbooks must be public or unlisted.`);
  }
  if (!response.ok) throw new Error(`Reading playbook ${guid} failed: HTTP ${response.status}`);
  return response.json();
}

/** Validate `config.hermes` of a bundle; every field is optional. */
export function readBundleConfig(playbook) {
  const hermes = playbook?.config?.hermes ?? {};
  if (!isPlainObject(hermes)) throw new Error("The bundle's config.hermes must be an object.");
  for (const key of ["managed", "defaults", "env"]) {
    if (hermes[key] !== undefined && !isPlainObject(hermes[key])) throw new Error(`config.hermes.${key} must be an object.`);
  }
  const env = hermes.env ?? {};
  for (const [name, value] of Object.entries(env)) {
    if (!ENV_NAME.test(name)) throw new Error(`config.hermes.env: '${name}' is not an environment variable name.`);
    if (typeof value !== "string" || /[\r\n]/.test(value)) throw new Error(`config.hermes.env.${name} must be a single-line string.`);
    if (name === MEMORY_KEY_ENV) throw new Error(`config.hermes.env must not carry ${MEMORY_KEY_ENV}; it is personal.`);
  }
  const guids = (key) => {
    const list = hermes[key] ?? [];
    if (!Array.isArray(list) || list.some((guid) => typeof guid !== "string" || !GUID.test(guid))) {
      throw new Error(`config.hermes.${key} must be a list of playbook GUIDs.`);
    }
    return [...new Set(list)];
  };
  if (hermes.managed?.skills !== undefined && !isPlainObject(hermes.managed.skills)) {
    throw new Error("config.hermes.managed.skills must be an object.");
  }
  // Hermes plugins, as `hermes plugins install` identifiers: a catalog name,
  // or { name, source, ref } for a Git source pinned to a commit.
  const plugins = [];
  for (const entry of hermes.plugins ?? []) {
    const plugin = typeof entry === "string" ? { name: entry, source: entry } : entry;
    if (!isPlainObject(plugin) || typeof plugin.name !== "string" || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(plugin.name)
        || (plugin.source !== undefined && (typeof plugin.source !== "string" || /\s/.test(plugin.source)))
        || (plugin.ref !== undefined && !/^[0-9a-f]{40}$/.test(plugin.ref))) {
      throw new Error("config.hermes.plugins entries must be catalog names or { name, source, ref } with a 40-character commit.");
    }
    plugins.push({ name: plugin.name, source: plugin.source ?? plugin.name, ...(plugin.ref ? { ref: plugin.ref } : {}) });
  }
  return {
    managed: hermes.managed ?? {},
    defaults: hermes.defaults ?? {},
    env,
    bots: guids("bots"),
    sharedMemory: guids("shared_memory"),
    plugins,
  };
}

function asciiSlug(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
}

/** A skill's directory contents, as `pull` would write them. Unsafe entries are reported, not written. */
export function skillFiles(skill, warnings = []) {
  if (typeof skill?.name !== "string" || !SAFE_SKILL_NAME.test(skill.name)) {
    warnings.push(`Skipped skill '${String(skill?.name)}': not a safe lowercase kebab-case name.`);
    return null;
  }
  const document = skillFileContent(skill);
  if (document === null) {
    warnings.push(`Skipped skill '${skill.name}': it has no description.`);
    return null;
  }
  const files = [{ relativePath: "SKILL.md", content: document }];
  for (const file of skill.attachments ?? []) {
    if (!isSafeSkillFile(file?.filename)) {
      warnings.push(`Skipped file '${skill.name}/${String(file?.filename)}': not a safe path.`);
      continue;
    }
    files.push({ relativePath: file.filename, content: normalizeText(file.content ?? "") });
  }
  return { name: skill.name, files };
}

function yamlScalar(value) {
  const text = String(value);
  return /^[A-Za-z0-9][A-Za-z0-9 ._\-/:]*$/.test(text) && !/:\s/.test(text) ? text : JSON.stringify(text);
}

/**
 * One bot playbook as a profile distribution. Its persona becomes SOUL.md,
 * followed by the playbook's instructions; MCP servers of the bot go into the
 * bot profile's config.yaml after installation, because a distribution must
 * not ship a config.yaml (`profile install` would replace the user's).
 */
export function botDistribution(playbook, warnings = []) {
  const botConfig = isPlainObject(playbook?.config?.hermes) ? playbook.config.hermes : {};
  const profileName = typeof botConfig.profile_name === "string" ? botConfig.profile_name : asciiSlug(playbook?.name);
  if (!SAFE_PROFILE_NAME.test(profileName) || profileName === "default") {
    throw new Error(`Bot playbook '${playbook?.name}' has no usable Hermes profile name; set config.hermes.profile_name.`);
  }
  const persona = typeof playbook?.persona_system_prompt === "string" ? normalizeText(playbook.persona_system_prompt).trim() : "";
  const instructions = typeof playbook?.instructions === "string" ? normalizeText(playbook.instructions).trim() : "";
  const soul = [persona && persona !== DEFAULT_PERSONA_PROMPT ? persona : "", instructions].filter(Boolean).join("\n\n");

  const files = [];
  if (soul) files.push({ path: "SOUL.md", content: `${soul}\n` });
  const skills = [];
  for (const skill of playbook?.skills ?? []) {
    const entry = skillFiles(skill, warnings);
    if (!entry) continue;
    skills.push(entry.name);
    for (const file of entry.files) {
      files.push({ path: `skills/${entry.name}/${file.relativePath}`, content: file.content.endsWith("\n") ? file.content : `${file.content}\n` });
    }
  }
  const owned = ["distribution.yaml", ...(soul ? ["SOUL.md"] : []), ...(skills.length ? ["skills/"] : [])];
  const version = typeof botConfig.version === "string" ? botConfig.version : "1.0.0";
  const lines = [
    "# Generated by `apb hermes sync`. Edit the bot's playbook, not this file.",
    `name: ${yamlScalar(profileName)}`,
    `version: ${yamlScalar(version)}`,
    ...(playbook?.description ? [`description: ${yamlScalar(String(playbook.description).replace(/\s+/g, " ").slice(0, 300))}`] : []),
    `hermes_requires: ${yamlScalar(HERMES_REQUIRES)}`,
    "distribution_owned:",
    ...owned.map((entry) => `  - ${entry}`),
  ];
  files.unshift({ path: "distribution.yaml", content: `${lines.join("\n")}\n` });

  const mcpServers = {};
  for (const server of playbook?.mcp_servers ?? []) {
    const definition = typeof server?.name === "string" ? localMcpDefinition(server) : null;
    if (definition) mcpServers[server.name] = definition;
    else if (server?.name) warnings.push(`Bot '${profileName}': MCP server '${server.name}' has no local equivalent; skipped.`);
  }
  return { guid: playbook.guid, name: playbook.name, profileName, skills, files, mcpServers };
}

function renderEnv(values) {
  const lines = ["# Generated by `apb hermes sync`. Replaced on every sync."];
  for (const [name, value] of Object.entries(values).sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`${name}=${/[\s#"'$]/.test(value) ? JSON.stringify(value) : value}`);
  }
  return `${lines.join("\n")}\n`;
}

function parseEnv(content) {
  const values = {};
  for (const line of normalizeText(content ?? "").split("\n")) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2];
    if (value.startsWith("\"") && value.endsWith("\"")) {
      try { value = JSON.parse(value); } catch { /* keep the raw text */ }
    }
    values[match[1]] = value;
  }
  return values;
}

/**
 * Merge `defaults` into a profile's config.yaml, leaf by leaf, only where the
 * key is unset. Comments and every existing value are preserved. Returns null
 * when nothing would change.
 */
export function mergeDefaults(existingYaml, defaults, extra = {}) {
  const document = parseDocument(existingYaml ?? "{}\n");
  // An empty or comment-only file is an empty mapping to Hermes, too.
  if (!document.errors.length && document.contents === null) document.contents = document.createNode({});
  if (document.errors.length || !isMap(document.contents)) throw new Error("Hermes config.yaml must be a valid YAML mapping.");
  let changed = false;
  const walk = (value, keys) => {
    if (isPlainObject(value) && Object.keys(value).length > 0) {
      for (const [key, child] of Object.entries(value)) walk(child, [...keys, key]);
      return;
    }
    if (keys.length === 0 || document.hasIn(keys)) return;
    document.setIn(keys, value);
    changed = true;
  };
  walk(defaults, []);
  // Hermes's skill discovery reads skills.external_dirs from the profile's own
  // config.yaml without the managed overlay, so the pinned value alone is not
  // enough for the bundle's skills to load. The directory is appended to the
  // profile's own list as well.
  for (const directory of extra.externalDirs ?? []) {
    const current = document.getIn(["skills", "external_dirs"]);
    const list = current?.toJSON?.() ?? current;
    if (Array.isArray(list)) {
      if (list.includes(directory)) continue;
      document.setIn(["skills", "external_dirs"], [...list, directory]);
    } else if (current === undefined || current === null) {
      document.setIn(["skills", "external_dirs"], [directory]);
    } else {
      continue;
    }
    changed = true;
  }
  for (const [name, definition] of Object.entries(extra.mcpServers ?? {})) {
    if (document.hasIn(["mcp_servers", name])) continue;
    document.setIn(["mcp_servers", name], definition);
    changed = true;
  }
  return changed ? String(document) : null;
}

/** The `source:` Hermes stamps into an installed distribution.yaml, or null. */
export function recordedSource(manifest) {
  try {
    const document = parseDocument(manifest ?? "");
    const value = document.get("source");
    return typeof value === "string" && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

function sameSource(recorded, source) {
  if (!recorded) return false;
  const normalize = (value) => {
    const resolved = path.resolve(value).replace(/[\\/]+$/, "");
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
  };
  return normalize(recorded) === normalize(source);
}

function findHermesBinary(home, explicit) {
  if (explicit) return explicit;
  const candidates = process.platform === "win32"
    ? [path.join(home, "hermes-agent", "venv", "Scripts", "hermes.exe")]
    : [path.join(home, "hermes-agent", "venv", "bin", "hermes")];
  return candidates;
}

/** Plan a sync. Fetches the bundle and its bots; writes nothing. */
export async function planHermesSync(options = {}) {
  const env = options.env ?? process.env;
  const baseUrl = resolveBaseUrl(options.url, env);
  const insecure = options.allowInsecureHttp === true;
  assertBundleUrl(baseUrl, insecure);
  if (!GUID.test(options.bundle ?? "")) throw new Error("Pass the bundle playbook GUID.");
  if (options.memory !== undefined && !GUID.test(options.memory)) throw new Error("--memory must be the GUID of a private memory playbook.");

  const fetchImpl = options.fetchImpl ?? fetch;
  const home = await hermesProfile({ env: options.hermesHome ? { ...env, HERMES_HOME: options.hermesHome } : env });
  const managedDir = path.resolve(options.managedDir ?? defaultManagedDir({ env }));
  const warnings = [];

  const bundle = await fetchPlaybook(baseUrl, options.bundle, { fetchImpl });
  const config = readBundleConfig(bundle);

  const skills = [];
  for (const skill of bundle.skills ?? []) {
    const entry = skillFiles(skill, warnings);
    if (entry) skills.push(entry);
  }

  const bots = [];
  for (const guid of config.bots) {
    const playbook = await fetchPlaybook(baseUrl, guid, { fetchImpl });
    const bot = botDistribution(playbook, warnings);
    if (bots.some((other) => other.profileName === bot.profileName)) {
      throw new Error(`Two bots map to the Hermes profile '${bot.profileName}'.`);
    }
    bots.push(bot);
  }

  // The managed layer. skills.external_dirs is appended to whatever the bundle
  // pins, and memory.provider is pinned when a personal memory is configured.
  const managed = structuredClone(config.managed);
  const skillsDir = path.join(managedDir, "skills");
  managed.skills = { ...(managed.skills ?? {}) };
  managed.skills.external_dirs = [...new Set([...(managed.skills.external_dirs ?? []), skillsDir])];
  if (options.memory) managed.memory = { ...(managed.memory ?? {}), provider: "agentplaybooks-memory" };
  const managedConfig = [
    `# Generated by \`apb hermes sync\` from ${baseUrl}/playbooks/${bundle.guid}`,
    "# (Hermes managed scope). Edit the bundle playbook, not this file: it is",
    "# replaced on every sync.",
    stringify(managed, { lineWidth: 0 }),
  ].join("\n");

  // The managed .env. A bundle is readable by everyone who can reach the
  // instance, so credentials never come from it: they come from --env-file (a
  // file operations protect, e.g. on a share) or, for the personal memory key,
  // from the environment once. Both are kept across syncs, so the scheduled
  // run does not need them again. Only keys the bundle itself used to set and
  // no longer does are dropped.
  const previousEnv = parseEnv(await readOptional(path.join(managedDir, ".env")));
  const previousState = JSON.parse(await readOptional(path.join(managedDir, STATE_FILE)) ?? "{}");
  const envValues = { ...previousEnv };
  for (const name of previousState.bundleEnv ?? []) {
    if (!(name in config.env)) delete envValues[name];
  }
  Object.assign(envValues, config.env);
  if (options.envFile) {
    const fileContent = await readOptional(path.resolve(options.envFile));
    if (fileContent === null) warnings.push(`--env-file ${options.envFile} is not readable; previously synced values are kept.`);
    else {
      const fileValues = parseEnv(fileContent);
      for (const name of Object.keys(fileValues)) {
        if (name in config.env) warnings.push(`--env-file sets ${name}, which the bundle also sets; the file wins.`);
      }
      Object.assign(envValues, fileValues);
    }
  }
  let memoryKeySource = null;
  if (options.memory) {
    if (env[MEMORY_KEY_ENV]) { envValues[MEMORY_KEY_ENV] = env[MEMORY_KEY_ENV]; memoryKeySource = "environment"; }
    else if (previousEnv[MEMORY_KEY_ENV]) { envValues[MEMORY_KEY_ENV] = previousEnv[MEMORY_KEY_ENV]; memoryKeySource = "kept"; }
    else warnings.push(`No ${MEMORY_KEY_ENV} in the environment or the managed .env: personal memory stays unavailable until it is set.`);
  }

  // Only the default profile and the bots this sync installs or updates are
  // touched; a same-named profile the user made by hand is left alone.
  const profiles = [{ name: "default", directory: home.directory }];
  const installs = [];
  for (const bot of bots) {
    const profileDir = path.join(home.directory, "profiles", bot.profileName);
    const source = path.join(managedDir, "bots", bot.profileName);
    const manifest = await readOptional(path.join(profileDir, "distribution.yaml"));
    // Hermes tombstones a deleted profile, and refuses to install that name
    // again. The user removed this bot on purpose, so the sync respects it.
    if (manifest === null && await exists(path.join(home.directory, "profiles", ".deleted", bot.profileName))) {
      warnings.push(`Bot '${bot.profileName}' was deleted on this machine; it is not reinstalled.`);
      continue;
    }
    if (manifest === null && await exists(profileDir)) {
      warnings.push(`Profile '${bot.profileName}' exists but was not installed from a distribution; it is left alone.`);
      continue;
    }
    // `profile update` re-pulls the source recorded at install time. A bot
    // first installed from somewhere else (an older package, say) is
    // reinstalled from the bundle instead; --force keeps its user data.
    let action = manifest === null ? "install" : "update";
    if (manifest !== null && !sameSource(recordedSource(manifest), source)) action = "reinstall";
    installs.push({ profileName: bot.profileName, source, action });
    profiles.push({ name: bot.profileName, directory: profileDir });
  }

  if (env.HERMES_MANAGED_DIR !== managedDir) {
    warnings.push(`HERMES_MANAGED_DIR is not set to ${managedDir} in this environment; Hermes reads the managed layer only when it is.`);
  }

  return {
    url: baseUrl,
    insecure,
    bundle: { guid: bundle.guid, name: bundle.name },
    hermesHome: home.directory,
    hermesBin: findHermesBinary(home.directory, options.hermesBin),
    managedDir,
    managedConfig,
    managedEnv: renderEnv(envValues),
    envNames: Object.keys(envValues).sort(),
    bundleEnv: Object.keys(config.env).sort(),
    memoryKeySource,
    skills,
    bots,
    installs,
    defaults: config.defaults,
    profiles,
    memory: options.memory ? { playbook: options.memory, shared: config.sharedMemory } : null,
    plugins: config.plugins.filter((plugin) => {
      // --memory installs and configures this one itself, from the copy that
      // matches this CLI; a catalog install next to it would conflict.
      if (plugin.name === "agentplaybooks-memory") {
        warnings.push("config.hermes.plugins lists agentplaybooks-memory; it is installed by --memory instead.");
        return false;
      }
      return true;
    }),
    warnings,
  };
}

/** Plan output that is safe to print: no file contents, no env values. */
export function publicSyncPlan(plan) {
  return {
    url: plan.url,
    bundle: plan.bundle,
    hermesHome: plan.hermesHome,
    managedDir: plan.managedDir,
    envNames: plan.envNames,
    memoryKeySource: plan.memoryKeySource,
    skills: plan.skills.map((skill) => skill.name),
    bots: plan.bots.map((bot) => ({ guid: bot.guid, name: bot.name, profile: bot.profileName, skills: bot.skills })),
    installs: plan.installs,
    plugins: (plan.plugins ?? []).map((plugin) => plugin.name),
    memory: plan.memory,
    warnings: plan.warnings,
  };
}

export function printHermesSyncPlan(plan, log = console.log) {
  log(`Hermes bundle '${plan.bundle.name}' (${plan.bundle.guid}) from ${plan.url}`);
  log(`  managed layer: ${plan.managedDir}`);
  log(`    config.yaml, .env (${plan.envNames.length ? plan.envNames.join(", ") : "no variables"})`);
  log(`    ${plan.skills.length} skill(s)${plan.skills.length ? `: ${plan.skills.map((skill) => skill.name).join(", ")}` : ""}`);
  for (const install of plan.installs) log(`  bot: ${install.action} profile '${install.profileName}'`);
  if (plan.plugins?.length) log(`  plugins (installed where missing): ${plan.plugins.map((plugin) => plugin.name).join(", ")}`);
  if (Object.keys(plan.defaults).length) log(`  defaults merged where unset into ${plan.profiles.length} profile(s)`);
  if (plan.memory) log(`  personal memory ${plan.memory.playbook}${plan.memory.shared.length ? `, shared: ${plan.memory.shared.join(", ")}` : ""}`);
  for (const warning of plan.warnings) log(`  ! ${warning}`);
}

async function writeAtomic(filename, content, mode) {
  await mkdir(path.dirname(filename), { recursive: true });
  const temporary = path.join(path.dirname(filename), `.${path.basename(filename)}.${process.pid}.tmp`);
  await writeFile(temporary, content, { encoding: "utf8", ...(mode ? { mode } : {}) });
  await rename(temporary, filename);
  if (mode) await chmod(filename, mode).catch(() => {});
}

/** Replace a directory with freshly written files, via a staging directory. */
async function replaceDirectory(directory, files) {
  const staging = `${directory}.staging-${process.pid}`;
  const previous = `${directory}.previous-${process.pid}`;
  await rm(staging, { recursive: true, force: true });
  for (const file of files) {
    const target = path.join(staging, ...file.path.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.content, "utf8");
  }
  await mkdir(staging, { recursive: true });
  const hadPrevious = await exists(directory);
  if (hadPrevious) await rename(directory, previous);
  try {
    await rename(staging, directory);
  } catch (error) {
    if (hadPrevious) await rename(previous, directory);
    throw error;
  }
  if (hadPrevious) await rm(previous, { recursive: true, force: true });
}

function defaultRunHermes(binary, args, { home }) {
  const candidates = Array.isArray(binary) ? binary : [binary];
  let lastError = null;
  for (const candidate of [...candidates, "hermes"]) {
    const result = spawnSync(candidate, args, {
      env: { ...process.env, HERMES_HOME: home },
      encoding: "utf8",
      timeout: 600000,
      windowsHide: true,
    });
    if (result.error?.code === "ENOENT") { lastError = result.error; continue; }
    return { status: result.status, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
  }
  throw new Error(`Hermes was not found (${lastError?.message ?? "no candidate"}). Pass --hermes-bin.`);
}

/**
 * Apply a sync plan: managed layer, bots, defaults, memory. Each bot is
 * installed or updated by Hermes itself. A failure is reported and the rest
 * continues, so one broken bot does not block the organisation's baseline.
 */
export async function applyHermesSync(plan, { runHermes = defaultRunHermes } = {}) {
  const written = [];
  const failures = [];

  await mkdir(plan.managedDir, { recursive: true });
  await writeAtomic(path.join(plan.managedDir, "config.yaml"), plan.managedConfig);
  await writeAtomic(path.join(plan.managedDir, ".env"), plan.managedEnv, 0o600);
  written.push("config.yaml", ".env");

  const skillFilesFlat = plan.skills.flatMap((skill) => skill.files.map((file) => ({
    path: `${skill.name}/${file.relativePath}`,
    content: file.content.endsWith("\n") ? file.content : `${file.content}\n`,
  })));
  await replaceDirectory(path.join(plan.managedDir, "skills"), skillFilesFlat);
  written.push(`skills/ (${plan.skills.length})`);

  for (const bot of plan.bots) {
    await replaceDirectory(path.join(plan.managedDir, "bots", bot.profileName), bot.files);
  }

  const installed = [];
  for (const install of plan.installs) {
    const args = install.action === "update"
      ? ["profile", "update", install.profileName, "-y"]
      : ["profile", "install", install.source, "--name", install.profileName,
        ...(install.action === "reinstall" ? ["--force"] : []), "-y"];
    const result = runHermes(plan.hermesBin, args, { home: plan.hermesHome });
    if (result.status === 0) installed.push(`${install.action} ${install.profileName}`);
    else failures.push(`hermes ${args.slice(0, 2).join(" ")} ${install.profileName} exited ${result.status}: ${result.output.trim().split("\n").slice(-3).join(" | ")}`);
  }

  // Bundle plugins, from the Hermes catalog (or a pinned Git source), into
  // every synced profile that does not have them yet. Updates are Hermes's
  // own business (`hermes plugins update`), so an installed plugin is left be.
  const plugins = [];
  for (const profile of plan.profiles) {
    if (!await exists(profile.directory)) continue;
    for (const plugin of plan.plugins ?? []) {
      if (await exists(path.join(profile.directory, "plugins", plugin.name))) continue;
      const args = [...(profile.name === "default" ? [] : ["-p", profile.name]),
        "plugins", "install", plugin.source, "--enable", ...(plugin.ref ? ["--ref", plugin.ref] : [])];
      const result = runHermes(plan.hermesBin, args, { home: plan.hermesHome });
      if (result.status === 0) plugins.push(`${profile.name}: ${plugin.name}`);
      else failures.push(`plugin ${plugin.name} in ${profile.name} exited ${result.status}: ${result.output.trim().split("\n").slice(-2).join(" | ")}`);
    }
  }

  // Defaults (and a bot's own MCP servers) go into each profile's config.yaml,
  // only where unset. Bot profiles are read after installation.
  for (const profile of plan.profiles) {
    if (profile.name !== "default" && !await exists(profile.directory)) continue;
    const bot = plan.bots.find((entry) => entry.profileName === profile.name);
    const configPath = path.join(profile.directory, "config.yaml");
    try {
      const merged = mergeDefaults(await readOptional(configPath), plan.defaults, {
        mcpServers: bot?.mcpServers,
        externalDirs: [path.join(plan.managedDir, "skills")],
      });
      if (merged !== null) {
        await writeAtomic(configPath, merged);
        written.push(`${profile.name}/config.yaml`);
      }
    } catch (error) {
      failures.push(`${profile.name}/config.yaml: ${error.message}`);
    }
  }

  const memory = [];
  if (plan.memory) {
    for (const profile of plan.profiles) {
      if (!await exists(profile.directory)) continue;
      try {
        const memoryPlan = await planHermesMemory({
          playbook: plan.memory.playbook,
          hermesHome: profile.directory,
          sharedPlaybooks: plan.memory.shared.join(","),
          url: plan.url,
          allowInsecureHttp: plan.insecure,
        });
        if (memoryPlan.conflicts.length) {
          failures.push(`${profile.name} memory: ${memoryPlan.conflicts.map((conflict) => conflict.reason).join("; ")}`);
          continue;
        }
        if (memoryPlan.fileActions.length) await applyHermesMemory(memoryPlan);
        memory.push(profile.name);
      } catch (error) {
        failures.push(`${profile.name} memory: ${error.message}`);
      }
    }
  }

  const state = {
    version: 1,
    url: plan.url,
    bundle: plan.bundle,
    syncedAt: new Date().toISOString(),
    digest: digest(plan.managedConfig),
    bundleEnv: plan.bundleEnv,
    skills: plan.skills.map((skill) => skill.name),
    bots: plan.bots.map((bot) => ({ guid: bot.guid, profile: bot.profileName })),
    failures,
  };
  await writeAtomic(path.join(plan.managedDir, STATE_FILE), `${JSON.stringify(state, null, 2)}\n`);

  return { written, installed, plugins, memory, failures };
}
