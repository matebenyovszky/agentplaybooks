import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runDoctor, runGlobalDoctor } from "./doctor.js";
import { normalizeText } from "./discovery.js";
import { createManifest, comparableManifest } from "./manifest.js";
import { canonicalJson } from "./adapters.js";
import { isMap, parseDocument, stringify } from "yaml";

export const DEFAULT_BASE_URL = "https://agentplaybooks.ai";
const LINK_FILE = [".agentplaybooks", "remote.json"];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_SKILL_NAME = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

export function resolveBaseUrl(flagUrl, env = process.env) {
  const url = flagUrl || env.AGENTPLAYBOOKS_URL || DEFAULT_BASE_URL;
  return url.replace(/\/+$/, "");
}

function credentialsPath(homedir = os.homedir()) {
  return path.join(homedir, ".agentplaybooks", "credentials.json");
}

export async function loadCredentials(homedir) {
  try {
    return JSON.parse(await readFile(credentialsPath(homedir), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return { version: 1, remotes: {} };
    throw new Error(`Cannot read stored credentials: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function writePrivateJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const tempPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`);
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(tempPath, filePath);
  await chmod(filePath, 0o600).catch(() => {});
}

export async function saveCredentials(credentials, homedir) {
  await writePrivateJson(credentialsPath(homedir), credentials);
}

export async function saveApiKey(url, apiKey, homedir) {
  const credentials = await loadCredentials(homedir);
  // Preserve any playbook-scoped keys stored for this remote.
  credentials.remotes[url] = { ...(credentials.remotes[url] ?? {}), apiKey };
  await writePrivateJson(credentialsPath(homedir), credentials);
}

export async function removeApiKey(url, homedir) {
  const credentials = await loadCredentials(homedir);
  if (!credentials.remotes[url]) return false;
  delete credentials.remotes[url];
  await writePrivateJson(credentialsPath(homedir), credentials);
  return true;
}

export async function resolveApiKey(url, { env = process.env, homedir } = {}) {
  if (env.AGENTPLAYBOOKS_API_KEY) return env.AGENTPLAYBOOKS_API_KEY;
  const credentials = await loadCredentials(homedir);
  return credentials.remotes[url]?.apiKey ?? null;
}

export async function request(url, requestPath, { method = "GET", apiKey, body, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(`${url}${requestPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // Non-JSON error bodies fall through to the status check below.
  }
  if (!response.ok) {
    const message = payload?.error || `HTTP ${response.status}`;
    throw new Error(`${method} ${requestPath} failed: ${message}`);
  }
  return payload;
}

export async function verifyApiKey(url, apiKey, { fetchImpl } = {}) {
  await request(url, "/api/manage/playbooks", { apiKey, fetchImpl });
}

export async function listPlaybooks(url, apiKey, { fetchImpl } = {}) {
  return await request(url, "/api/manage/playbooks", { apiKey, fetchImpl }) ?? [];
}

async function getPlaybook(url, apiKey, id, { fetchImpl } = {}) {
  return request(url, `/api/manage/playbooks/${id}`, { apiKey, fetchImpl });
}

async function resolvePlaybook(url, apiKey, ref, { fetchImpl } = {}) {
  if (UUID_PATTERN.test(ref)) return getPlaybook(url, apiKey, ref, { fetchImpl });
  const playbooks = await listPlaybooks(url, apiKey, { fetchImpl });
  const match = playbooks.find((playbook) => playbook.guid === ref);
  if (!match) throw new Error(`No accessible playbook with GUID '${ref}'. Run 'agentplaybooks playbooks' to list yours.`);
  return getPlaybook(url, apiKey, match.id, { fetchImpl });
}

function linkPath(root) {
  return path.join(root, ...LINK_FILE);
}

export async function readLink(root) {
  try {
    return JSON.parse(await readFile(linkPath(root), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw new Error(`Cannot read ${LINK_FILE.join("/")}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function writeLink(root, link) {
  await writePrivateJson(linkPath(root), link);
}

function skillFileContent(skill) {
  const content = normalizeText(skill.content ?? "");
  const match = content.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  let body = content;
  let frontmatter = {};
  if (match) {
    const document = parseDocument(match[1], { strict: true, uniqueKeys: true });
    if (document.errors.length === 0 && isMap(document.contents)) {
      frontmatter = document.toJS();
      body = content.slice(match[0].length);
    }
  }

  const remoteDescription = typeof skill.description === "string" ? skill.description.trim() : "";
  const existingDescription = typeof frontmatter.description === "string" ? frontmatter.description.trim() : "";
  const description = (remoteDescription || existingDescription).replace(/\r?\n/g, " ");
  if (!description) return null;

  const frontmatterAlreadyMatches = match
    && frontmatter.name === skill.name
    && existingDescription === description
    && (!skill.licence || frontmatter.license === skill.licence);
  if (frontmatterAlreadyMatches) return content.endsWith("\n") ? content : `${content}\n`;

  const normalizedFrontmatter = {
    ...frontmatter,
    name: skill.name,
    description,
    ...(skill.licence && frontmatter.license === undefined ? { license: skill.licence } : {}),
  };
  delete normalizedFrontmatter.licence;
  const yaml = stringify(normalizedFrontmatter, { lineWidth: 0 }).trimEnd();
  return `---\n${yaml}\n---\n\n${body}${body.endsWith("\n") ? "" : "\n"}`;
}

async function readLocalFile(root, relativePath) {
  try {
    return normalizeText(await readFile(path.join(root, ...relativePath.split("/")), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

// --- MCP server mapping -----------------------------------------------------
//
// A hosted playbook stores an MCP server as `transport_type` plus a
// `transport_config` that can also carry platform-only federation settings
// (timeout_ms, access, auth, allow_insecure_http, openapi). A local client
// config only expresses the connection itself. These are the keys that travel
// in both directions; everything else on the remote is the platform's business
// and must survive a push untouched.
const LOCAL_TRANSPORT_KEYS = ["command", "args", "env", "url", "headers"];
const PORTABLE_MCP_PATH = ".agents/mcp.json";

// Which project-root instruction file represents the playbook when several
// exist. `AGENTS.md` is the cross-vendor standard, so it wins; the rest are
// platform-specific spellings of the same thing. `AGENTS.override.md` is
// deliberately absent: an override is a local decision, not shared state.
const INSTRUCTION_PRECEDENCE = [
  "AGENTS.md",
  "CLAUDE.md",
  "GEMINI.md",
  "copilot-instructions.md",
  ".cursorrules",
];
const PORTABLE_INSTRUCTIONS_PATH = "AGENTS.md";

// The persona is who the agent is, so it belongs to no single instruction file:
// `sync` hands it to the targets that have a place for an identity (Hermes reads
// it as SOUL.md). `push` never sends it back — the hosted playbook owns it.
const PORTABLE_PERSONA_PATH = ".agents/persona.md";
// What the API answers with for a playbook that has never set a persona. Writing
// it out would put a stock sentence in front of every agent's identity.
const DEFAULT_PERSONA_PROMPT = "You are a helpful AI assistant.";

function localMcpDefinition(server) {
  const config = server.transport_config ?? {};
  if (server.transport_type === "stdio") {
    if (typeof config.command !== "string") return null;
    return {
      command: config.command,
      ...(Array.isArray(config.args) ? { args: config.args } : {}),
      ...(config.env && typeof config.env === "object" ? { env: config.env } : {}),
    };
  }
  if (server.transport_type === "http" || server.transport_type === "sse") {
    if (typeof config.url !== "string") return null;
    return {
      url: config.url,
      ...(config.headers && typeof config.headers === "object" ? { headers: config.headers } : {}),
    };
  }
  // `openapi` servers are a hosted federation feature with no local client
  // equivalent, so they are reported rather than half-translated.
  return null;
}

function remoteTransportFor(definition) {
  if (typeof definition?.command === "string") {
    return {
      transport_type: "stdio",
      transport_config: {
        command: definition.command,
        ...(definition.args !== undefined ? { args: definition.args } : {}),
        ...(definition.env !== undefined ? { env: definition.env } : {}),
      },
    };
  }
  if (typeof definition?.url === "string") {
    return {
      transport_type: definition.url.includes("/sse") ? "sse" : "http",
      transport_config: {
        url: definition.url,
        ...(definition.headers !== undefined ? { headers: definition.headers } : {}),
      },
    };
  }
  return null;
}

function mcpDocument(existingContent, additions) {
  let document = { mcpServers: {} };
  if (existingContent !== null) {
    document = JSON.parse(existingContent);
    if (!document.mcpServers || typeof document.mcpServers !== "object" || Array.isArray(document.mcpServers)) {
      document.mcpServers = {};
    }
  }
  for (const [name, definition] of Object.entries(additions)) {
    document.mcpServers[name] = definition;
  }
  return `${JSON.stringify(document, null, 2)}\n`;
}

/**
 * Plan pulling a remote playbook's skills and MCP servers into the portable
 * local store (.agents/). Existing entries with different content become
 * conflicts; nothing is overwritten. A follow-up `sync --apply` fans the
 * portable store out to each enabled platform target.
 */
export async function planPull(root, ref, { url, apiKey, fetchImpl } = {}) {
  const playbook = await resolvePlaybook(url, apiKey, ref, { fetchImpl });
  const actions = [];
  const conflicts = [];

  for (const skill of playbook.skills ?? []) {
    if (typeof skill.name !== "string" || !SAFE_SKILL_NAME.test(skill.name)) {
      conflicts.push({ kind: "skill", name: String(skill.name), reason: "Remote skill name is not a safe lowercase kebab-case directory name." });
      continue;
    }
    const relativePath = `.agents/skills/${skill.name}/SKILL.md`;
    const content = skillFileContent(skill);
    if (content === null) {
      conflicts.push({ kind: "skill", name: skill.name, reason: "Remote skill has no Agent Skills-compatible description." });
      continue;
    }
    const existing = await readLocalFile(root, relativePath);
    if (existing === null) {
      actions.push({ kind: "skill", name: skill.name, action: "create", path: relativePath, content });
    } else if (existing !== content) {
      conflicts.push({ kind: "skill", name: skill.name, reason: `Local ${relativePath} differs from the remote skill.` });
    }
  }

  const remoteInstructions = typeof playbook.instructions === "string" ? normalizeText(playbook.instructions) : "";
  if (remoteInstructions.trim().length > 0) {
    const content = remoteInstructions.endsWith("\n") ? remoteInstructions : `${remoteInstructions}\n`;
    const existing = await readLocalFile(root, PORTABLE_INSTRUCTIONS_PATH);
    if (existing === null) {
      actions.push({ kind: "instructions", name: PORTABLE_INSTRUCTIONS_PATH, action: "create", path: PORTABLE_INSTRUCTIONS_PATH, content });
    } else if (existing !== content) {
      conflicts.push({ kind: "instructions", name: PORTABLE_INSTRUCTIONS_PATH, reason: `Local ${PORTABLE_INSTRUCTIONS_PATH} differs from the playbook's instructions.` });
    }
  }

  const personaPrompt = typeof playbook.persona?.system_prompt === "string"
    ? normalizeText(playbook.persona.system_prompt).trim()
    : "";
  if (personaPrompt.length > 0 && personaPrompt !== DEFAULT_PERSONA_PROMPT) {
    const content = `${personaPrompt}\n`;
    const existing = await readLocalFile(root, PORTABLE_PERSONA_PATH);
    if (existing === null) {
      actions.push({ kind: "persona", name: PORTABLE_PERSONA_PATH, action: "create", path: PORTABLE_PERSONA_PATH, content });
    } else if (existing !== content) {
      conflicts.push({ kind: "persona", name: PORTABLE_PERSONA_PATH, reason: `Local ${PORTABLE_PERSONA_PATH} differs from the playbook's persona.` });
    }
  }

  const portableContent = await readLocalFile(root, PORTABLE_MCP_PATH);
  let portableServers = {};
  let portableReadable = true;
  if (portableContent !== null) {
    try {
      const parsed = JSON.parse(portableContent);
      portableServers = parsed?.mcpServers && typeof parsed.mcpServers === "object" && !Array.isArray(parsed.mcpServers)
        ? parsed.mcpServers
        : {};
    } catch {
      portableReadable = false;
      conflicts.push({ kind: "mcp", name: PORTABLE_MCP_PATH, reason: `Local ${PORTABLE_MCP_PATH} is not valid JSON.` });
    }
  }

  const mcpAdditions = {};
  for (const server of playbook.mcp_servers ?? []) {
    if (typeof server.name !== "string" || server.name.length === 0) continue;
    const definition = localMcpDefinition(server);
    if (definition === null) {
      conflicts.push({
        kind: "mcp",
        name: String(server.name),
        reason: server.transport_type === "openapi"
          ? "Remote server is an OpenAPI federation server, which has no local client equivalent."
          : "Remote server has no usable command or URL in its transport configuration.",
      });
      continue;
    }
    if (!portableReadable) continue;
    const existing = portableServers[server.name];
    if (existing === undefined) {
      mcpAdditions[server.name] = definition;
    } else if (canonicalJson(existing) !== canonicalJson(definition)) {
      conflicts.push({ kind: "mcp", name: server.name, reason: `Local ${PORTABLE_MCP_PATH} defines '${server.name}' differently.` });
    }
  }

  if (Object.keys(mcpAdditions).length > 0) {
    actions.push({
      kind: "mcp-config",
      name: PORTABLE_MCP_PATH,
      action: portableContent === null ? "create" : "merge",
      path: PORTABLE_MCP_PATH,
      servers: Object.keys(mcpAdditions).sort(),
      content: mcpDocument(portableContent, mcpAdditions),
    });
  }

  return {
    playbook: { id: playbook.id, guid: playbook.guid, name: playbook.name },
    url,
    actions,
    conflicts,
  };
}

export async function applyPull(root, plan) {
  for (const action of plan.actions) {
    const absolutePath = path.join(root, ...action.path.split("/"));
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, action.content, "utf8");
  }
  await writeLink(root, {
    url: plan.url,
    playbookId: plan.playbook.id,
    guid: plan.playbook.guid,
    name: plan.playbook.name,
    lastSyncedAt: new Date().toISOString(),
  });
  return { written: plan.actions.map((action) => action.path) };
}

function localSkillsForPush(report, conflicts) {
  const groups = new Map();
  for (const skill of report.inventory.skills) {
    const group = groups.get(skill.name) ?? [];
    group.push(skill);
    groups.set(skill.name, group);
  }
  const skills = [];
  for (const [name, variants] of groups) {
    if (!SAFE_SKILL_NAME.test(name)) {
      conflicts.push({ kind: "skill", name, reason: "Skill name is not a safe lowercase kebab-case name; skipped." });
      continue;
    }
    if (new Set(variants.map((item) => item.digest)).size > 1) {
      conflicts.push({ kind: "skill", name, reason: "Skill definitions differ across platforms; resolve the drift before pushing." });
      continue;
    }
    skills.push({ name, description: variants[0].description ?? "", content: variants[0].content, source: variants[0].source });
  }
  return skills;
}

/**
 * The project-root instruction file that represents this playbook. Nested
 * instruction files scope a subdirectory rather than the project, so they stay
 * local. Root files that disagree with each other are a conflict: picking one
 * would quietly publish a stale copy.
 */
function localInstructionsForPush(report, conflicts) {
  const candidates = report.inventory.instructions.filter((item) => !item.source.includes("/")
    && INSTRUCTION_PRECEDENCE.includes(item.source));
  if (candidates.length === 0) return null;

  if (new Set(candidates.map((item) => item.digest)).size > 1) {
    conflicts.push({
      kind: "instructions",
      name: candidates.map((item) => item.source).sort().join(", "),
      reason: "Project-root instruction files differ from each other; align them before pushing.",
    });
    return null;
  }

  const ordered = [...candidates].sort(
    (a, b) => INSTRUCTION_PRECEDENCE.indexOf(a.source) - INSTRUCTION_PRECEDENCE.indexOf(b.source),
  );
  return { source: ordered[0].source, content: ordered[0].content };
}

function localMcpServersForPush(report, conflicts) {
  const groups = new Map();
  for (const server of report.inventory.mcpServers) {
    const group = groups.get(server.name) ?? [];
    group.push(server);
    groups.set(server.name, group);
  }
  const servers = [];
  for (const [name, variants] of groups) {
    if (new Set(variants.map((item) => canonicalJson(item.definition))).size > 1) {
      conflicts.push({ kind: "mcp", name, reason: "MCP server definitions differ across platforms; resolve the drift before pushing." });
      continue;
    }
    const transport = remoteTransportFor(variants[0].definition);
    if (transport === null) {
      conflicts.push({ kind: "mcp", name, reason: "MCP server has neither a command nor a URL; skipped." });
      continue;
    }
    servers.push({ name, ...transport, sources: variants.map((item) => item.source) });
  }
  return servers;
}

/**
 * The remote may hold federation settings a local config cannot express
 * (timeouts, auth, access). Local files are authoritative for the connection
 * keys only; anything else on the remote is preserved.
 */
function mergedTransportConfig(remoteConfig, localConfig) {
  const preserved = Object.fromEntries(
    Object.entries(remoteConfig ?? {}).filter(([key]) => !LOCAL_TRANSPORT_KEYS.includes(key)),
  );
  return { ...preserved, ...localConfig };
}

function remoteMatchesLocal(remoteServer, localServer) {
  if (remoteServer.transport_type !== localServer.transport_type) return false;
  const projection = Object.fromEntries(
    Object.entries(remoteServer.transport_config ?? {}).filter(([key]) => LOCAL_TRANSPORT_KEYS.includes(key)),
  );
  return canonicalJson(projection) === canonicalJson(localServer.transport_config);
}

/**
 * Plan pushing the local playbook to the remote. Refuses to plan when doctor
 * finds likely hard-coded credentials in the content that would be uploaded.
 */
export async function planPush(root, options = {}) {
  return planPushFrom(await runDoctor(root), root, options);
}

/**
 * Push what this machine has, rather than what one project has: the skills in
 * `~/.cursor/skills`, `~/.claude/skills`, and the Hermes profile become one
 * hosted playbook, which is what provisioning the next machine reads.
 *
 * MCP servers stay out, for the same reason global sync leaves them alone: a
 * home-scoped MCP config is where an auth header lives, and a playbook is a
 * thing you share. Skills travel; connection secrets do not.
 */
export async function planGlobalPush(options = {}) {
  const homedir = options.homedir ?? os.homedir();
  const report = await runGlobalDoctor(options);
  return planPushFrom(report, homedir, {
    ...options,
    scope: "global",
    displayName: `${os.hostname()} workstation`,
  });
}

async function planPushFrom(report, root, { url, apiKey, fetchImpl, scope = "project", displayName } = {}) {
  const conflicts = [];
  const skills = localSkillsForPush(report, conflicts);
  const mcpServers = scope === "global" ? [] : localMcpServersForPush(report, conflicts);
  const instructions = localInstructionsForPush(report, conflicts);

  const uploadedSources = new Set([
    ...skills.map((skill) => skill.source),
    ...mcpServers.flatMap((server) => server.sources),
    ...(instructions ? [instructions.source] : []),
  ]);
  const leaking = report.findings.filter((item) => item.code === "secret.hardcoded"
    && uploadedSources.has(item.source));
  if (leaking.length > 0) {
    const sources = [...new Set(leaking.map((item) => item.source))].join(", ");
    throw new Error(`Refusing to push: possible hard-coded credentials in ${sources}. Move secrets to environment references first.`);
  }

  const manifest = comparableManifest(createManifest(report, { displayName }));
  const link = await readLink(root);
  let remote = null;
  if (link?.playbookId && link.url === url) {
    remote = await getPlaybook(url, apiKey, link.playbookId, { fetchImpl });
  }

  const actions = [];
  if (!remote) {
    actions.push({ kind: "playbook", action: "create", name: manifest.metadata.displayName || manifest.metadata.name });
    if (instructions) {
      actions.push({ kind: "instructions", action: "create", name: instructions.source });
    }
    for (const skill of skills) {
      actions.push({ kind: "skill", action: "create", name: skill.name });
    }
    for (const server of mcpServers) {
      actions.push({ kind: "mcp", action: "create", name: server.name });
    }
  } else {
    if (canonicalJson(remote.config?.agentplaybook ?? null) !== canonicalJson(manifest)) {
      actions.push({ kind: "playbook", action: "update-config", name: remote.name });
    }
    // Absent local instructions leave the remote alone, the same way a missing
    // skill is never treated as a deletion.
    if (instructions && normalizeText(remote.instructions ?? "") !== instructions.content) {
      actions.push({ kind: "instructions", action: remote.instructions ? "update" : "create", name: instructions.source });
    }
    const remoteSkills = new Map((remote.skills ?? []).map((skill) => [skill.name, skill]));
    for (const skill of skills) {
      const existing = remoteSkills.get(skill.name);
      if (!existing) {
        actions.push({ kind: "skill", action: "create", name: skill.name });
      } else if (normalizeText(existing.content ?? "") !== skill.content || (existing.description ?? "") !== skill.description) {
        actions.push({ kind: "skill", action: "update", name: skill.name, skillId: existing.id });
      }
    }
    const remoteMcp = new Map((remote.mcp_servers ?? []).map((server) => [server.name, server]));
    for (const server of mcpServers) {
      const existing = remoteMcp.get(server.name);
      if (!existing) {
        actions.push({ kind: "mcp", action: "create", name: server.name });
      } else if (!remoteMatchesLocal(existing, server)) {
        actions.push({
          kind: "mcp",
          action: "update",
          name: server.name,
          mcpServerId: existing.id,
          transport_config: mergedTransportConfig(existing.transport_config, server.transport_config),
        });
      }
    }
  }

  return {
    url,
    manifest,
    skills,
    mcpServers,
    instructions,
    remote: remote ? { id: remote.id, guid: remote.guid, name: remote.name } : null,
    actions,
    conflicts,
    scope,
    root,
  };
}

export async function applyPush(root, plan, { apiKey, fetchImpl } = {}) {
  const { url } = plan;
  let playbookId = plan.remote?.id ?? null;
  let guid = plan.remote?.guid ?? null;
  let name = plan.remote?.name ?? null;

  const instructionsAction = plan.actions.find((action) => action.kind === "instructions");
  const createAction = plan.actions.find((action) => action.kind === "playbook" && action.action === "create");
  if (createAction) {
    const created = await request(url, "/api/manage/playbooks", {
      method: "POST",
      apiKey,
      fetchImpl,
      body: {
        name: createAction.name,
        config: { agentplaybook: plan.manifest },
        ...(instructionsAction ? { instructions: plan.instructions.content } : {}),
      },
    });
    playbookId = created.id;
    guid = created.guid;
    name = created.name;
  } else {
    // Config and instructions are separate columns but one resource, so a
    // single request carries whichever of them changed.
    const update = {};
    if (plan.actions.some((action) => action.kind === "playbook" && action.action === "update-config")) {
      update.config = { agentplaybook: plan.manifest };
    }
    if (instructionsAction) update.instructions = plan.instructions.content;
    if (Object.keys(update).length > 0) {
      await request(url, `/api/manage/playbooks/${playbookId}`, {
        method: "PUT",
        apiKey,
        fetchImpl,
        body: update,
      });
    }
  }

  const skillByName = new Map(plan.skills.map((skill) => [skill.name, skill]));
  for (const action of plan.actions) {
    if (action.kind !== "skill") continue;
    const skill = skillByName.get(action.name);
    if (action.action === "create") {
      await request(url, `/api/manage/playbooks/${playbookId}/skills`, {
        method: "POST",
        apiKey,
        fetchImpl,
        body: { name: skill.name, description: skill.description, content: skill.content },
      });
    } else {
      await request(url, `/api/manage/playbooks/${playbookId}/skills/${action.skillId}`, {
        method: "PUT",
        apiKey,
        fetchImpl,
        body: { name: skill.name, description: skill.description, content: skill.content },
      });
    }
  }

  const serverByName = new Map((plan.mcpServers ?? []).map((server) => [server.name, server]));
  for (const action of plan.actions) {
    if (action.kind !== "mcp") continue;
    const server = serverByName.get(action.name);
    if (action.action === "create") {
      await request(url, `/api/manage/playbooks/${playbookId}/mcp-servers`, {
        method: "POST",
        apiKey,
        fetchImpl,
        body: {
          name: server.name,
          transport_type: server.transport_type,
          transport_config: server.transport_config,
        },
      });
    } else {
      // Tools, resources, and description stay out of the body so the hosted
      // playbook keeps whatever it has curated for them.
      await request(url, `/api/manage/playbooks/${playbookId}/mcp-servers/${action.mcpServerId}`, {
        method: "PUT",
        apiKey,
        fetchImpl,
        body: {
          transport_type: server.transport_type,
          transport_config: action.transport_config,
        },
      });
    }
  }

  await writeLink(root, { url, playbookId, guid, name, lastSyncedAt: new Date().toISOString() });
  return { playbookId, guid, name };
}

/**
 * Whether a push should upload, given how it was invoked.
 *
 * Pushing leaves this machine, so consent is required rather than assumed. The
 * shapes consent can take, and what each means:
 *
 *   --apply   the existing non-interactive form; kept working unchanged
 *   --yes     the same intent, spelled the way the rest of the CLI spells it
 *   a prompt  the interactive default, so the common case stops needing a
 *             second invocation just to say "yes, that plan"
 *
 * `--json` never prompts: its caller is a program reading stdout, and a question
 * printed into that stream is noise the program cannot answer. Neither does a
 * non-TTY stdin — there is nobody there — so it reports what to pass instead of
 * silently doing nothing or, worse, silently uploading.
 *
 * An empty plan short-circuits: asking whether to upload nothing wastes a
 * decision on a non-event.
 */
export function decidePush({ apply, yes, json, interactive, actionCount }) {
  if (apply || yes) return { upload: true, reason: "explicit" };
  if (actionCount === 0) return { upload: false, reason: "nothing-to-do" };
  if (json) return { upload: false, reason: "needs-explicit-flag" };
  if (!interactive) return { upload: false, reason: "needs-explicit-flag" };
  return { upload: false, reason: "ask" };
}
