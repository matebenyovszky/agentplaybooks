import { createHash } from "node:crypto";
import { access, readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

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
]);

const MCP_JSON_FILES = new Set([
  ".mcp.json",
  "mcp.json",
  "claude_desktop_config.json",
]);

const MAX_FILES = 20_000;
const MAX_TEXT_BYTES = 2 * 1024 * 1024;

export function digest(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function normalizePath(value) {
  return value.split(path.sep).join("/");
}

export function platformFor(relativePath) {
  const normalized = `/${normalizePath(relativePath).toLowerCase()}`;
  const base = path.basename(relativePath).toLowerCase();

  if (normalized.includes("/.codex/") || base.startsWith("agents.")) return "codex";
  if (normalized.includes("/.claude/") || base === "claude.md" || base === "claude_desktop_config.json") return "claude";
  if (normalized.includes("/.cursor/") || base === ".cursorrules") return "cursor";
  if (normalized.includes("/.github/") || base === "copilot-instructions.md") return "copilot";
  if (normalized.includes("/.gemini/") || base === "gemini.md") return "gemini";
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
    || normalized.endsWith("/.codex/config.toml");
}

async function walk(root) {
  const files = [];
  const queue = [root];

  while (queue.length > 0) {
    const current = queue.shift();
    const entries = await readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) queue.push(absolute);
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

async function readText(absolutePath) {
  const buffer = await readFile(absolutePath);
  if (buffer.byteLength > MAX_TEXT_BYTES) return null;
  return buffer.toString("utf8");
}

export async function discover(root) {
  const absoluteRoot = path.resolve(root);
  const files = await walk(absoluteRoot);
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
    const isMcp = isMcpConfig(relativePath);
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

export async function discoverGlobal() {
  const home = os.homedir();
  const roots = [
    { directory: ".codex", platform: "codex" },
    { directory: ".claude", platform: "claude" },
    { directory: ".cursor", platform: "cursor" },
    { directory: ".gemini", platform: "gemini" },
    { directory: ".agents", platform: "portable" },
  ];
  const combined = { root: home, instructions: [], skills: [], mcpConfigs: [] };

  for (const entry of roots) {
    const root = path.join(home, entry.directory);
    try {
      await access(root);
    } catch {
      continue;
    }
    const inventory = await discover(root);
    for (const key of ["instructions", "skills", "mcpConfigs"]) {
      combined[key].push(...inventory[key].map((item) => ({
        ...item,
        source: normalizePath(path.join(entry.directory, item.source)),
        platform: entry.platform,
      })));
    }
  }

  return combined;
}
