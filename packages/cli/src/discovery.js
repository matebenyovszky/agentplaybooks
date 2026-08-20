import { createHash } from "node:crypto";
import { access, readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isMap, parseDocument } from "yaml";

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".open-next",
  ".wrangler",
  ".agentplaybooks",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "vendor",
]);

const INSTRUCTION_FILES = new Set([
  "AGENTS.md",
  "AGENTS.override.md",
  "CLAUDE.md",
  "GEMINI.md",
  ".cursorrules",
  "copilot-instructions.md",
  // Hermes Agent's project context file. It takes priority over AGENTS.md in
  // Hermes, so it has to be visible to doctor and to the adapters.
  ".hermes.md",
  "HERMES.md",
]);

const MCP_JSON_FILES = new Set([
  ".mcp.json",
  "mcp.json",
  "claude_desktop_config.json",
]);

// A home-scoped agent directory is not only configuration: it also holds
// installed plugin and extension caches, past sessions, and logs. Those are
// third-party or transient content, not this user's agent configuration — and
// auditing them buries the user's own findings under spec violations in code
// nobody here wrote. Skipped for the global scan only; a project scan still sees
// everything in the project.
const VENDORED_DIRECTORIES = new Set([
  "plugins",
  "extensions",
  "marketplaces",
  "projects",
  "sessions",
  "session-env",
  "shell-snapshots",
  "snapshots",
  "history",
  "backups",
  "logs",
  "cache",
  "caches",
  "tasks",
  "telemetry",
  "ide",
  "ai-tracking",
  "sandboxes",
  "bootstrap-cache",
  "hermes-agent",
  "audio_cache",
  "image_cache",
]);

const MAX_FILES = 20_000;
const MAX_TEXT_BYTES = 2 * 1024 * 1024;

// Any unreadable directory can throw EPERM/EACCES from scandir: a Windows
// drive-root folder such as System Volume Information or $Recycle.Bin, a
// protected AppData path, or a POSIX mode-000 directory. Skip that directory
// and keep walking. Other errors still fail the scan.
const PERMISSION_CODES = new Set(["EPERM", "EACCES"]);

export function isPermissionError(error) {
  return PERMISSION_CODES.has(error?.code);
}

export function digest(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function normalizePath(value) {
  return value.split(path.sep).join("/");
}

export function platformFor(relativePath) {
  const normalized = `/${normalizePath(relativePath).toLowerCase()}`;
  const base = path.basename(relativePath).toLowerCase();

  if (normalized.includes("/.codex/")) return "codex";
  // `AGENTS.md` is the cross-vendor instruction standard (Codex, Hermes and
  // others read it), so owning a copy says nothing about which tool is in use.
  // Only a `.codex/` path means Codex; otherwise a project with AGENTS.md would
  // get a Codex deployment target it never asked for.
  if (base.startsWith("agents.")) return "portable";
  // `.mcp.json` is Claude Code's project-scoped MCP configuration file.
  if (normalized.includes("/.claude/") || base === "claude.md" || base === "claude_desktop_config.json" || base === ".mcp.json") return "claude";
  if (normalized.includes("/.cursor/") || base === ".cursorrules") return "cursor";
  if (normalized.includes("/.github/") || base === "copilot-instructions.md") return "copilot";
  if (normalized.includes("/.gemini/") || base === "gemini.md") return "gemini";
  if (normalized.includes("/.hermes/") || base === ".hermes.md" || base === "hermes.md") return "hermes";
  if (normalized.includes("/.agents/")) return "portable";
  return "generic";
}

function isMcpConfig(relativePath) {
  const normalized = normalizePath(relativePath).toLowerCase();
  const base = path.basename(relativePath).toLowerCase();
  return MCP_JSON_FILES.has(base)
    || normalized === ".cursor/mcp.json"
    || normalized.endsWith("/.cursor/mcp.json")
    || normalized === ".vscode/mcp.json"
    || normalized.endsWith("/.vscode/mcp.json")
    || normalized === ".codex/config.toml"
    || normalized.endsWith("/.codex/config.toml")
    // Hermes keeps its MCP servers in the profile config, next to every other
    // setting. Only this exact path counts: a stray `config.yaml` elsewhere in a
    // project is not an MCP configuration.
    || normalized === ".hermes/config.yaml"
    || normalized.endsWith("/.hermes/config.yaml");
}

async function walk(root, ignored = IGNORED_DIRECTORIES, listDir = readdir) {
  const files = [];
  const queue = [root];

  while (queue.length > 0) {
    const current = queue.shift();
    let entries;
    try {
      entries = await listDir(current, { withFileTypes: true });
    } catch (error) {
      if (isPermissionError(error)) continue;
      throw error;
    }

    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!ignored.has(entry.name)) queue.push(absolute);
        continue;
      }
      if (!entry.isFile()) continue;
      files.push(absolute);
      if (files.length > MAX_FILES) {
        throw new Error(`Scan stopped after ${MAX_FILES} files. Narrow the target directory.`);
      }
    }
  }

  return files;
}

/**
 * Normalize CRLF to LF.
 *
 * Line endings are a checkout detail, not a difference in configuration: the
 * same skill checked out on Windows and on macOS must produce the same digest,
 * otherwise every mixed-platform team sees phantom drift and every comparison
 * against remote or platform files reports a phantom conflict. All discovered
 * text goes through here, so digests, frontmatter parsing, and content
 * comparisons all operate on LF.
 */
export function normalizeText(value) {
  return value.replace(/\r\n/g, "\n");
}

async function readText(absolutePath) {
  const buffer = await readFile(absolutePath);
  if (buffer.byteLength > MAX_TEXT_BYTES) return null;
  return normalizeText(buffer.toString("utf8"));
}

async function readTextIfExists(absolutePath) {
  try {
    return await readText(absolutePath);
  } catch {
    return null;
  }
}

/**
 * @param {string} root
 * @param {object} [options]
 * @param {string[]} [options.extraMcpPaths] Paths (relative to `root`) that hold
 *   MCP servers but are not recognizable from their name alone — Hermes' profile
 *   `config.yaml`, which is scanned as its own root.
 * @param {boolean} [options.skipVendored] Also skip installed plugin and
 *   extension caches, sessions, and logs. For scanning a tool's home directory.
 * @param {typeof import("node:fs/promises").readdir} [options.readdir] Directory
 *   reader, injected by the tests that cover unreadable directories.
 */
export async function discover(root, { extraMcpPaths = [], skipVendored = false, readdir: listDir } = {}) {
  const absoluteRoot = path.resolve(root);
  const ignored = skipVendored
    ? new Set([...IGNORED_DIRECTORIES, ...VENDORED_DIRECTORIES])
    : IGNORED_DIRECTORIES;
  const files = await walk(absoluteRoot, ignored, listDir);
  const inventory = {
    root: absoluteRoot,
    instructions: [],
    skills: [],
    mcpConfigs: [],
  };

  for (const absolutePath of files) {
    const relativePath = normalizePath(path.relative(absoluteRoot, absolutePath));
    const base = path.basename(absolutePath);
    const isSkill = base === "SKILL.md";
    const isInstruction = INSTRUCTION_FILES.has(base);
    const isMcp = isMcpConfig(relativePath) || extraMcpPaths.includes(relativePath);
    if (!isSkill && !isInstruction && !isMcp) continue;

    const content = await readText(absolutePath);
    if (content === null) continue;
    const item = {
      source: relativePath,
      absolutePath,
      platform: platformFor(relativePath),
      digest: digest(content),
      content,
    };

    if (isSkill) inventory.skills.push(item);
    if (isInstruction) inventory.instructions.push(item);
    if (isMcp) inventory.mcpConfigs.push(item);
  }

  return inventory;
}

/**
 * Where a Hermes profile can live, most specific first.
 *
 * `$HERMES_HOME` wins outright — that is how named profiles are selected. The
 * documentation says `~/.hermes`, but that is the POSIX answer: the Windows
 * installer puts the profile (`config.yaml`, `SOUL.md`, `skills/`) under
 * `%LOCALAPPDATA%\hermes`, and a machine with a real installation there has no
 * `~/.hermes` at all. Writing to the documented path on Windows would silently
 * create a second, unused profile.
 */
export function hermesProfileCandidates({ homedir = os.homedir(), env = process.env, platform = process.platform } = {}) {
  const override = typeof env.HERMES_HOME === "string" ? env.HERMES_HOME.trim() : "";
  if (override.length > 0) return [{ directory: path.resolve(override), display: "$HERMES_HOME" }];

  const candidates = [];
  if (platform === "win32" && typeof env.LOCALAPPDATA === "string" && env.LOCALAPPDATA.length > 0) {
    candidates.push({ directory: path.join(env.LOCALAPPDATA, "hermes"), display: "%LOCALAPPDATA%/hermes" });
  }
  candidates.push({ directory: path.join(homedir, ".hermes"), display: "~/.hermes" });
  return candidates;
}

/**
 * The profile this machine actually uses: the first candidate that holds a
 * `config.yaml`, then the first that exists at all, and only then the
 * platform default (which is the right place to create one).
 */
export async function hermesProfile(options = {}) {
  const candidates = hermesProfileCandidates(options);
  for (const candidate of candidates) {
    try {
      await access(path.join(candidate.directory, "config.yaml"));
      return candidate;
    } catch {
      continue;
    }
  }
  for (const candidate of candidates) {
    try {
      await access(candidate.directory);
      return candidate;
    } catch {
      continue;
    }
  }
  return candidates[0];
}

/**
 * Resolve a path the way Hermes resolves `skills.external_dirs`: `~` expands to
 * the home directory and `${VAR}` to an environment variable. An unset variable
 * is left verbatim, which is also what Hermes does, so a placeholder never
 * silently compares equal to a real directory.
 */
export function expandConfiguredPath(value, { homedir = os.homedir(), env = process.env } = {}) {
  const substituted = String(value).replace(
    /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g,
    (whole, name) => (typeof env[name] === "string" ? env[name] : whole),
  );
  if (substituted === "~") return homedir;
  if (substituted.startsWith("~/") || substituted.startsWith("~\\")) {
    return path.join(homedir, substituted.slice(2));
  }
  return substituted;
}

/**
 * The directories a Hermes profile config adds to its skill search path.
 * Unreadable or unexpected configuration yields an empty list: this feeds a
 * read-only inventory, and guessing would report skills Hermes never loads.
 */
export function hermesExternalSkillDirs(configContent, { homedir, env } = {}) {
  if (typeof configContent !== "string") return [];
  const document = parseDocument(configContent, { strict: false });
  if (document.errors.length > 0 || !isMap(document.contents)) return [];
  const configured = document.getIn(["skills", "external_dirs"], true);
  const list = typeof configured?.toJSON === "function" ? configured.toJSON() : configured;
  if (!Array.isArray(list)) return [];
  return list
    .filter((entry) => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => expandConfiguredPath(entry, { homedir, env }));
}

/**
 * The skills Hermes shipped, by name. Hermes seeds a large bundle into every
 * profile and tracks it in `skills/.bundled_manifest` as `name:hash` lines.
 * Those are the vendor's files, not this user's configuration: auditing them
 * reports documentation examples in someone else's skills as if the user had
 * written them.
 */
export async function hermesBundledSkillNames(profileDirectory) {
  const manifest = await readTextIfExists(path.join(profileDirectory, "skills", ".bundled_manifest"));
  if (manifest === null) return new Set();
  return new Set(
    manifest
      .split("\n")
      .map((line) => line.split(":")[0].trim())
      .filter((name) => name.length > 0),
  );
}

// Skills a client ships with itself. Cursor keeps its managed set in a separate
// directory next to yours (`skills-cursor`, with its own manifest); Hermes seeds
// a bundle into every profile. They are installed and active, but they are the
// vendor's files: copying `update-cursor-settings` into Claude Code is not
// something anyone wants by default.
const VENDOR_SKILL_DIRECTORIES = [".cursor/skills-cursor/"];

function isVendorSkill(source, bundledNames) {
  if (VENDOR_SKILL_DIRECTORIES.some((directory) => source.startsWith(directory))) return true;
  return bundledNames.has(path.basename(path.dirname(source)));
}

/**
 * @param {object} [options]
 * @param {boolean} [options.includeVendored] Keep the skills the clients shipped
 *   with themselves. Off by default: they are active, but they are not the
 *   user's configuration, and syncing them between clients is nonsense.
 */
export async function discoverGlobal({
  homedir = os.homedir(),
  env = process.env,
  platform = process.platform,
  includeVendored = false,
} = {}) {
  const profile = await hermesProfile({ homedir, env, platform });
  const roots = [
    { directory: path.join(homedir, ".codex"), label: ".codex", platform: "codex" },
    { directory: path.join(homedir, ".claude"), label: ".claude", platform: "claude" },
    { directory: path.join(homedir, ".cursor"), label: ".cursor", platform: "cursor" },
    { directory: path.join(homedir, ".gemini"), label: ".gemini", platform: "gemini" },
    // The profile config holds Hermes' MCP servers; it is scanned as its own
    // root, so the name it is recognized by is relative to that root.
    { directory: profile.directory, label: profile.display, platform: "hermes", extraMcpPaths: ["config.yaml"] },
    { directory: path.join(homedir, ".agents"), label: ".agents", platform: "portable" },
  ];

  // Skills Hermes reads from elsewhere are part of its inventory: leaving them
  // out would report a profile as empty while `/skill-name` works fine.
  for (const directory of hermesExternalSkillDirs(
    await readTextIfExists(path.join(profile.directory, "config.yaml")),
    { homedir, env },
  )) {
    if (roots.some((entry) => entry.directory === directory)) continue;
    roots.push({ directory, label: normalizePath(directory), platform: "hermes" });
  }

  const bundled = includeVendored ? new Set() : await hermesBundledSkillNames(profile.directory);
  const combined = { root: homedir, instructions: [], skills: [], mcpConfigs: [] };
  for (const entry of roots) {
    try {
      await access(entry.directory);
    } catch {
      continue;
    }
    const inventory = await discover(entry.directory, {
      extraMcpPaths: entry.extraMcpPaths,
      skipVendored: true,
    });
    for (const key of ["instructions", "skills", "mcpConfigs"]) {
      for (const item of inventory[key]) {
        const source = `${entry.label}/${item.source}`;
        if (key === "skills" && !includeVendored && isVendorSkill(source, bundled)) continue;
        combined[key].push({ ...item, source, platform: entry.platform });
      }
    }
  }

  return combined;
}
