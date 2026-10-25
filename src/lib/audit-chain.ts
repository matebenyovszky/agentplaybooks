/**
 * Per-playbook audit hash chain.
 *
 * Each row stores `prev_hash` and `hash = sha256(canonical JSON)`, where the
 * canonical JSON includes `prev_hash` and every other persisted field except
 * `hash` itself. The first row of a playbook (or the first row after a
 * retention purge) chains from `GENESIS_HASH`, or from a recorded checkpoint
 * hash when a prefix has been deleted.
 *
 * Field names and order are part of the interop contract with
 * `public.audit_log_canonical` in the compliance migration. Do not reorder
 * them or drop nulls.
 */

import { createHash } from "node:crypto";

export const GENESIS_HASH = "0".repeat(64);

export const AUDIT_CHAIN_FIELDS = [
  "actor_id",
  "actor_type",
  "created_at",
  "error_code",
  "id",
  "latency_ms",
  "mcp_server_id",
  "operation",
  "playbook_id",
  "prev_hash",
  "request_id",
  "secret_name",
  "status",
  "target",
] as const;

export type AuditChainField = (typeof AUDIT_CHAIN_FIELDS)[number];

export type AuditChainEntry = {
  id: string;
  playbook_id: string;
  mcp_server_id?: string | null;
  operation: string;
  target?: string | null;
  status: string;
  latency_ms?: number | null;
  error_code?: string | null;
  actor_type?: string | null;
  actor_id?: string | null;
  secret_name?: string | null;
  request_id?: string | null;
  created_at: string;
  prev_hash?: string | null;
  hash?: string | null;
};

export type AuditChainCheckpoint = {
  playbook_id: string;
  anchor_hash: string;
  purged_through: string;
  purged_through_id: string | null;
  purged_count: number;
};

export function auditTimestamp(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid audit timestamp: ${String(value)}`);
  }
  return date.toISOString();
}

function jsonToken(value: unknown): string {
  if (value === undefined || value === null) return "null";
  return JSON.stringify(value);
}

/**
 * Canonical JSON of one chain link. Nulls are kept; keys are alphabetical and
 * match `AUDIT_CHAIN_FIELDS`.
 */
export function canonicalAuditJson(entry: AuditChainEntry, prevHash = entry.prev_hash ?? GENESIS_HASH): string {
  const values: Record<AuditChainField, unknown> = {
    actor_id: entry.actor_id ?? null,
    actor_type: entry.actor_type ?? null,
    created_at: auditTimestamp(entry.created_at),
    error_code: entry.error_code ?? null,
    id: entry.id,
    latency_ms: Number(entry.latency_ms ?? 0),
    mcp_server_id: entry.mcp_server_id ?? null,
    operation: entry.operation,
    playbook_id: entry.playbook_id,
    prev_hash: prevHash || GENESIS_HASH,
    request_id: entry.request_id ?? null,
    secret_name: entry.secret_name ?? null,
    status: entry.status,
    target: entry.target ?? null,
  };
  return `{${AUDIT_CHAIN_FIELDS.map((key) => `${JSON.stringify(key)}:${jsonToken(values[key])}`).join(",")}}`;
}

export function hashAuditCanonical(canonical: string): string {
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function hashAuditEntry(entry: AuditChainEntry, prevHash = entry.prev_hash ?? GENESIS_HASH): string {
  return hashAuditCanonical(canonicalAuditJson(entry, prevHash));
}

export function linkAuditEntry<T extends AuditChainEntry>(entry: T, prevHash: string): T & { prev_hash: string; hash: string } {
  const hash = hashAuditEntry(entry, prevHash);
  return { ...entry, prev_hash: prevHash, hash };
}

export function buildAuditChain<T extends AuditChainEntry>(
  entries: T[],
  startHash = GENESIS_HASH,
): Array<T & { prev_hash: string; hash: string }> {
  let prev = startHash;
  return entries.map((entry) => {
    const linked = linkAuditEntry(entry, prev);
    prev = linked.hash;
    return linked;
  });
}

export type AuditChainBreak = {
  index: number;
  id: string;
  reason: "prev_hash" | "hash";
  expected: string;
  actual: string | null;
};

export type AuditChainReport = {
  ok: boolean;
  checked: number;
  start_hash: string;
  tip_hash: string | null;
  broken: AuditChainBreak | null;
};

export function verifyAuditChain(
  entries: AuditChainEntry[],
  startHash = GENESIS_HASH,
): AuditChainReport {
  let expectedPrev = startHash || GENESIS_HASH;
  let tip: string | null = null;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const actualPrev = entry.prev_hash ?? null;
    if (actualPrev !== expectedPrev) {
      return {
        ok: false,
        checked: index,
        start_hash: startHash,
        tip_hash: tip,
        broken: {
          index,
          id: entry.id,
          reason: "prev_hash",
          expected: expectedPrev,
          actual: actualPrev,
        },
      };
    }
    const expectedHash = hashAuditEntry(entry, expectedPrev);
    const actualHash = entry.hash ?? null;
    if (actualHash !== expectedHash) {
      return {
        ok: false,
        checked: index,
        start_hash: startHash,
        tip_hash: tip,
        broken: {
          index,
          id: entry.id,
          reason: "hash",
          expected: expectedHash,
          actual: actualHash,
        },
      };
    }
    expectedPrev = expectedHash;
    tip = expectedHash;
  }
  return {
    ok: true,
    checked: entries.length,
    start_hash: startHash,
    tip_hash: tip,
    broken: null,
  };
}

/**
 * Follow `prev_hash` pointers from genesis/checkpoint. `created_at, id` is not
 * insertion order when several rows share a transaction `now()`.
 */
export function orderByChainLinks<T extends AuditChainEntry>(
  entries: T[],
  startHash = GENESIS_HASH,
): T[] {
  const byPrev = new Map<string, T>();
  for (const entry of entries) {
    const key = entry.prev_hash ?? startHash;
    if (!byPrev.has(key)) byPrev.set(key, entry);
  }
  const ordered: T[] = [];
  const seen = new Set<string>();
  let key = startHash || GENESIS_HASH;
  while (byPrev.has(key)) {
    const entry = byPrev.get(key)!;
    if (seen.has(entry.id)) break;
    ordered.push(entry);
    seen.add(entry.id);
    key = entry.hash ?? "";
    if (!key) break;
  }
  for (const entry of entries) {
    if (!seen.has(entry.id)) ordered.push(entry);
  }
  return ordered;
}

export const AUDIT_CSV_COLUMNS = [
  "id",
  "playbook_id",
  "created_at",
  "operation",
  "status",
  "actor_type",
  "actor_id",
  "target",
  "secret_name",
  "error_code",
  "request_id",
  "mcp_server_id",
  "latency_ms",
  "prev_hash",
  "hash",
] as const;

export type AuditExportFormat = "json" | "jsonl" | "csv";

function csvCell(value: unknown): string {
  if (value === undefined || value === null) return "";
  const raw = String(value);
  // Audit fields can contain caller-controlled text. Quoting alone does not
  // stop spreadsheet programs from interpreting an exported cell as a formula.
  const text = typeof value === "string" && /^[\s\u0000]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function auditLogToExportRow(entry: AuditChainEntry): Record<(typeof AUDIT_CSV_COLUMNS)[number], string | number | null> {
  return {
    id: entry.id,
    playbook_id: entry.playbook_id,
    created_at: typeof entry.created_at === "string" ? entry.created_at : auditTimestamp(entry.created_at),
    operation: entry.operation,
    status: entry.status,
    actor_type: entry.actor_type ?? null,
    actor_id: entry.actor_id ?? null,
    target: entry.target ?? null,
    secret_name: entry.secret_name ?? null,
    error_code: entry.error_code ?? null,
    request_id: entry.request_id ?? null,
    mcp_server_id: entry.mcp_server_id ?? null,
    latency_ms: Number(entry.latency_ms ?? 0),
    prev_hash: entry.prev_hash ?? null,
    hash: entry.hash ?? null,
  };
}

export function formatAuditJsonl(entries: AuditChainEntry[]): string {
  return entries.map((entry) => JSON.stringify(auditLogToExportRow(entry))).join("\n") + (entries.length ? "\n" : "");
}

export function formatAuditCsv(entries: AuditChainEntry[]): string {
  const header = AUDIT_CSV_COLUMNS.join(",");
  const lines = entries.map((entry) => {
    const row = auditLogToExportRow(entry);
    return AUDIT_CSV_COLUMNS.map((column) => csvCell(row[column])).join(",");
  });
  return [header, ...lines].join("\n") + "\n";
}

export function formatAuditExport(entries: AuditChainEntry[], format: AuditExportFormat): string {
  if (format === "csv") return formatAuditCsv(entries);
  if (format === "jsonl") return formatAuditJsonl(entries);
  return `${JSON.stringify({ logs: entries.map(auditLogToExportRow) })}\n`;
}

export function parseAuditExportFormat(value: string | null | undefined): AuditExportFormat | null {
  if (!value) return "json";
  const normalized = value.trim().toLowerCase();
  if (normalized === "json" || normalized === "jsonl" || normalized === "ndjson" || normalized === "csv") {
    return normalized === "ndjson" ? "jsonl" : normalized;
  }
  return null;
}
