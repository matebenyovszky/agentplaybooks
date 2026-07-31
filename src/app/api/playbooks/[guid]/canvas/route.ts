import { handle } from "hono/vercel";
import { createApiApp } from "@/app/api/_shared/hono";
import { getServiceSupabase } from "@/app/api/_shared/supabase";
import { getAuthenticatedUser, requireAuth, validateApiKey } from "@/app/api/_shared/auth";
import { checkPlaybookWriteAccess, getPlaybookByGuid } from "@/app/api/_shared/guards";
import { slugifyCanvasName } from "@/lib/canvas";

const app = createApiApp("/api/playbooks/:guid/canvas");

async function getReadablePlaybook(request: Request, guid: string, runId: string) {
  const apiKey = await validateApiKey(request, "canvas:read");
  if (apiKey) {
    return apiKey.playbooks.guid === guid ? apiKey.playbooks : null;
  }
  const user = await getAuthenticatedUser(request);
  if (!user) return null;
  const playbook = await getPlaybookByGuid(guid, user.id);
  if (!playbook) return null;
  const { data: run } = await getServiceSupabase().from("playbook_runs").select("id, created_by").eq("id", runId).eq("playbook_id", playbook.id).single();
  return run ? playbook : null;
}

async function getWritablePlaybook(request: Request, guid: string, runId: string) {
  const apiKey = await validateApiKey(request, "canvas:write");
  if (apiKey) {
    return apiKey.playbooks.guid === guid ? apiKey.playbooks : null;
  }
  const user = await requireAuth(request);
  if (!user) return null;
  const playbook = await getPlaybookByGuid(guid, user.id);
  if (!playbook) return null;
  const { data: run } = await getServiceSupabase().from("playbook_runs").select("id, created_by").eq("id", runId).eq("playbook_id", playbook.id).single();
  if (!run) return null;
  return (await checkPlaybookWriteAccess(user.id, playbook.id)) || run.created_by === user.id
    ? playbook
    : null;
}

app.get("/", async (c) => {
  const guid = c.req.param("guid") || "";
  const runId = c.req.query("runId");
  if (!runId) return c.json({ error: "runId is required" }, 400);
  const playbook = await getReadablePlaybook(c.req.raw, guid, runId);
  if (!playbook) return c.json({ error: "Playbook not found or access denied" }, 404);

  const { data, error } = await getServiceSupabase()
    .from("canvas")
    .select("id, name, slug, metadata, sort_order, version, created_at, updated_at")
    .eq("playbook_id", playbook.id)
    .eq("run_id", runId)
    .order("sort_order")
    .order("updated_at", { ascending: false });

  if (error) return c.json({ error: error.message }, 500);
  return c.json(data || []);
});

app.post("/", async (c) => {
  const guid = c.req.param("guid") || "";
  const body = await c.req.json();
  const runId = typeof body.runId === "string" ? body.runId : "";
  if (!runId) return c.json({ error: "runId is required" }, 400);
  const playbook = await getWritablePlaybook(c.req.raw, guid, runId);
  if (!playbook) return c.json({ error: "Unauthorized or forbidden" }, 403);
  const { data: run } = await getServiceSupabase().from("playbook_runs").select("id").eq("id", runId).eq("playbook_id", playbook.id).single();
  if (!run) return c.json({ error: "Workflow run not found" }, 404);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const slug = slugifyCanvasName(typeof body.slug === "string" ? body.slug : name);
  if (!name) return c.json({ error: "Name is required" }, 400);
  if (!slug) return c.json({ error: "A valid slug is required" }, 400);
  if (body.content !== undefined && typeof body.content !== "string") {
    return c.json({ error: "Content must be a string" }, 400);
  }

  const { data, error } = await getServiceSupabase()
    .from("canvas")
    .insert({
      playbook_id: playbook.id,
      run_id: runId,
      name,
      slug,
      content: body.content || "",
      metadata: body.metadata || {},
      sort_order: Number.isInteger(body.sort_order) ? body.sort_order : 0,
    })
    .select()
    .single();

  if (error) {
    return c.json({ error: error.code === "23505" ? "Canvas slug already exists" : error.message }, error.code === "23505" ? 409 : 500);
  }
  return c.json(data, 201);
});

export const GET = handle(app);
export const POST = handle(app);
