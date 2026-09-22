import { copyFile, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseAgentDefinition, portableAgentContent, SAFE_AGENT_NAME, serializeAgent } from "./agents.js";
import { normalizePath, normalizeText } from "./discovery.js";
import { runDoctor } from "./doctor.js";
import { credentialLines } from "./checks.js";
import { unsafeCredentialField } from "./snapshot.js";
import { applySync, planSync } from "./sync.js";

export const PLUGIN_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";
export const MCP_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json";
const PLUGIN_NAME = /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
const SECRET_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const REF_PATTERNS = [/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, /(?<![\w$])\$([A-Za-z_][A-Za-z0-9_]*)/g, /env:([A-Za-z_][A-Za-z0-9_]*)/g];

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function sameJson(left, right) {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

function groupBy(items, keyFor) {
  const groups = new Map();
  for (const item of items) {
    const key = keyFor(item);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return groups;
}

function slugify(value) {
  const result = String(value).toLowerCase().replace(/[^a-z0-9.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
  return PLUGIN_NAME.test(result) ? result : "agent-playbook";
}

async function readJsonIfExists(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw new Error(`Cannot read ${normalizePath(file)}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function readIfExists(file) {
  try {
    return await readFile(file);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function filesBelow(root) {
  const result = [];
  const queue = [root];
  while (queue.length > 0) {
    const current = queue.shift();
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) queue.push(absolute);
      else if (entry.isFile()) result.push(absolute);
    }
  }
  return result;
}

async function addAction(actions, conflicts, root, relative, content, from) {
  const absolutePath = path.join(root, ...relative.split("/"));
  const existing = await readIfExists(absolutePath);
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
  if (existing?.equals(buffer)) return;
  if (existing !== null) {
    conflicts.push({ kind: "file", name: relative, reason: "A different file already exists and was not overwritten.", sources: [from, relative].filter(Boolean) });
    return;
  }
  actions.push({ kind: "plugin-file", action: "create", path: relative, absolutePath, content: buffer, from });
}

function referencesIn(value) {
  const found = new Set();
  if (typeof value !== "string") return found;
  for (const pattern of REF_PATTERNS) {
    for (const match of value.matchAll(pattern)) {
      if (match[1] !== "PLUGIN_ROOT" && match[1] !== "PLUGIN_DATA") found.add(match[1]);
    }
  }
  return found;
}

function referencesBelow(value, found = new Set()) {
  if (typeof value === "string") for (const name of referencesIn(value)) found.add(name);
  else if (Array.isArray(value)) for (const item of value) referencesBelow(item, found);
  else if (value && typeof value === "object") for (const item of Object.values(value)) referencesBelow(item, found);
  return found;
}

function exportServer(server, bindings) {
  const definition = structuredClone(server.definition);
  const unsafe = unsafeCredentialField(definition);
  if (unsafe) return { error: `literal credential-like ${unsafe} value; use a reference` };
  const allowed = server.transport === "stdio"
    ? new Set(["command", "args", "env", "cwd"])
    : new Set(["url", "headers"]);
  const unsupported = Object.keys(definition).filter((key) => !allowed.has(key));
  if (unsupported.length > 0) return { error: `unsupported keys: ${unsupported.join(", ")}` };

  for (const field of ["env", "headers"]) {
    if (!definition[field] || typeof definition[field] !== "object" || Array.isArray(definition[field])) continue;
    for (const [key, template] of Object.entries(definition[field])) {
      const names = referencesIn(template);
      if (names.size === 0) continue;
      delete definition[field][key];
      for (const name of names) bindings.push({ name, server: server.name, path: [field, key], template });
    }
    if (Object.keys(definition[field]).length === 0) delete definition[field];
  }

  const unbound = referencesBelow(definition);
  if (unbound.size > 0) return { error: `secret references outside env/headers cannot be bound (${[...unbound].join(", ")})` };

  if (server.transport === "stdio") {
    if (typeof definition.command !== "string" || !definition.command) return { error: "stdio server has no command" };
    return { definition: { type: "stdio", ...definition } };
  }
  if (server.transport !== "http" && server.transport !== "sse") return { error: `unknown transport '${server.transport}'` };
  if (typeof definition.url !== "string" || !definition.url) return { error: "remote server has no URL" };
  return { definition: { type: server.transport === "sse" ? "sse" : "streamable-http", ...definition } };
}

function secretExtension(manifestSecrets, bindings) {
  const byName = new Map();
  for (const secret of manifestSecrets ?? []) {
    if (!SECRET_NAME.test(secret.name)) continue;
    byName.set(secret.name, { name: secret.name, ref: secret.ref, required: secret.required !== false, bindings: [] });
  }
  for (const binding of bindings) {
    const secret = byName.get(binding.name) ?? { name: binding.name, ref: `env:${binding.name}`, required: true, bindings: [] };
    secret.bindings.push({ server: binding.server, path: binding.path, template: binding.template });
    byName.set(binding.name, secret);
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function planPluginExport(root, { output } = {}) {
  const projectRoot = path.resolve(root);
  const outputRoot = path.resolve(output ?? path.join(projectRoot, ".agentplaybooks", "plugin"));
  const report = await runDoctor(projectRoot);
  const playbook = await readJsonIfExists(path.join(projectRoot, "agentplaybook.json"));
  const actions = [];
  const conflicts = [];

  const skillGroups = groupBy(report.inventory.skills, (item) => item.name);
  for (const [name, variants] of skillGroups) {
    if (!SAFE_AGENT_NAME.test(name)) {
      conflicts.push({ kind: "skill", name, reason: "Skill name is not a safe Agent Skills directory name.", sources: variants.map((item) => item.source) });
      continue;
    }
    if (new Set(variants.map((item) => item.treeDigest ?? item.digest)).size > 1) {
      conflicts.push({ kind: "skill", name, reason: "Skill definitions drift across platforms.", sources: variants.map((item) => item.source) });
      continue;
    }
    const sourceRoot = path.dirname(variants[0].absolutePath);
    const members = await filesBelow(sourceRoot);
    let unsafeResource = null;
    for (const file of members) {
      const content = await readFile(file);
      if (content.includes(0)) continue;
      try {
        if (credentialLines(new TextDecoder("utf-8", { fatal: true }).decode(content)).length > 0) {
          unsafeResource = normalizePath(path.relative(sourceRoot, file));
          break;
        }
      } catch (error) {
        if (!(error instanceof TypeError)) throw error;
      }
    }
    if (unsafeResource) {
      conflicts.push({ kind: "skill", name, reason: `Possible literal credential in ${unsafeResource}; export refused.`, sources: [variants[0].source] });
      continue;
    }
    for (const file of members) {
      const relative = normalizePath(path.relative(sourceRoot, file));
      await addAction(actions, conflicts, outputRoot, `skills/${name}/${relative}`, await readFile(file), variants[0].source);
    }
  }

  const agentGroups = groupBy(report.inventory.agents, (item) => item.name);
  for (const [name, variants] of agentGroups) {
    if (!SAFE_AGENT_NAME.test(name)) {
      conflicts.push({ kind: "agent", name, reason: "Agent name is not a safe portable file name.", sources: variants.map((item) => item.source) });
      continue;
    }
    if (new Set(variants.map((item) => item.digest)).size > 1) {
      conflicts.push({ kind: "agent", name, reason: "Custom agent definitions drift across platforms.", sources: variants.map((item) => item.source) });
      continue;
    }
    const canonical = variants.find((item) => item.platform === "portable") ?? variants[0];
    await addAction(actions, conflicts, outputRoot, `ai.agentplaybooks/agents/${name}.md`, portableAgentContent(canonical), canonical.source);
    await addAction(actions, conflicts, outputRoot, `com.github.copilot/agents/${name}.agent.md`, serializeAgent(canonical, "copilot"), canonical.source);
  }

  const mcpServers = {};
  const bindings = [];
  const mcpGroups = groupBy(report.inventory.mcpServers, (item) => item.name);
  const secretSources = new Set(report.findings.filter((item) => item.code === "secret.hardcoded").map((item) => item.source));
  for (const [name, variants] of mcpGroups) {
    if (variants.some((item) => secretSources.has(item.source))) {
      conflicts.push({ kind: "mcp", name, reason: "The source contains a possible literal credential; export was refused.", sources: variants.map((item) => item.source) });
      continue;
    }
    if (new Set(variants.map((item) => JSON.stringify(canonicalize(item.definition)))).size > 1) {
      conflicts.push({ kind: "mcp", name, reason: "MCP definitions drift across platforms.", sources: variants.map((item) => item.source) });
      continue;
    }
    const converted = exportServer(variants[0], bindings);
    if (converted.error) {
      conflicts.push({ kind: "mcp", name, reason: `Cannot represent this server in Agent Plugins 1.0: ${converted.error}.`, sources: variants.map((item) => item.source) });
      continue;
    }
    mcpServers[name] = converted.definition;
  }

  if (Object.keys(mcpServers).length > 0) {
    await addAction(actions, conflicts, outputRoot, "mcp.json", `${JSON.stringify({ $schema: MCP_SCHEMA, mcpServers }, null, 2)}\n`, "MCP inventory");
  }

  const secrets = secretExtension(playbook?.spec?.secrets, bindings);
  const plugin = {
    $schema: PLUGIN_SCHEMA,
    name: slugify(playbook?.metadata?.name ?? path.basename(projectRoot)),
    version: String(playbook?.metadata?.labels?.version ?? "1.0.0"),
    ...(playbook?.metadata?.description ? { description: playbook.metadata.description } : {}),
    ...(secrets.length > 0 ? { extensions: { "ai.agentplaybooks": { secrets } } } : {}),
  };
  await addAction(actions, conflicts, outputRoot, "plugin.json", `${JSON.stringify(plugin, null, 2)}\n`, "agentplaybook.json");
  actions.sort((a, b) => a.path.localeCompare(b.path));
  return { kind: "export", root: projectRoot, output: outputRoot, plugin, actions, conflicts };
}

function validatePluginManifest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("plugin.json must be a JSON object.");
  const allowed = new Set(["$schema", "name", "version", "description", "author", "homepage", "repository", "license", "keywords", "extensions"]);
  const extra = Object.keys(value).filter((key) => !allowed.has(key));
  if (extra.length) throw new Error(`plugin.json contains unsupported fields: ${extra.join(", ")}.`);
  if (value.$schema !== PLUGIN_SCHEMA) throw new Error(`plugin.json must target Agent Plugins 1.0 (${PLUGIN_SCHEMA}).`);
  if (typeof value.name !== "string" || value.name.length > 64 || !PLUGIN_NAME.test(value.name)) throw new Error("plugin.json has an invalid Agent Plugins name.");
  if (value.extensions !== undefined && (!value.extensions || typeof value.extensions !== "object" || Array.isArray(value.extensions))) throw new Error("plugin.json extensions must be an object.");
  for (const field of ["version", "description", "homepage", "repository", "license"]) {
    if (value[field] !== undefined && typeof value[field] !== "string") throw new Error(`plugin.json '${field}' must be a string.`);
  }
  if (value.keywords !== undefined && (!Array.isArray(value.keywords) || value.keywords.some((item) => typeof item !== "string"))) throw new Error("plugin.json keywords must be strings.");
  if (value.author !== undefined) {
    if (!value.author || typeof value.author !== "object" || Array.isArray(value.author)) throw new Error("plugin.json author must be an object.");
    if (Object.keys(value.author).some((key) => !["name", "email", "url"].includes(key)) || Object.values(value.author).some((item) => typeof item !== "string")) throw new Error("plugin.json author does not match the Agent Plugins schema.");
  }
  for (const extension of Object.values(value.extensions ?? {})) {
    if (!extension || typeof extension !== "object" || Array.isArray(extension)) throw new Error("Every plugin extension value must be an object.");
  }
  return value;
}

function assertStringMap(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.values(value).some((item) => typeof item !== "string")) {
    throw new Error(`${label} must map strings to strings.`);
  }
}

function validateMcpDocument(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("mcp.json must be a JSON object.");
  if (value.$schema !== MCP_SCHEMA) throw new Error(`mcp.json must target Agent Plugins 1.0 (${MCP_SCHEMA}).`);
  if (!value.mcpServers || typeof value.mcpServers !== "object" || Array.isArray(value.mcpServers)) throw new Error("mcp.json must contain mcpServers.");
  if (Object.keys(value).some((key) => key !== "$schema" && key !== "mcpServers")) throw new Error("mcp.json contains fields outside the Agent Plugins 1.0 schema.");
  for (const [name, server] of Object.entries(value.mcpServers)) {
    if (!server || typeof server !== "object" || Array.isArray(server)) throw new Error(`MCP server '${name}' must be an object.`);
    const stdio = server.type === "stdio";
    const remote = server.type === "streamable-http" || server.type === "sse";
    if (!stdio && !remote) throw new Error(`MCP server '${name}' has an unsupported type.`);
    const allowed = stdio ? new Set(["type", "command", "args", "env", "cwd"]) : new Set(["type", "url", "headers"]);
    if (Object.keys(server).some((key) => !allowed.has(key))) throw new Error(`MCP server '${name}' has fields outside its Agent Plugins schema.`);
    if (stdio && (typeof server.command !== "string" || !server.command)) throw new Error(`MCP server '${name}' has no command.`);
    if (remote && (typeof server.url !== "string" || !server.url)) throw new Error(`MCP server '${name}' has no URL.`);
    if (stdio && server.args !== undefined && (!Array.isArray(server.args) || server.args.some((item) => typeof item !== "string"))) throw new Error(`MCP server '${name}' args must be strings.`);
    if (stdio && server.env !== undefined) {
      assertStringMap(server.env, `MCP server '${name}' env`);
      if (server.env.PLUGIN_ROOT !== undefined || server.env.PLUGIN_DATA !== undefined) throw new Error(`MCP server '${name}' cannot override PLUGIN_ROOT or PLUGIN_DATA.`);
    }
    if (stdio && server.cwd !== undefined) {
      if (typeof server.cwd !== "string" || !/^(?:\.\/|\$\{PLUGIN_ROOT\}(?:\/|$)|\$\{PLUGIN_DATA\}(?:\/|$))/.test(server.cwd) || server.cwd.split("/").includes("..")) {
        throw new Error(`MCP server '${name}' cwd is not contained in the plugin or plugin data directory.`);
      }
    }
    if (remote) {
      if (server.headers !== undefined) assertStringMap(server.headers, `MCP server '${name}' headers`);
      let url;
      try {
        url = new URL(server.url);
      } catch {
        throw new Error(`MCP server '${name}' URL is invalid.`);
      }
      const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
      if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) throw new Error(`MCP server '${name}' must use HTTPS outside loopback.`);
    }
  }
  return value;
}

function importedSecrets(plugin) {
  const secrets = plugin.extensions?.["ai.agentplaybooks"]?.secrets ?? [];
  if (!Array.isArray(secrets)) throw new Error("ai.agentplaybooks.secrets must be an array.");
  for (const secret of secrets) {
    if (!secret || !SECRET_NAME.test(secret.name) || typeof secret.ref !== "string") throw new Error("AgentPlaybooks secret declarations need a valid name and ref.");
    if (!/^[a-z][a-z0-9+.-]*:[^\s]+$/i.test(secret.ref)) throw new Error(`Secret '${secret.name}' must use a named reference scheme such as env: or vault:.`);
    if (secret.bindings !== undefined && !Array.isArray(secret.bindings)) throw new Error(`Bindings for '${secret.name}' must be an array.`);
    for (const binding of secret.bindings ?? []) {
      if (typeof binding?.template !== "string" || !referencesIn(binding.template).has(secret.name)) {
        throw new Error(`Binding template for '${secret.name}' must contain a reference to that secret.`);
      }
    }
  }
  return secrets;
}

function setBinding(definitions, binding) {
  const server = definitions[binding.server];
  if (!server || !Array.isArray(binding.path) || binding.path.length !== 2 || !["env", "headers"].includes(binding.path[0])) {
    throw new Error(`Secret binding for '${binding.server}' has an invalid target path.`);
  }
  if (typeof binding.path[1] !== "string" || typeof binding.template !== "string") throw new Error(`Secret binding for '${binding.server}' is incomplete.`);
  server[binding.path[0]] ??= {};
  server[binding.path[0]][binding.path[1]] = binding.template;
}

function nativeServers(mcp, secrets) {
  const definitions = {};
  for (const [name, server] of Object.entries(mcp?.mcpServers ?? {})) {
    const { type, ...definition } = structuredClone(server);
    definitions[name] = definition;
  }
  for (const secret of secrets) for (const binding of secret.bindings ?? []) setBinding(definitions, binding);
  return definitions;
}

async function mergedPortableMcp(root, definitions, conflicts) {
  if (Object.keys(definitions).length === 0) return null;
  const relative = ".agents/mcp.json";
  const absolutePath = path.join(root, ".agents", "mcp.json");
  const current = await readJsonIfExists(absolutePath) ?? { mcpServers: {} };
  if (!current.mcpServers || typeof current.mcpServers !== "object" || Array.isArray(current.mcpServers)) throw new Error(`${relative} has no mcpServers object.`);
  const added = [];
  for (const [name, definition] of Object.entries(definitions)) {
    if (current.mcpServers[name] && !sameJson(current.mcpServers[name], definition)) {
      conflicts.push({ kind: "mcp", name, reason: "The portable store already has a different server definition.", sources: [relative, "mcp.json"] });
      continue;
    }
    if (!current.mcpServers[name]) {
      current.mcpServers[name] = definition;
      added.push(name);
    }
  }
  if (added.length === 0) return null;
  return { kind: "mcp-config", action: (await readIfExists(absolutePath)) === null ? "create" : "merge", path: relative, absolutePath, content: Buffer.from(`${JSON.stringify(current, null, 2)}\n`), servers: added };
}

export async function planPluginImport(pluginDirectory, root) {
  const pluginRoot = path.resolve(pluginDirectory);
  const projectRoot = path.resolve(root);
  const plugin = validatePluginManifest(await readJsonIfExists(path.join(pluginRoot, "plugin.json")));
  const mcpRaw = await readJsonIfExists(path.join(pluginRoot, "mcp.json"));
  const mcp = mcpRaw === null ? null : validateMcpDocument(mcpRaw);
  const secrets = importedSecrets(plugin);
  const actions = [];
  const conflicts = [];

  const skillsRoot = path.join(pluginRoot, "skills");
  const skillFiles = await filesBelow(skillsRoot);
  const relativeSkillFiles = skillFiles.map((file) => normalizePath(path.relative(skillsRoot, file)));
  for (const directory of new Set(relativeSkillFiles.map((relative) => relative.split("/")[0]))) {
    if (!relativeSkillFiles.includes(`${directory}/SKILL.md`)) throw new Error(`Plugin skill '${directory}' has no SKILL.md.`);
  }
  const pluginReport = await runDoctor(pluginRoot);
  const invalidSkill = pluginReport.findings.find((item) => item.severity === "high" && item.code.startsWith("skill."));
  if (invalidSkill) throw new Error(`Plugin skill is invalid (${invalidSkill.code} at ${invalidSkill.source}).`);
  for (const file of skillFiles) {
    const relative = normalizePath(path.relative(skillsRoot, file));
    const [skillName] = relative.split("/");
    await addAction(actions, conflicts, projectRoot, `.agents/skills/${skillName}/${relative.split("/").slice(1).join("/")}`, await readFile(file), `skills/${relative}`);
  }

  const canonicalAgentRoot = path.join(pluginRoot, "ai.agentplaybooks", "agents");
  const canonicalFiles = (await filesBelow(canonicalAgentRoot)).filter((file) => file.toLowerCase().endsWith(".md"));
  const agentRoot = canonicalFiles.length > 0 ? canonicalAgentRoot : path.join(pluginRoot, "com.github.copilot", "agents");
  for (const file of (canonicalFiles.length > 0 ? canonicalFiles : await filesBelow(agentRoot)).filter((item) => item.toLowerCase().endsWith(".md"))) {
    const filename = path.basename(file);
    const name = filename.toLowerCase().endsWith(".agent.md") ? filename.slice(0, -".agent.md".length) : path.basename(filename, ".md");
    const source = normalizeText(await readFile(file, "utf8"));
    const parsed = parseAgentDefinition({ source: `.agents/agents/${name}.md`, platform: "portable", content: source, absolutePath: file, digest: "" });
    if (!parsed.valid || !SAFE_AGENT_NAME.test(parsed.name) || !parsed.description || !parsed.prompt.trim()) {
      conflicts.push({ kind: "agent", name, reason: "Plugin custom agent is invalid and was not imported.", sources: [normalizePath(path.relative(pluginRoot, file))] });
      continue;
    }
    await addAction(actions, conflicts, projectRoot, `.agents/agents/${parsed.name}.md`, portableAgentContent(parsed), normalizePath(path.relative(pluginRoot, file)));
  }

  const mcpAction = await mergedPortableMcp(projectRoot, nativeServers(mcp, secrets), conflicts);
  if (mcpAction) actions.push(mcpAction);
  actions.sort((a, b) => a.path.localeCompare(b.path));
  return { kind: "import", root: projectRoot, pluginRoot, plugin, secrets, actions, conflicts, refreshManifest: true };
}

async function atomicWrite(action) {
  await mkdir(path.dirname(action.absolutePath), { recursive: true });
  const temp = path.join(path.dirname(action.absolutePath), `.${path.basename(action.absolutePath)}.${process.pid}.tmp`);
  await writeFile(temp, action.content, { mode: 0o600 });
  await rename(temp, action.absolutePath);
}

export async function applyPluginPlan(plan) {
  if (plan.kind === "export" && plan.conflicts.length > 0) {
    throw new Error("Refusing an incomplete Agent Plugins export: resolve plan conflicts first.");
  }
  const written = [];
  const backups = [];
  const backupRoot = path.join(plan.root, ".agentplaybooks", "backups", new Date().toISOString().replace(/[:.]/g, "-"));
  for (const action of plan.actions) {
    if (plan.kind === "import" && action.action === "merge") {
      const backup = path.join(backupRoot, action.path.split("/").join("__"));
      await mkdir(path.dirname(backup), { recursive: true, mode: 0o700 });
      await copyFile(action.absolutePath, backup);
      backups.push(backup);
    }
    await atomicWrite(action);
    written.push(action.path);
  }
  if (plan.kind === "import") {
    const syncPlan = await planSync(plan.root);
    const merged = new Map(syncPlan.manifest.spec.secrets.map((secret) => [secret.name, secret]));
    for (const secret of plan.secrets) merged.set(secret.name, { name: secret.name, ref: secret.ref, required: secret.required !== false });
    syncPlan.manifest.spec.secrets = [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
    syncPlan.fileActions = [];
    const comparable = (value) => {
      if (!value) return value;
      const copy = structuredClone(value);
      delete copy.metadata?.generatedAt;
      return copy;
    };
    syncPlan.manifestChanged = !syncPlan.existing || !sameJson(comparable(syncPlan.existing), comparable(syncPlan.manifest));
    syncPlan.changed = syncPlan.manifestChanged;
    const result = await applySync(syncPlan);
    if (result.applied) {
      written.push("agentplaybook.json");
      if (result.backupPath) backups.push(result.backupPath);
    }
  }
  return { applied: written.length > 0, written, backups };
}

export function publicPluginPlan(plan) {
  return {
    kind: plan.kind,
    root: plan.root,
    ...(plan.output ? { output: plan.output } : { pluginRoot: plan.pluginRoot }),
    plugin: { name: plan.plugin.name, version: plan.plugin.version ?? null },
    actions: plan.actions.map(({ content, absolutePath, ...action }) => action),
    conflicts: plan.conflicts,
    ...(plan.kind === "import" ? { refreshManifest: true, secrets: plan.secrets.map(({ bindings, ...secret }) => ({ ...secret, bindingCount: bindings?.length ?? 0 })) } : {}),
  };
}

export function printPluginPlan(plan) {
  console.log(`Agent Plugins ${plan.kind} plan for '${plan.plugin.name}':`);
  if (plan.kind === "export") console.log(`  output: ${plan.output}`);
  else console.log(`  source: ${plan.pluginRoot}`);
  for (const action of plan.actions) console.log(`  ${action.action} ${action.path}`);
  if (plan.kind === "import") console.log("  refresh agentplaybook.json (secret references only; never values)");
  for (const item of plan.conflicts) console.log(`  [conflict] ${item.kind} '${item.name}': ${item.reason}`);
  if (plan.actions.length === 0 && plan.conflicts.length === 0) console.log("  already in sync");
  console.log("No files have been changed. Run again with --apply to write these changes.");
}
