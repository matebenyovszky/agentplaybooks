import { access, mkdir, copyFile, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isMap, parseDocument } from "yaml";
import { expandConfiguredPath, hermesProfile, normalizePath, normalizeText } from "./discovery.js";

// Platform adapters describe where a deployment target keeps its skills and
// MCP server definitions.
//
// - `platforms` lists the inventory platform labels that count as "already on
//   this target" (antigravity reads the portable .agents store).
// - `mcpPlatforms` does the same for MCP servers when a target reads skills and
//   MCP servers from different places.
// - `format` selects the MCP config writer. Codex uses TOML, Hermes YAML.
// - `profile: true` targets keep their MCP servers and identity in a
//   home-scoped profile directory instead of in the project.
const TARGET_ADAPTERS = {
  claude: { platforms: ["claude"], skillsDir: ".claude/skills", mcpPath: ".mcp.json", format: "json" },
  cursor: { platforms: ["cursor"], skillsDir: ".cursor/skills", mcpPath: ".cursor/mcp.json", format: "json" },
  codex: { platforms: ["codex"], skillsDir: ".codex/skills", mcpPath: ".codex/config.toml", format: "toml" },
  antigravity: { platforms: ["antigravity", "portable"], skillsDir: ".agents/skills" },
  // Grok Bot (xAI) discovers skills from a fixed set of roots that includes the
  // portable `.agents/skills` store, and its system prompt loads `AGENTS.md`
  // directly — so this target writes the portable store and needs no bridge
  // file. Its MCP servers are the one thing a file cannot provision: the app
  // keeps only an array of server *ids* in `~/.grokbot/settings.json`
  // (`mcpBoxServers`), and the definitions behind those ids live in the
  // account's MCP Box. `mcpUnsupported` is reported rather than skipped in
  // silence, because a playbook whose MCP servers quietly did not arrive looks
  // exactly like one that has none.
  grok: {
    platforms: ["grok", "portable"],
    skillsDir: ".agents/skills",
    mcpUnsupported: "Grok Bot's MCP servers live in the account's MCP Box, not in a project file. Add the playbook's own MCP endpoint (POST /api/mcp/<guid>) to the Box once, and its tools reach every Grok Bot session.",
  },
  // Hermes Agent reads skills from its profile (`~/.hermes/skills`) *and* from
  // every directory listed under `skills.external_dirs` in its `config.yaml`.
  // Registering the portable store beats copying into the profile: nothing is
  // duplicated, the next `pull` is picked up without another sync, and Hermes'
  // own local skills keep precedence on a name collision — which is the right
  // order for a shared team playbook. MCP servers have no such indirection, so
  // those are written into `config.yaml` itself.
  hermes: {
    platforms: ["hermes", "portable"],
    mcpPlatforms: ["hermes"],
    skillsDir: ".agents/skills",
    profile: true,
    format: "yaml",
  },
};

// Hermes' `config.yaml` accepts these keys per server (stdio: command/args/env,
// HTTP: url/headers). A definition carrying anything else is reported instead of
// being written half-translated.
const HERMES_SERVER_KEYS = new Set(["command", "args", "env", "url", "headers"]);

// Where `pull` puts the playbook's persona, and where the hermes target copies
// it from. Hermes loads `SOUL.md` as slot #1 of its system prompt.
const PORTABLE_PERSONA_PATH = ".agents/persona.md";

const SAFE_SKILL_NAME = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

// Target types `sync` can write files for, and the home-directory marker that
// indicates the user has that tool installed at all. The marker is only used to
// suggest targets; nothing is ever enabled or written without the user asking.
export const ADAPTER_TARGET_TYPES = Object.keys(TARGET_ADAPTERS);
export const TARGET_HOME_MARKERS = {
  claude: ".claude",
  cursor: ".cursor",
  codex: ".codex",
  antigravity: ".gemini",
  hermes: ".hermes",
  grok: ".grokbot",
};

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function conflict(target, kind, name, reason, sources) {
  return { target, kind, name, reason, sources: sources.map(normalizePath) };
}

async function readIfExists(absolutePath) {
  try {
    return normalizeText(await readFile(absolutePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function groupByName(items) {
  const groups = new Map();
  for (const item of items) {
    const group = groups.get(item.name) ?? [];
    group.push(item);
    groups.set(item.name, group);
  }
  return groups;
}

function skillActions(report, targetIds, conflicts, { root }) {
  const actions = [];
  const groups = groupByName(report.inventory.skills);
  // Two targets can share one store (antigravity and hermes both read
  // `.agents/skills`), and the same file must not be planned twice.
  const planned = new Set();

  for (const [name, variants] of groups) {
    const digests = new Set(variants.map((item) => item.digest));
    for (const target of targetIds) {
      const adapter = TARGET_ADAPTERS[target];
      if (!adapter?.skillsDir) continue;
      if (variants.some((item) => adapter.platforms.includes(item.platform))) continue;
      if (digests.size > 1) {
        conflicts.push(conflict(target, "skill", name, "Skill definitions differ across platforms; resolve the drift before syncing.", variants.map((item) => item.source)));
        continue;
      }
      if (!SAFE_SKILL_NAME.test(name)) {
        conflicts.push(conflict(target, "skill", name, "Skill name is not a safe lowercase kebab-case directory name.", variants.map((item) => item.source)));
        continue;
      }
      const relativePath = `${adapter.skillsDir}/${name}/SKILL.md`;
      const absolutePath = path.join(root, ...relativePath.split("/"));
      if (planned.has(absolutePath)) continue;
      planned.add(absolutePath);
      actions.push({
        kind: "skill",
        target,
        name,
        action: "create",
        path: relativePath,
        absolutePath,
        content: variants[0].content,
        from: variants[0].source,
      });
    }
  }
  return actions;
}

// --- MCP config writers -----------------------------------------------------

function tomlString(value) {
  return JSON.stringify(String(value));
}

/**
 * Serialize one MCP server definition as `[mcp_servers.<name>]` TOML
 * sections. Returns null when the definition uses shapes the writer cannot
 * represent; the caller reports a conflict instead of writing a lossy config.
 */
function tomlServerSections(name, definition) {
  const known = new Set(["command", "url", "args", "env"]);
  if (Object.keys(definition ?? {}).some((key) => !known.has(key))) return null;
  const lines = [`[mcp_servers.${name}]`];
  if (typeof definition.command === "string") lines.push(`command = ${tomlString(definition.command)}`);
  if (typeof definition.url === "string") lines.push(`url = ${tomlString(definition.url)}`);
  if (definition.args !== undefined) {
    if (!Array.isArray(definition.args) || definition.args.some((item) => typeof item !== "string")) return null;
    lines.push(`args = [${definition.args.map(tomlString).join(", ")}]`);
  }
  if (definition.env !== undefined) {
    const entries = Object.entries(definition.env ?? {});
    if (entries.some(([, value]) => typeof value !== "string")) return null;
    if (entries.length > 0) {
      lines.push("", `[mcp_servers.${name}.env]`);
      for (const [key, value] of entries) lines.push(`${key} = ${tomlString(value)}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function mergedTomlContent(existingContent, additions, target, conflicts, existingSource) {
  const sections = [];
  for (const [name, definition] of Object.entries(additions)) {
    const section = tomlServerSections(name, definition);
    if (section === null) {
      conflicts.push(conflict(target, "mcp", name, "MCP server definition cannot be represented in Codex TOML; add it to .codex/config.toml manually.", [existingSource]));
      continue;
    }
    sections.push(section);
  }
  if (sections.length === 0) return { content: null, added: [] };
  const base = existingContent ? `${existingContent.replace(/\s*$/, "")}\n\n` : "";
  return { content: `${base}${sections.join("\n")}`, added: Object.keys(additions) };
}

function mergedJsonContent(existingContent, additions, target, conflicts, mcpPath) {
  let document = { mcpServers: {} };
  if (existingContent !== null) {
    try {
      document = JSON.parse(existingContent);
    } catch {
      conflicts.push(conflict(target, "mcp", mcpPath, "Existing MCP configuration is not valid JSON.", [mcpPath]));
      return { content: null, added: [] };
    }
    if (!document.mcpServers || typeof document.mcpServers !== "object" || Array.isArray(document.mcpServers)) {
      document.mcpServers = {};
    }
  }
  for (const [name, definition] of Object.entries(additions)) {
    document.mcpServers[name] = definition;
  }
  return { content: `${JSON.stringify(document, null, 2)}\n`, added: Object.keys(additions) };
}

/**
 * The MCP servers this target is missing. A target that reads its skills and
 * its MCP servers from different places (Hermes) declares `mcpPlatforms`
 * separately: a server sitting in the portable store is not automatically
 * visible to it the way a skill is.
 */
function mcpAdditionsFor(adapter, groups, target, conflicts) {
  const platforms = adapter.mcpPlatforms ?? adapter.platforms;
  const additions = {};
  for (const [name, variants] of groups) {
    if (variants.some((item) => platforms.includes(item.platform))) continue;
    const canonical = new Set(variants.map((item) => canonicalJson(item.definition)));
    if (canonical.size > 1) {
      conflicts.push(conflict(target, "mcp", name, "MCP server definitions differ across platforms; resolve the drift before syncing.", variants.map((item) => item.source)));
      continue;
    }
    additions[name] = variants[0].definition;
  }
  return additions;
}

function mcpActions(report, targetIds, conflicts, { root }) {
  const actions = [];
  const groups = groupByName(report.inventory.mcpServers);

  for (const target of targetIds) {
    const adapter = TARGET_ADAPTERS[target];
    if (!adapter?.mcpPath) {
      // A target that cannot receive MCP servers from a file says so, once,
      // and only when there is actually something it would have received.
      if (adapter?.mcpUnsupported && groups.size > 0) {
        const names = [...groups.keys()].sort().join(", ");
        conflicts.push(conflict(target, "mcp", names, adapter.mcpUnsupported, report.inventory.mcpConfigs.map((config) => config.source)));
      }
      continue;
    }

    const additions = mcpAdditionsFor(adapter, groups, target, conflicts);
    if (Object.keys(additions).length === 0) continue;

    const existing = report.inventory.mcpConfigs.find((config) => config.source === adapter.mcpPath);
    const existingContent = existing ? existing.content : null;
    const merged = adapter.format === "toml"
      ? mergedTomlContent(existingContent, additions, target, conflicts, adapter.mcpPath)
      : mergedJsonContent(existingContent, additions, target, conflicts, adapter.mcpPath);
    if (merged.content === null || merged.added.length === 0) continue;

    actions.push({
      kind: "mcp-config",
      target,
      name: adapter.mcpPath,
      action: existing ? "merge" : "create",
      path: adapter.mcpPath,
      absolutePath: path.join(root, ...adapter.mcpPath.split("/")),
      servers: merged.added.sort(),
      content: merged.content,
    });
  }
  return actions;
}

// --- Hermes Agent profile ---------------------------------------------------

function samePath(left, right) {
  const a = path.resolve(left);
  const b = path.resolve(right);
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function unrepresentableServerKeys(definition) {
  return Object.keys(definition ?? {}).filter((key) => !HERMES_SERVER_KEYS.has(key));
}

/**
 * Just the connection: which process to run or which URL to call. Hermes keeps
 * its own settings next to those (`connect_timeout`, `timeout`, `tools.include`,
 * sampling), and a profile that has tuned them is not "a different server" — it
 * is the same server, configured. Comparing the whole entry would report a
 * conflict for every server the user has ever touched in Hermes.
 */
function connectionOnly(definition) {
  return Object.fromEntries(
    Object.entries(definition ?? {}).filter(([key]) => HERMES_SERVER_KEYS.has(key)),
  );
}

/**
 * Merge MCP servers and the portable skill store into Hermes' `config.yaml`.
 * The document is edited rather than regenerated so comments, key order, and
 * every unrelated setting survive; anything the merge cannot reason about is
 * reported as a conflict instead of being overwritten.
 */
function mergedHermesConfig(existingContent, additions, externalDir, { conflicts, display, homedir, env }) {
  const document = parseDocument(existingContent ?? "", { strict: true, uniqueKeys: true });
  if (document.errors.length > 0 || (document.contents !== null && !isMap(document.contents))) {
    conflicts.push(conflict("hermes", "hermes-config", display, `${display} is not a YAML mapping this tool can safely merge into; add the entries by hand.`, [display]));
    return { content: null, servers: [], externalDirs: [] };
  }
  if (document.contents === null) document.contents = document.createNode({});

  const servers = [];
  for (const [name, definition] of Object.entries(additions)) {
    const unrepresentable = unrepresentableServerKeys(definition);
    if (unrepresentable.length > 0) {
      conflicts.push(conflict("hermes", "mcp", name, `MCP server definition uses keys Hermes' config.yaml does not accept (${unrepresentable.join(", ")}); add it with 'hermes mcp add' instead.`, [display]));
      continue;
    }
    const current = document.getIn(["mcp_servers", name], true);
    if (current !== undefined) {
      const currentValue = typeof current?.toJSON === "function" ? current.toJSON() : current;
      if (canonicalJson(connectionOnly(currentValue)) !== canonicalJson(connectionOnly(definition))) {
        conflicts.push(conflict("hermes", "mcp", name, `${display} already defines '${name}' with a different connection; not overwritten.`, [display]));
      }
      continue;
    }
    document.setIn(["mcp_servers", name], definition);
    servers.push(name);
  }

  const externalDirs = [];
  const configured = document.getIn(["skills", "external_dirs"], true);
  const configuredList = configured === undefined
    ? []
    : (typeof configured?.toJSON === "function" ? configured.toJSON() : configured);
  if (!Array.isArray(configuredList)) {
    conflicts.push(conflict("hermes", "hermes-config", display, `skills.external_dirs in ${display} is not a list; add the skill directory by hand.`, [display]));
  } else {
    const store = normalizePath(externalDir);
    const alreadyListed = configuredList.some((entry) => typeof entry === "string"
      && samePath(expandConfiguredPath(entry, { homedir, env }), externalDir));
    if (!alreadyListed) {
      if (configured === undefined) document.setIn(["skills", "external_dirs"], [store]);
      else document.addIn(["skills", "external_dirs"], store);
      externalDirs.push(store);
    }
  }

  if (servers.length === 0 && externalDirs.length === 0) return { content: null, servers, externalDirs };
  const serialized = document.toString({ lineWidth: 0 });
  return {
    content: serialized.endsWith("\n") ? serialized : `${serialized}\n`,
    servers: servers.sort(),
    externalDirs,
  };
}

/**
 * Plan the two writes the hermes target needs in its profile directory: the
 * `config.yaml` entries (MCP servers plus the portable skill store), and
 * `SOUL.md` from the playbook's persona.
 */
async function hermesActions(report, targetIds, conflicts, { root, homedir, env, platform, skipMcp }) {
  if (!targetIds.includes("hermes")) return [];
  const profile = await hermesProfile({ homedir, env, platform });
  const actions = [];

  const configPath = path.join(profile.directory, "config.yaml");
  const configDisplay = `${profile.display}/config.yaml`;
  const existingConfig = await readIfExists(configPath);
  const additions = skipMcp
    ? {}
    : mcpAdditionsFor(TARGET_ADAPTERS.hermes, groupByName(report.inventory.mcpServers), "hermes", conflicts);
  const merged = mergedHermesConfig(existingConfig, additions, path.join(root, ".agents", "skills"), {
    conflicts,
    display: configDisplay,
    homedir,
    env,
  });
  if (merged.content !== null) {
    actions.push({
      kind: "hermes-config",
      target: "hermes",
      name: "config.yaml",
      action: existingConfig === null ? "create" : "merge",
      path: configDisplay,
      absolutePath: configPath,
      servers: merged.servers,
      externalDirs: merged.externalDirs,
      content: merged.content,
    });
  }

  const persona = await readIfExists(path.join(root, ...PORTABLE_PERSONA_PATH.split("/")));
  if (persona !== null && persona.trim().length > 0) {
    const soulPath = path.join(profile.directory, "SOUL.md");
    const soulDisplay = `${profile.display}/SOUL.md`;
    const content = persona.endsWith("\n") ? persona : `${persona}\n`;
    const current = await readIfExists(soulPath);
    if (current === null) {
      actions.push({
        kind: "persona",
        target: "hermes",
        name: "SOUL.md",
        action: "create",
        path: soulDisplay,
        absolutePath: soulPath,
        content,
        from: PORTABLE_PERSONA_PATH,
      });
    } else if (current !== content) {
      conflicts.push(conflict("hermes", "persona", "SOUL.md", `${soulDisplay} differs from the playbook persona and was not overwritten. Hermes seeds a default SOUL.md on first run — delete it (or merge the two) and re-run.`, [PORTABLE_PERSONA_PATH]));
    }
  }

  return actions;
}

// Claude Code reads CLAUDE.md and does not read AGENTS.md, but it does support
// `@path` imports inside CLAUDE.md (see
// https://code.claude.com/docs/en/memory.md). So the bridge is a pointer file,
// not a copy: no duplicated text means the two can never drift apart.
const CLAUDE_IMPORT_LINE = "@AGENTS.md";
const CLAUDE_BRIDGE_CONTENT = `# Project instructions\n\n${CLAUDE_IMPORT_LINE}\n`;

// Hermes loads exactly one project context file — first match wins, in the
// order `.hermes.md` → `AGENTS.md` → `CLAUDE.md` → `.cursorrules`. A project
// that has both `.hermes.md` and `AGENTS.md` therefore ships instructions Hermes
// will never read, which no amount of syncing can fix for the user.
const HERMES_INSTRUCTION_SHADOWS = [".hermes.md", "HERMES.md"];

function hermesInstructionConflicts(report, targetIds, conflicts) {
  if (!targetIds.includes("hermes")) return;
  const agents = report.inventory.instructions.find((item) => item.source === "AGENTS.md");
  if (!agents) return;
  const shadow = report.inventory.instructions.find((item) => HERMES_INSTRUCTION_SHADOWS.includes(item.source));
  if (!shadow || shadow.content === agents.content) return;
  conflicts.push(conflict("hermes", "instructions", shadow.source, `Hermes loads only the first project context file it finds, so ${shadow.source} hides AGENTS.md. Keep one of them, or make ${shadow.source} point at AGENTS.md.`, [shadow.source, "AGENTS.md"]));
}

async function instructionActions(report, targetIds, conflicts, { root }) {
  hermesInstructionConflicts(report, targetIds, conflicts);
  if (!targetIds.includes("claude")) return [];
  const hasAgentsFile = report.inventory.instructions.some((item) => item.source === "AGENTS.md");
  if (!hasAgentsFile) return [];

  const existing = report.inventory.instructions.find((item) => item.source === "CLAUDE.md");
  if (!existing) {
    return [{
      kind: "instructions",
      target: "claude",
      name: "CLAUDE.md",
      action: "create",
      path: "CLAUDE.md",
      absolutePath: path.join(root, "CLAUDE.md"),
      content: CLAUDE_BRIDGE_CONTENT,
      from: "AGENTS.md",
    }];
  }
  // An existing CLAUDE.md is the user's file. Rewriting it is not ours to do,
  // but staying silent would hide that Claude Code never sees AGENTS.md.
  if (!existing.content.includes(CLAUDE_IMPORT_LINE)) {
    conflicts.push(conflict("claude", "instructions", "CLAUDE.md", `CLAUDE.md does not import AGENTS.md, so Claude Code will not load it. Add a '${CLAUDE_IMPORT_LINE}' line.`, ["CLAUDE.md", "AGENTS.md"]));
  }
  return [];
}

/**
 * Which agent tools this user appears to have installed. Used to suggest
 * targets when a project has none — for example right after `pull` on a new
 * machine, where the portable store is the only thing on disk.
 */
export async function detectInstalledTargets(homedir = os.homedir(), env = process.env, platform = process.platform) {
  const detected = [];
  for (const [type, marker] of Object.entries(TARGET_HOME_MARKERS)) {
    // A Hermes profile lives wherever $HERMES_HOME points, or under
    // %LOCALAPPDATA% on Windows, so `~/.hermes` may legitimately not exist on a
    // machine that runs Hermes.
    const directory = type === "hermes"
      ? (await hermesProfile({ homedir, env, platform })).directory
      : path.join(homedir, marker);
    try {
      await access(directory);
      detected.push(type);
    } catch {
      continue;
    }
  }
  return detected;
}

/**
 * Plan the platform files each enabled target is missing. Conflicting
 * definitions are reported and skipped; nothing is ever silently overwritten
 * with a differing definition.
 */
export async function planAdapters(report, targets, {
  homedir = os.homedir(),
  env = process.env,
  platform = process.platform,
  skipMcp = false,
} = {}) {
  const root = report.inventory.root;
  const targetIds = targets
    .filter((target) => target.enabled && TARGET_ADAPTERS[target.type])
    .map((target) => target.type);
  const conflicts = [];
  const actions = [
    ...await instructionActions(report, targetIds, conflicts, { root }),
    ...skillActions(report, targetIds, conflicts, { root }),
    ...(skipMcp ? [] : mcpActions(report, targetIds, conflicts, { root })),
    ...await hermesActions(report, targetIds, conflicts, { root, homedir, env, platform, skipMcp }),
  ];
  actions.sort((a, b) => a.path.localeCompare(b.path));
  return { actions, conflicts };
}

async function atomicWrite(absolutePath, content) {
  await mkdir(path.dirname(absolutePath), { recursive: true });
  const tempPath = path.join(path.dirname(absolutePath), `.${path.basename(absolutePath)}.${process.pid}.tmp`);
  await writeFile(tempPath, content, { encoding: "utf8", mode: 0o600 });
  await rename(tempPath, absolutePath);
}

// Backups live in one flat directory, so a display path becomes one filename.
// `~/` and `$HERMES_HOME` are spelled out rather than dropped: two profiles can
// hold the same relative path.
function backupName(displayPath) {
  return displayPath
    .replace(/^~\//, "HOME/")
    .replace(/^\$([A-Za-z_][A-Za-z0-9_]*)\//, "$1/")
    .replace(/^%([A-Za-z_][A-Za-z0-9_]*)%\//, "$1/")
    .split("/")
    .join("__");
}

export async function applyAdapters(actions, backupDirectory) {
  const written = [];
  const backups = [];
  for (const action of actions) {
    if (action.action === "merge") {
      await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
      const backupPath = path.join(backupDirectory, backupName(action.path));
      await copyFile(action.absolutePath, backupPath);
      backups.push(backupPath);
    }
    await atomicWrite(action.absolutePath, action.content);
    written.push(action.path);
  }
  return { written, backups };
}

// Exported for reuse by remote pull, which compares fetched content against
// local files using the same canonical comparison rules.
export { canonicalJson };
