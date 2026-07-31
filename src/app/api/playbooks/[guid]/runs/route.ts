import { handle } from "hono/vercel";
import { createApiApp } from "@/app/api/_shared/hono";
import { getServiceSupabase } from "@/app/api/_shared/supabase";
import { getAuthenticatedUser, validateApiKey } from "@/app/api/_shared/auth";
import { getPlaybookByGuid } from "@/app/api/_shared/guards";

const app = createApiApp("/api/playbooks/:guid/runs");

app.get("/", async (c) => {
  const guid = c.req.param("guid") || "";
  const apiKey = await validateApiKey(c.req.raw, "canvas:read");
  const user = apiKey ? null : await getAuthenticatedUser(c.req.raw);
  const playbook = apiKey?.playbooks.guid === guid
    ? apiKey.playbooks
    : await getPlaybookByGuid(guid, user?.id || null);
  if (!playbook) return c.json({ error: "Playbook not found or access denied" }, 404);

  let query = getServiceSupabase().from("playbook_runs").select("*").eq("playbook_id", playbook.id);
  if (!apiKey && user && "user_id" in playbook && playbook.user_id !== user.id) query = query.eq("created_by", user.id);
  const { data, error } = await query.order("updated_at", { ascending: false });
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data || []);
});

app.post("/", async (c) => {
  const guid = c.req.param("guid") || "";
  const apiKey = await validateApiKey(c.req.raw, "canvas:write");
  const user = apiKey ? null : await getAuthenticatedUser(c.req.raw);
  const playbook = apiKey?.playbooks.guid === guid
    ? apiKey.playbooks
    : await getPlaybookByGuid(guid, user?.id || null);
  if (!playbook || (!apiKey && !user)) return c.json({ error: "Unauthorized or forbidden" }, 403);

  const body = await c.req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return c.json({ error: "Name is required" }, 400);
  const { data, error } = await getServiceSupabase()
    .from("playbook_runs")
    .insert({
      playbook_id: playbook.id,
      created_by: user?.id || null,
      name,
      status: "active",
      context: body.context || {},
    })
    .select()
    .single();
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data, 201);
});

export const GET = handle(app);
export const POST = handle(app);
