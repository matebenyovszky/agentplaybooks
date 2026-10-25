// Native Request/Response handler: shared by Next.js and the Worker dispatcher.
// @worker-native
import { getServiceSupabase } from "@/app/api/_shared/supabase";
import { auditRetentionDays } from "@/lib/audit-access";

/**
 * Instance-wide retention purge. Off unless AUDIT_RETENTION_DAYS is a positive
 * integer. Authenticated with AUDIT_CRON_SECRET (or CRON_SECRET) so a systemd
 * timer or external scheduler can hit it without a user session.
 */
export async function POST(request: Request) {
  const expected = process.env.AUDIT_CRON_SECRET || process.env.CRON_SECRET;
  if (!expected) return Response.json({ error: "Not found" }, { status: 404 });

  const header = request.headers.get("authorization") || "";
  const presented = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : header;
  if (!presented || presented !== expected) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const days = auditRetentionDays();
  if (!days) {
    return Response.json({ purged: 0, playbooks: 0, kept: "forever" });
  }

  const olderThan = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await getServiceSupabase().rpc("purge_audit_logs", {
    p_older_than: olderThan,
    p_playbook_id: null,
    p_actor_type: "system",
    p_actor_id: "retention",
  });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data ?? { purged: 0, older_than: olderThan });
}
