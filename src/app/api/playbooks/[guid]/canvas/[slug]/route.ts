import { handle } from "hono/vercel";
import { createApiApp } from "@/app/api/_shared/hono";
import { getServiceSupabase } from "@/app/api/_shared/supabase";
import { getAuthenticatedUser, requireAuth, validateApiKey } from "@/app/api/_shared/auth";
import { checkPlaybookWriteAccess, getPlaybookByGuid } from "@/app/api/_shared/guards";
import { applyCanvasPatch, slugifyCanvasName, type CanvasPatchOperation } from "@/lib/canvas";

const app = createApiApp("/api/playbooks/:guid/canvas/:slug");

async function authorize(request: Request, guid: string, permission: "canvas:read" | "canvas:write", runId?: string) {
  const apiKey = await validateApiKey(request, permission);
  if (apiKey) return apiKey.playbooks.guid === guid ? apiKey.playbooks : null;

  if (permission === "canvas:read") {
    const user = await getAuthenticatedUser(request);
    if (!user || !runId) return null;
    const playbook = await getPlaybookByGuid(guid, user.id);
    if (!playbook) return null;
    const { data: run } = await getServiceSupabase().from("playbook_runs").select("id, created_by").eq("id", runId).eq("playbook_id", playbook.id).single();
    return run ? playbook : null;
  }

  const user = await requireAuth(request);
  if (!user) return null;
  const playbook = await getPlaybookByGuid(guid, user.id);
  if (!playbook || !runId) return null;
  const { data: run } = await getServiceSupabase().from("playbook_runs").select("id, created_by").eq("id", runId).eq("playbook_id", playbook.id).single();
  if (!run) return null;
  return (await checkPlaybookWriteAccess(user.id, playbook.id)) || run.created_by === user.id
    ? playbook
    : null;
}

async function getCanvas(playbookId: string, runId: string, slug: string) {
  return getServiceSupabase()
    .from("canvas")
    .select("*")
    .eq("playbook_id", playbookId)
    .eq("run_id", runId)
    .eq("slug", slug)
    .single();
}

app.get("/", async (c) => {
  const guid = c.req.param("guid") || "";
  const slug = c.req.param("slug") || "";
  const runId = c.req.query("runId") || "";
  if (!runId) return c.json({ error: "runId is required" }, 400);
  const playbook = await authorize(c.req.raw, guid, "canvas:read", runId);
  if (!playbook) return c.json({ error: "Playbook not found or access denied" }, 404);

  const { data, error } = await getCanvas(playbook.id, runId, slug);
  if (error || !data) return c.json({ error: "Canvas document not found" }, 404);
  return c.json(data);
});

app.put("/", async (c) => {
  const guid = c.req.param("guid") || "";
  const slug = c.req.param("slug") || "";
  const runId = c.req.query("runId") || "";
  if (!runId) return c.json({ error: "runId is required" }, 400);
  const playbook = await authorize(c.req.raw, guid, "canvas:write", runId);
  if (!playbook) return c.json({ error: "Unauthorized or forbidden" }, 403);
  const body = await c.req.json();
  if (body.content !== undefined && typeof body.content !== "string") {
    return c.json({ error: "Content must be a string" }, 400);
  }
  if (!Number.isInteger(body.expectedVersion)) {
    return c.json({ error: "expectedVersion is required for conflict-safe updates" }, 400);
  }

  const updates: Record<string, unknown> = {
    version: body.expectedVersion + 1,
    updated_at: new Date().toISOString(),
  };
  if (body.name !== undefined) updates.name = String(body.name).trim();
  if (body.slug !== undefined) updates.slug = slugifyCanvasName(String(body.slug));
  if (body.content !== undefined) updates.content = body.content;
  if (body.metadata !== undefined) updates.metadata = body.metadata;
  if (Number.isInteger(body.sort_order)) updates.sort_order = body.sort_order;

  const { data, error } = await getServiceSupabase()
    .from("canvas")
    .update(updates)
    .eq("playbook_id", playbook.id)
    .eq("run_id", runId)
    .eq("slug", slug)
    .eq("version", body.expectedVersion)
    .select()
    .single();

  if (error || !data) return c.json({ error: "Canvas changed since it was read", code: "VERSION_CONFLICT" }, 409);
  return c.json(data);
});

app.patch("/", async (c) => {
  const guid = c.req.param("guid") || "";
  const slug = c.req.param("slug") || "";
  const runId = c.req.query("runId") || "";
  if (!runId) return c.json({ error: "runId is required" }, 400);
  const playbook = await authorize(c.req.raw, guid, "canvas:write", runId);
  if (!playbook) return c.json({ error: "Unauthorized or forbidden" }, 403);
  const body = await c.req.json();
  if (!Number.isInteger(body.expectedVersion)) {
    return c.json({ error: "expectedVersion is required for conflict-safe patches" }, 400);
  }
  if (!["append", "prepend", "replace"].includes(body.operation) || typeof body.content !== "string") {
    return c.json({ error: "A valid operation and string content are required" }, 400);
  }

  const { data: current, error: readError } = await getCanvas(playbook.id, runId, slug);
  if (readError || !current) return c.json({ error: "Canvas document not found" }, 404);
  if (current.version !== body.expectedVersion) {
    return c.json({ error: "Canvas changed since it was read", code: "VERSION_CONFLICT", currentVersion: current.version }, 409);
  }

  let content: string;
  try {
    content = applyCanvasPatch(current.content, body as CanvasPatchOperation);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Invalid patch" }, 422);
  }

  const { data, error } = await getServiceSupabase()
    .from("canvas")
    .update({ content, version: current.version + 1, updated_at: new Date().toISOString() })
    .eq("id", current.id)
    .eq("version", current.version)
    .select()
    .single();

  if (error || !data) return c.json({ error: "Canvas changed since it was read", code: "VERSION_CONFLICT" }, 409);
  return c.json(data);
});

app.delete("/", async (c) => {
  const guid = c.req.param("guid") || "";
  const slug = c.req.param("slug") || "";
  const runId = c.req.query("runId") || "";
  if (!runId) return c.json({ error: "runId is required" }, 400);
  const playbook = await authorize(c.req.raw, guid, "canvas:write", runId);
  if (!playbook) return c.json({ error: "Unauthorized or forbidden" }, 403);

  const { error } = await getServiceSupabase()
    .from("canvas")
    .delete()
    .eq("playbook_id", playbook.id)
    .eq("run_id", runId)
    .eq("slug", slug);

  if (error) return c.json({ error: error.message }, 500);
  return c.json({ success: true });
});

export const GET = handle(app);
export const PUT = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);
