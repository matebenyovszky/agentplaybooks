/**
 * Reading the playbook audit trail.
 *
 * One handler, registered at both paths it needs to answer on: the
 * playbook-scoped `/api/playbooks/:guid/audit`, which is where the rest of a
 * playbook's data lives, and `/api/mcp/audit/:guid`, which existed first and
 * keeps working. Federated calls and vault operations come out of the same
 * table, told apart by the `secret.` prefix on `operation`.
 *
 * Owner access only, and deliberately not reachable with a playbook API key:
 * the credential that performs vault operations should not also be the one
 * that reads the record of them. A user (control-plane) key or the owner's
 * session both work.
 */

import { createApiApp } from "@/app/api/_shared/hono";
import { getUserFromAuthOrApiKey } from "@/app/api/_shared/auth";
import { getServiceSupabase } from "@/app/api/_shared/supabase";
import type { Context } from "hono";
import { playbookIdentifierColumn } from "@/lib/playbook-identifier";

const app = createApiApp();

async function readAuditLogs(c: Context) {
  const guid = c.req.param("guid");
  if (!guid) return c.json({ error: "Missing playbook GUID" }, 400);

  const user = await getUserFromAuthOrApiKey(c.req.raw, "playbooks:read");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const supabase = getServiceSupabase();
  const { data: playbook } = await supabase
    .from("playbooks")
    .select("id")
    .eq(playbookIdentifierColumn(guid), guid)
    .eq("user_id", user.id)
    .single();
  if (!playbook) return c.json({ error: "Playbook not found" }, 404);

  const requestedLimit = Number(c.req.query("limit") || 100);
  const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 100, 1), 500);

  let query = supabase
    .from("audit_logs")
    .select("id, mcp_server_id, operation, target, status, latency_ms, error_code, actor_type, actor_id, secret_name, request_id, created_at")
    .eq("playbook_id", playbook.id);

  // `operation` takes exact names ("secret.use") or the `secret.` prefix on its
  // own to mean every vault event.
  const operations = (c.req.query("operation") || "")
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

  const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);
  if (error) return c.json({ error: error.message }, 500);

  return c.json({ logs: data || [] });
}

app.get("/api/playbooks/:guid/audit", readAuditLogs);
app.get("/api/mcp/audit/:guid", readAuditLogs);

export { app };
