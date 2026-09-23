import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { credentialLines } from "./checks.js";
import { canonicalJson } from "./adapters.js";
import { portableAgentContent, SAFE_AGENT_NAME } from "./agents.js";
import { normalizePath } from "./discovery.js";

export const SNAPSHOT_FORMAT = "agentplaybooks.portable-snapshot/v1";
export const SNAPSHOT_MAX_FILES = 1000;
export const SNAPSHOT_MAX_BYTES = 4 * 1024 * 1024;
const MAX_FILE_BYTES = 1024 * 1024;
const SKILL_NAME = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

export function validSnapshotPath(value) {
  if (typeof value !== "string" || !value || value.includes("\\") || value.startsWith("/") || value.includes("\0")) return false;
  const segments = value.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || segment.includes(":"))) return false;
  if (["AGENTS.md", "agentplaybook.json", ".agents/mcp.json", ".agents/persona.md"].includes(value)) return true;
  if (segments[0] === ".agents" && segments[1] === "agents" && segments.length === 3) {
    return segments[2].endsWith(".md") && SAFE_AGENT_NAME.test(segments[2].slice(0, -3));
  }
  return segments[0] === ".agents" && segments[1] === "skills" && segments.length >= 4 && SKILL_NAME.test(segments[2]);
}

function sha256(buffer) {
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}

function textIfUtf8(buffer) {
  if (buffer.includes(0)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return null;
  }
}

export function unsafeCredentialField(definition) {
  for (const field of ["env", "headers"]) {
    for (const [key, value] of Object.entries(definition?.[field] ?? {})) {
      if (!/(?:key|token|secret|pass|auth|credential)/i.test(key)) continue;
      if (typeof value !== "string") return `${field}.${key}`;
      if (!/(?:\$\{[A-Za-z_][A-Za-z0-9_]*\}|\$[A-Za-z_][A-Za-z0-9_]*|env:[A-Za-z_][A-Za-z0-9_]*|vault:[^\s]+)/.test(value)) return `${field}.${key}`;
    }
  }
  return null;
}

async function treeFiles(root) {
  const files = [];
  const queue = [root];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) queue.push(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
}

function groupByName(items) {
  const groups = new Map();
  for (const item of items ?? []) {
    const group = groups.get(item.name) ?? [];
    group.push(item);
    groups.set(item.name, group);
  }
  return groups;
}

export function validateSnapshot(snapshot) {
  if (!snapshot || snapshot.format !== SNAPSHOT_FORMAT || !Array.isArray(snapshot.files)) throw new Error("Unsupported portable snapshot format.");
  if (snapshot.files.length > SNAPSHOT_MAX_FILES) throw new Error("Portable snapshot has too many files.");
  const seen = new Set();
  let total = 0;
  for (const file of snapshot.files) {
    if (!validSnapshotPath(file?.path) || seen.has(file.path.toLowerCase())) throw new Error(`Unsafe or duplicate snapshot path: ${String(file?.path)}.`);
    seen.add(file.path.toLowerCase());
    if (typeof file.content !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.content)) throw new Error(`Invalid base64 for ${file.path}.`);
    const bytes = Buffer.from(file.content, "base64");
    total += bytes.length;
    if (bytes.length > MAX_FILE_BYTES || total > SNAPSHOT_MAX_BYTES) throw new Error("Portable snapshot exceeds the size limit.");
    if (file.sha256 !== sha256(bytes)) throw new Error(`Snapshot checksum mismatch for ${file.path}.`);
  }
  if (snapshot.files.length === 0) throw new Error("Portable snapshot contains no files.");
  return snapshot;
}

export function snapshotDigest(snapshot) {
  validateSnapshot(snapshot);
  const hash = createHash("sha256");
  for (const file of [...snapshot.files].sort((a, b) => a.path.localeCompare(b.path))) {
    hash.update(file.path);
    hash.update("\0");
    hash.update(Buffer.from(file.content, "base64"));
    hash.update("\0");
  }
  return `sha256:${hash.digest("hex")}`;
}

/** Complete portable working set; never includes .local files or client settings. */
export async function buildPortableSnapshot(report, root, manifest, instructions, { skipMcp = false } = {}) {
  const files = new Map();
  const conflicts = [];
  const add = (relative, content, source) => {
    if (!validSnapshotPath(relative)) throw new Error(`Unsafe snapshot path: ${relative}.`);
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
    if (buffer.length > MAX_FILE_BYTES) {
      conflicts.push({ kind: "snapshot", name: relative, reason: "File exceeds the 1 MiB backup limit." });
      return;
    }
    const text = textIfUtf8(buffer);
    if (text !== null && credentialLines(text).length > 0) {
      conflicts.push({ kind: "snapshot", name: relative, reason: `Possible hard-coded credential in ${source}; backup refused.` });
      return;
    }
    files.set(relative, { path: relative, content: buffer.toString("base64"), sha256: sha256(buffer) });
  };

  for (const [name, variants] of groupByName(report.inventory.skills)) {
    if (!SKILL_NAME.test(name) || new Set(variants.map((item) => item.treeDigest ?? item.digest)).size !== 1) {
      conflicts.push({ kind: "skill", name, reason: "Invalid skill name or differing skill trees; backup refused." });
      continue;
    }
    const chosen = variants.find((item) => item.platform === "portable") ?? variants[0];
    const directory = path.dirname(chosen.absolutePath);
    for (const absolute of await treeFiles(directory)) {
      const relative = normalizePath(path.relative(directory, absolute));
      add(`.agents/skills/${name}/${relative}`, await readFile(absolute), chosen.source);
    }
  }

  for (const [name, variants] of groupByName(report.inventory.agents)) {
    if (!SAFE_AGENT_NAME.test(name) || new Set(variants.map((item) => item.digest)).size !== 1) {
      conflicts.push({ kind: "agent", name, reason: "Invalid agent name or differing agent definitions; backup refused." });
      continue;
    }
    const chosen = variants.find((item) => item.platform === "portable") ?? variants[0];
    add(`.agents/agents/${name}.md`, portableAgentContent(chosen), chosen.source);
  }

  if (!skipMcp) {
    const mcp = {};
    for (const [name, variants] of groupByName(report.inventory.mcpServers)) {
      if (new Set(variants.map((item) => canonicalJson(item.definition))).size !== 1) {
        conflicts.push({ kind: "mcp", name, reason: "Differing MCP definitions; backup refused." });
        continue;
      }
      const field = unsafeCredentialField(variants[0].definition);
      if (field) {
        conflicts.push({ kind: "mcp", name, reason: `Literal credential-like ${field} value; use an environment or vault reference.` });
        continue;
      }
      mcp[name] = variants[0].definition;
    }
    if (Object.keys(mcp).length > 0) add(".agents/mcp.json", `${JSON.stringify({ mcpServers: mcp }, null, 2)}\n`, "MCP definitions");
  }

  if (instructions) add("AGENTS.md", instructions.content.endsWith("\n") ? instructions.content : `${instructions.content}\n`, instructions.source);
  const persona = path.join(root, ".agents", "persona.md");
  try {
    if ((await lstat(persona)).isFile()) add(".agents/persona.md", await readFile(persona), ".agents/persona.md");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  add("agentplaybook.json", `${JSON.stringify(manifest, null, 2)}\n`, "manifest");

  const snapshot = { format: SNAPSHOT_FORMAT, files: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)) };
  if (conflicts.length > 0) return { snapshot: null, conflicts };
  validateSnapshot(snapshot);
  return { snapshot, digest: snapshotDigest(snapshot), conflicts };
}

export async function planSnapshotRestore(root, snapshot) {
  validateSnapshot(snapshot);
  const actions = [];
  const conflicts = [];
  for (const file of snapshot.files) {
    const absolute = await assertSafeDestination(root, file.path);
    const content = Buffer.from(file.content, "base64");
    let existing = null;
    try { existing = await readFile(absolute); }
    catch (error) { if (error?.code !== "ENOENT") throw error; }
    if (existing === null) actions.push({ kind: "snapshot-file", action: "create", name: file.path, path: file.path, content });
    else if (!existing.equals(content)) conflicts.push({ kind: "snapshot-file", name: file.path, reason: `Local ${file.path} differs from the central backup.` });
  }
  return { actions, conflicts };
}

export async function assertSafeDestination(root, relative) {
  if (!validSnapshotPath(relative)) throw new Error(`Unsafe restore path: ${relative}.`);
  const base = path.resolve(root);
  let current = base;
  for (const segment of relative.split("/")) {
    current = path.join(current, segment);
    const inside = path.relative(base, current);
    if (inside.startsWith("..") || path.isAbsolute(inside)) throw new Error(`Restore path escapes its root: ${relative}.`);
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink()) throw new Error(`Restore path passes through a symlink: ${relative}.`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return current;
}
