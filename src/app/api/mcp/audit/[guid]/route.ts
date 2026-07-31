import { handle } from "hono/vercel";
import { createApiApp } from "@/app/api/_shared/hono";
import { getUserFromAuthOrApiKey } from "@/app/api/_shared/auth";
import { getServiceSupabase } from "@/app/api/_shared/supabase";

const app = createApiApp("/api/mcp/audit/:guid");

app.get("/", async (c) => {
  const guid = c.req.param("guid");
  if (!guid) return c.json({ error: "Missing playbook GUID" }, 400);
  const user = await getUserFromAuthOrApiKey(c.req.raw, "playbooks:read");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const supabase = getServiceSupabase();
  const { data: playbook } = await supabase
    .from("playbooks")
    .select("id")
    .eq("guid", guid)
    .eq("user_id", user.id)
    .single();
  if (!playbook) return c.json({ error: "Playbook not found" }, 404);
  const requestedLimit = Number(c.req.query("limit") || 100);
  const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 100, 1), 500);
  const { data, error } = await supabase
    .from("mcp_proxy_audit_logs")
    .select("id, mcp_server_id, operation, target, status, latency_ms, error_code, request_id, created_at")
    .eq("playbook_id", playbook.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ logs: data || [] });
});

export const GET = handle(app);
