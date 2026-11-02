/**
 * Reading, exporting, verifying, and purging the playbook audit trail.
 *
 * Owner or auditor only. A playbook API key that performs vault operations
 * still cannot read the record of them; a dedicated `auditor` playbook key
 * can. User keys need `playbooks:read` or `audit:read`.
 */

import { createApiApp } from "@/app/api/_shared/hono";
import {
  getAuthenticatedUser,
  validateApiKey,
  validateUserApiKey,
} from "@/app/api/_shared/auth";
import { getPlaybookAccessRole } from "@/app/api/_shared/guards";
import { getServiceSupabase } from "@/app/api/_shared/supabase";
import { playbookIdentifierColumn } from "@/lib/playbook-identifier";
import {
  GENESIS_HASH,
  formatAuditExport,
  orderByChainLinks,
  parseAuditExportFormat,
  verifyAuditChain,
  type AuditChainEntry,
} from "@/lib/audit-chain";
import { auditRetentionDays, roleMayReadAudit } from "@/lib/audit-access";
import type { Context } from "hono";

const app = createApiApp();

const AUDIT_COLUMNS =
  "id, playbook_id, mcp_server_id, operation, target, status, latency_ms, error_code, actor_type, actor_id, secret_name, request_id, created_at, prev_hash, hash";

type AuditAuth =
  | { playbook: { id: string; guid: string | null; user_id: string }; role: "owner" | "auditor" }
  | { error: 401 | 404; message: string };

async function authorizeAuditAccess(request: Request, guid: string): Promise<AuditAuth> {
  const supabase = getServiceSupabase();
  const { data: playbook } = await supabase
    .from("playbooks")
    .select("id, guid, user_id")
    .eq(playbookIdentifierColumn(guid), guid)
    .maybeSingle();
  if (!playbook) return { error: 404, message: "Playbook not found" };

  const playbookKey = await validateApiKey(request, "audit:read");
  if (playbookKey?.playbooks.id === playbook.id && playbookKey.role === "auditor") {
    return { playbook, role: "auditor" };
  }

  const session = await getAuthenticatedUser(request);
  if (session) {
    const role = await getPlaybookAccessRole(session.id, playbook.id);
    if (roleMayReadAudit(role)) return { playbook, role: role === "owner" ? "owner" : "auditor" };
    return { error: 404, message: "Playbook not found" };
  }

  const userKey = await validateUserApiKey(request, "audit:read")
    ?? await validateUserApiKey(request, "playbooks:read");
  if (!userKey) return { error: 401, message: "Unauthorized" };

  const role = await getPlaybookAccessRole(userKey.user_id, playbook.id);
  if (roleMayReadAudit(role)) return { playbook, role: role === "owner" ? "owner" : "auditor" };
  return { error: 404, message: "Playbook not found" };
}

type AuditQuery = {
  like: (column: string, value: string) => AuditQuery;
  in: (column: string, values: string[]) => AuditQuery;
  eq: (column: string, value: string) => AuditQuery;
  gte: (column: string, value: string) => AuditQuery;
  lte: (column: string, value: string) => AuditQuery;
  order: (column: string, options: { ascending: boolean }) => AuditQuery;
  range: (from: number, to: number) => PromiseLike<{ data: AuditChainEntry[] | null; error: { message: string } | null }>;
};

function applyFilters(query: AuditQuery, c: Context): AuditQuery {
  const operations = (c.req.query("action") || c.req.query("operation") || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const prefixes = operations.filter((entry) => entry.endsWith("."));
  const exact = operations.filter((entry) => !entry.endsWith("."));
  if (prefixes.length === 1 && exact.length === 0) {
    query = query.like("operation", `${prefixes[0]}%`);
  } else if (exact.length > 0) {
    query = query.in("operation", exact);
  }

  const secretName = c.req.query("secret");
  if (secretName) query = query.eq("secret_name", secretName);

  const actor = c.req.query("actor");
  if (actor) query = query.eq("actor_id", actor);

  const actorType = c.req.query("actor_type");
  if (actorType) query = query.eq("actor_type", actorType);

  const since = c.req.query("since");
  if (since) query = query.gte("created_at", since);

  const until = c.req.query("until");
  if (until) query = query.lte("created_at", until);

  return query;
}

async function loadFilteredLogs(
  playbookId: string,
  c: Context,
  options: { ascending: boolean; limit?: number; maxRows?: number },
): Promise<{ logs: AuditChainEntry[]; error: string | null }> {
  const supabase = getServiceSupabase();
  const pageSize = 500;
  const maxRows = options.maxRows ?? options.limit ?? 500;
  const logs: AuditChainEntry[] = [];

  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const take = Math.min(pageSize, maxRows - offset);
    let query = applyFilters(
      supabase.from("audit_logs").select(AUDIT_COLUMNS).eq("playbook_id", playbookId) as unknown as AuditQuery,
      c,
    );
    query = query.order("created_at", { ascending: options.ascending }).order("id", { ascending: options.ascending });
    const { data, error } = await query.range(offset, offset + take - 1);
    if (error) return { logs, error: error.message };
    const rows = (data || []) as AuditChainEntry[];
    logs.push(...rows);
    if (rows.length < take) break;
  }
  return { logs, error: null };
}

async function readAuditLogs(c: Context, formatDefault = "json") {
  const guid = c.req.param("guid");
  if (!guid) return c.json({ error: "Missing playbook GUID" }, 400);

  const auth = await authorizeAuditAccess(c.req.raw, guid);
  if ("error" in auth) return c.json({ error: auth.message }, auth.error);

  const format = parseAuditExportFormat(c.req.query("format") || formatDefault);
  if (!format) return c.json({ error: "format must be json, jsonl, or csv" }, 400);

  const requestedLimit = Number(c.req.query("limit") || (format === "json" ? 100 : 10000));
  const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 100, 1), format === "json" ? 500 : 10000);

  const { logs, error } = await loadFilteredLogs(auth.playbook.id, c, {
    ascending: format !== "json",
    limit,
    maxRows: limit,
  });
  if (error) return c.json({ error }, 500);

  if (format === "json") return c.json({ logs });
  const body = formatAuditExport(logs, format);
  return c.body(body, 200, {
    "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "application/x-ndjson; charset=utf-8",
  });
}

async function loadChainLogs(
  playbookId: string,
): Promise<{ logs: AuditChainEntry[]; error: string | null; overflow?: boolean }> {
  const supabase = getServiceSupabase();
  // Fetch only IDs first: large trails must not be downloaded or hashed in an
  // HTTP Worker. The operator verifier can check the complete trail offline.
  const onlineLimit = 500;
  const { data: ids, error } = await supabase.from("audit_logs").select("id")
    .eq("playbook_id", playbookId).limit(onlineLimit + 1);
  if (error) return { logs: [], error: error.message };
  if ((ids?.length ?? 0) > onlineLimit) return { logs: [], error: "Audit trail exceeds the 500-row online verification limit; run the operator hash-chain verifier (npm run audit:chain)", overflow: true };
  // IDs pin the set even if more rows are appended between the two reads.
  // A retention purge or missing row must never yield a successful partial check.
  if (!ids?.length) return { logs: [], error: null };
  const { data, error: rowsError } = await supabase.from("audit_logs").select(AUDIT_COLUMNS)
    .eq("playbook_id", playbookId).in("id", ids.map(row => row.id));
  if (rowsError) return { logs: [], error: rowsError.message };
  if (data?.length !== ids.length) return { logs: [], error: "Audit trail changed during verification; retry the check" };
  return { logs: data as AuditChainEntry[], error: null };
}

async function downloadAuditBundle(c: Context) {
  const guid = c.req.param("guid");
  if (!guid) return c.json({ error: "Missing playbook GUID" }, 400);
  const auth = await authorizeAuditAccess(c.req.raw, guid);
  if ("error" in auth) return c.json({ error: auth.message }, auth.error);
  // A filtered excerpt cannot be presented as an independently linked chain.
  if (new URL(c.req.url).search) {
    return c.json({ error: "Audit bundles include the retained trail without filters. Remove query parameters." }, 400);
  }
  const collectionStartedAt = new Date().toISOString();
  const { data: checkpoint, error: checkpointError } = await getServiceSupabase()
    .from("audit_chain_checkpoints")
    .select("anchor_hash, purged_through, purged_through_id, purged_count, created_at")
    .eq("playbook_id", auth.playbook.id)
    .order("checkpoint_seq", { ascending: false }).limit(1).maybeSingle();
  if (checkpointError) return c.json({ error: "Could not read the audit checkpoint. Retry the export." }, 500);
  // Bound memory usage on Workers. Overflow is an error, never a partial ZIP.
  const { logs, error, overflow } = await loadChainLogs(auth.playbook.id);
  if (error) return c.json({ error: overflow
    ? "Audit bundle exceeds the 500-row online verification limit. Ask the operator for a database export and chain verification; no partial bundle was created."
    : "Could not read the audit trail. Retry the export." }, overflow ? 413 : 500);
  const startHash = checkpoint?.anchor_hash || GENESIS_HASH;
  const ordered = orderByChainLinks(logs, startHash);
  const report = verifyAuditChain(ordered, startHash);
  if (!report.ok) return c.json({ error: "Audit chain verification failed or the trail changed during collection. Retry or ask the operator to investigate.", verification: report }, 409);
  const { buildAuditBundle } = await import("@/lib/audit-bundle");
  const bytes = await buildAuditBundle({
    playbookId: auth.playbook.id, logs: ordered, report, checkpoint: checkpoint || null,
    retentionDays: auditRetentionDays(), collectionStartedAt,
  });
  return new Response(bytes as Uint8Array<ArrayBuffer>, { headers: {
    "Content-Type": "application/zip",
    "Content-Disposition": 'attachment; filename="agentplaybooks-audit.zip"',
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  } });
}

async function verifyAuditLogs(c: Context) {
  const guid = c.req.param("guid");
  if (!guid) return c.json({ error: "Missing playbook GUID" }, 400);

  const auth = await authorizeAuditAccess(c.req.raw, guid);
  if ("error" in auth) return c.json({ error: auth.message }, auth.error);

  const supabase = getServiceSupabase();
  const { data: checkpoint } = await supabase
    .from("audit_chain_checkpoints")
    .select("anchor_hash, purged_through, purged_through_id, purged_count, created_at")
    .eq("playbook_id", auth.playbook.id)
    .order("checkpoint_seq", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { logs, error, overflow } = await loadChainLogs(auth.playbook.id);
  if (error) return c.json({ error }, overflow ? 413 : 500);

  const startHash = checkpoint?.anchor_hash || GENESIS_HASH;
  const report = verifyAuditChain(orderByChainLinks(logs, startHash), startHash);
  return c.json({
    ...report,
    playbook_id: auth.playbook.id,
    checkpoint: checkpoint || null,
    first_broken_link: report.broken,
  }, report.ok ? 200 : 409);
}

async function purgePlaybookAudit(c: Context) {
  const guid = c.req.param("guid");
  if (!guid) return c.json({ error: "Missing playbook GUID" }, 400);

  const auth = await authorizeAuditAccess(c.req.raw, guid);
  if ("error" in auth) return c.json({ error: auth.message }, auth.error);
  if (auth.role !== "owner") return c.json({ error: "Forbidden" }, 403);

  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const days = typeof body.days === "number" ? Math.floor(body.days) : auditRetentionDays();
  if (!days || days < 1) {
    return c.json({ error: "Retention is keep-forever; pass { days } to purge explicitly" }, 400);
  }

  const user = await getAuthenticatedUser(c.req.raw);
  const olderThan = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await getServiceSupabase().rpc("purge_audit_logs", {
    p_older_than: olderThan,
    p_playbook_id: auth.playbook.id,
    p_actor_type: "owner",
    p_actor_id: user?.id ?? "owner",
  });
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data ?? { purged: 0, older_than: olderThan });
}

app.get("/api/playbooks/:guid/audit", (c) => readAuditLogs(c));
app.get("/api/mcp/audit/:guid", (c) => readAuditLogs(c));
app.get("/api/playbooks/:guid/audit/export", (c) => readAuditLogs(c, "jsonl"));
app.get("/api/playbooks/:guid/audit/bundle", downloadAuditBundle);
app.get("/api/playbooks/:guid/audit/verify", verifyAuditLogs);
app.post("/api/playbooks/:guid/audit/purge", purgePlaybookAudit);

export { app, authorizeAuditAccess };
