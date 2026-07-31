import { handle } from "hono/vercel";
import { createApiApp } from "@/app/api/_shared/hono";
import { getServiceSupabase } from "@/app/api/_shared/supabase";
import { requireAuth, validateApiKey } from "@/app/api/_shared/auth";
import { checkPlaybookWriteAccess, getPlaybookByGuid } from "@/app/api/_shared/guards";

const app = createApiApp("/api/playbooks/:guid/runs/:runId");

async function authorize(request: Request, guid: string, runId: string) {
  const apiKey = await validateApiKey(request, "canvas:write");
  if (apiKey) return apiKey.playbooks.guid === guid ? apiKey.playbooks : null;

  const user = await requireAuth(request);
  if (!user) return null;
  const playbook = await getPlaybookByGuid(guid, user.id);
  if (!playbook) return null;
  const { data: run } = await getServiceSupabase()
    .from("playbook_runs")
    .select("id, created_by")
    .eq("id", runId)
    .eq("playbook_id", playbook.id)
    .single();
  if (!run) return null;
  return (await checkPlaybookWriteAccess(user.id, playbook.id)) || run.created_by === user.id
    ? playbook
    : null;
}

app.patch("/", async (c) => {
  const guid = c.req.param("guid") || "";
  const runId = c.req.param("runId") || "";
  const playbook = await authorize(c.req.raw, guid, runId);
  if (!playbook) return c.json({ error: "Unauthorized or forbidden" }, 403);

  const body = await c.req.json();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.name === "string" && body.name.trim()) updates.name = body.name.trim();
  if (["active", "completed", "archived"].includes(body.status)) updates.status = body.status;
  if (body.context && typeof body.context === "object") updates.context = body.context;

  const { data, error } = await getServiceSupabase()
    .from("playbook_runs")
    .update(updates)
    .eq("id", runId)
    .eq("playbook_id", playbook.id)
    .select()
    .single();
  if (error || !data) return c.json({ error: error?.message || "Workflow run not found" }, 404);
  return c.json(data);
});

app.delete("/", async (c) => {
  const guid = c.req.param("guid") || "";
  const runId = c.req.param("runId") || "";
  const playbook = await authorize(c.req.raw, guid, runId);
  if (!playbook) return c.json({ error: "Unauthorized or forbidden" }, 403);

  const { error } = await getServiceSupabase()
    .from("playbook_runs")
    .delete()
    .eq("id", runId)
    .eq("playbook_id", playbook.id);
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ success: true });
});

export const PATCH = handle(app);
export const DELETE = handle(app);
