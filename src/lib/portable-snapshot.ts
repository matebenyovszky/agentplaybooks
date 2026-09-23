import { createHash } from "node:crypto";

export const PORTABLE_SNAPSHOT_FORMAT = "agentplaybooks.portable-snapshot/v1";
export const MAX_SNAPSHOT_BYTES = 4 * 1024 * 1024;
export const MAX_SNAPSHOT_FILES = 1000;
const PORTABLE_NAME = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

export type PortableSnapshotFile = { path: string; content: string; sha256: string };
export type PortableSnapshot = { format: typeof PORTABLE_SNAPSHOT_FORMAT; files: PortableSnapshotFile[] };

function checksum(bytes: Buffer) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

const CREDENTIAL_PATTERNS = [
  /\bsk-[a-zA-Z0-9_-]{20,}\b/,
  /\bgh[pousr]_[a-zA-Z0-9]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /(?:api[_-]?key|access[_-]?token|auth[_-]?token|password|passwd|client[_-]?secret)[A-Za-z0-9_-]*["']?\s*[=:]\s*["']?([^\s,"'}]+)/i,
];
const REFERENCE = /^(?:\$\{|\$[A-Za-z_]|\{\{|<|your[_-]|example|changeme|replace[_-]|env:|vault:|secret:|process\.env|import\.meta\.env|os\.environ|os\.getenv|System\.getenv|Deno\.env|getenv\(|ENV\[)/i;

function hasLiteralCredential(bytes: Buffer) {
  if (bytes.includes(0)) return false;
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  for (const line of text.split(/\r?\n/)) {
    for (const pattern of CREDENTIAL_PATTERNS) {
      const match = line.match(pattern);
      if (match && !REFERENCE.test((match[1] ?? match[0]).trim())) return true;
    }
  }
  return false;
}

function safePath(value: unknown): value is string {
  if (typeof value !== "string" || !value || value.includes("\\") || value.startsWith("/") || value.includes("\0")) return false;
  const parts = value.split("/");
  if (parts.some((part) => !part || part === "." || part === ".." || part.includes(":"))) return false;
  if (["AGENTS.md", "agentplaybook.json", ".agents/mcp.json", ".agents/persona.md"].includes(value)) return true;
  if (parts[0] !== ".agents") return false;
  if (parts[1] === "agents") return parts.length === 3 && parts[2].endsWith(".md") && PORTABLE_NAME.test(parts[2].slice(0, -3));
  return parts[1] === "skills" && parts.length >= 4 && PORTABLE_NAME.test(parts[2]);
}

/** Validate an untrusted client upload before any database write or download. */
export function validatePortableSnapshot(input: unknown): { snapshot: PortableSnapshot; digest: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Snapshot must be an object.");
  const candidate = input as Partial<PortableSnapshot>;
  if (candidate.format !== PORTABLE_SNAPSHOT_FORMAT || !Array.isArray(candidate.files)) throw new Error("Unsupported snapshot format.");
  if (candidate.files.length === 0 || candidate.files.length > MAX_SNAPSHOT_FILES) throw new Error("Snapshot file count is invalid.");
  const seen = new Set<string>();
  let total = 0;
  const files = candidate.files as PortableSnapshotFile[];
  for (const file of files) {
    if (!safePath(file?.path) || seen.has(file.path.toLowerCase())) throw new Error("Unsafe or duplicate snapshot path.");
    seen.add(file.path.toLowerCase());
    if (typeof file.content !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.content)) throw new Error(`Invalid base64 in ${file.path}.`);
    const bytes = Buffer.from(file.content, "base64");
    total += bytes.length;
    if (bytes.length > 1024 * 1024 || total > MAX_SNAPSHOT_BYTES) throw new Error("Snapshot size limit exceeded.");
    if (file.sha256 !== checksum(bytes)) throw new Error(`Checksum mismatch in ${file.path}.`);
    if (hasLiteralCredential(bytes)) throw new Error(`Possible literal credential in ${file.path}; use a secret reference.`);
    if (file.path === ".agents/mcp.json") {
      let mcp: { mcpServers?: Record<string, { env?: Record<string, unknown>; headers?: Record<string, unknown> }> };
      try { mcp = JSON.parse(bytes.toString("utf8")); }
      catch { throw new Error("Invalid portable MCP JSON."); }
      if (!mcp.mcpServers || typeof mcp.mcpServers !== "object" || Array.isArray(mcp.mcpServers)) throw new Error("Portable MCP file has no mcpServers object.");
      for (const server of Object.values(mcp.mcpServers)) for (const field of ["env", "headers"] as const) {
        for (const [name, value] of Object.entries(server?.[field] ?? {})) {
          if (/(?:key|token|secret|pass|auth|credential)/i.test(name)
            && (typeof value !== "string" || !/(?:\$\{[A-Za-z_][A-Za-z0-9_]*\}|\$[A-Za-z_][A-Za-z0-9_]*|env:[A-Za-z_][A-Za-z0-9_]*|vault:[^\s]+)/.test(value))) {
            throw new Error(`Possible literal credential in MCP ${field}.${name}; use a secret reference.`);
          }
        }
      }
    }
  }
  if (!seen.has("agentplaybook.json")) throw new Error("Snapshot has no agentplaybook.json.");
  const hash = createHash("sha256");
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    hash.update(file.path);
    hash.update("\0");
    hash.update(Buffer.from(file.content, "base64"));
    hash.update("\0");
  }
  return { snapshot: candidate as PortableSnapshot, digest: `sha256:${hash.digest("hex")}` };
}
