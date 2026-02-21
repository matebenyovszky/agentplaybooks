import { handle } from "hono/vercel";
import { createApiApp } from "@/app/api/_shared/hono";
import { getServiceSupabase } from "@/app/api/_shared/supabase";
import { requireAuth, validateApiKey } from "@/app/api/_shared/auth";
import { getPlaybookByGuid } from "@/app/api/_shared/guards";

const app = createApiApp("/api/playbooks/:guid/memory/:key");

app.put("/", async (c) => {
  const guid = c.req.param("guid");
  const key = c.req.param("key");

  if (!guid) {
    return c.json({ error: "Missing playbook GUID" }, 400);
  }
  if (!key) {
    return c.json({ error: "Missing memory key" }, 400);
  }

  const apiKeyData = await validateApiKey(c.req.raw, "memory:write");
  if (apiKeyData) {
    if (apiKeyData.playbooks.guid !== guid) {
      return c.json({ error: "API key does not match playbook" }, 403);
    }
  } else {
    const user = await requireAuth(c.req.raw);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const playbook = await getPlaybookByGuid(guid, user.id);
    if (!playbook || playbook.user_id !== user.id) {
      return c.json({ error: "Forbidden" }, 403);
    }
  }

  const body = await c.req.json();
  const { value, tags, description, tier, priority, parent_key, summary, memory_type, status, metadata } = body;

  if (value === undefined) {
    return c.json({ error: "Value is required" }, 400);
  }

  if (tags !== undefined && !Array.isArray(tags)) {
    return c.json({ error: "Tags must be an array of strings" }, 400);
  }

  const supabase = getServiceSupabase();

  const { data: playbook } = await supabase
    .from("playbooks")
    .select("id")
    .eq("guid", guid)
    .single();

  if (!playbook) {
    return c.json({ error: "Playbook not found" }, 404);
  }

  const upsertData: Record<string, unknown> = {
    playbook_id: playbook.id,
    key,
    value,
    updated_at: new Date().toISOString(),
  };

  if (tags !== undefined) upsertData.tags = tags;
  if (description !== undefined) upsertData.description = description;
  if (tier !== undefined) upsertData.tier = tier;
  if (priority !== undefined) upsertData.priority = Math.min(100, Math.max(1, priority));
  if (parent_key !== undefined) upsertData.parent_key = parent_key;
  if (summary !== undefined) upsertData.summary = summary;
  if (memory_type !== undefined) upsertData.memory_type = memory_type;
  if (status !== undefined) upsertData.status = status;
  if (metadata !== undefined) upsertData.metadata = metadata;

  const { data, error } = await supabase
    .from("memories")
    .upsert(upsertData, {
      onConflict: "playbook_id,key",
    })
    .select("key, value, tags, description, tier, priority, parent_key, summary, memory_type, status, metadata, updated_at")
    .single();

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json(data);
});

app.delete("/", async (c) => {
  const guid = c.req.param("guid");
  const key = c.req.param("key");

  if (!guid) {
    return c.json({ error: "Missing playbook GUID" }, 400);
  }

  if (!key) {
    return c.json({ error: "Missing memory key" }, 400);
  }
  if (!key) {
    return c.json({ error: "Missing memory key" }, 400);
  }

  const apiKeyData = await validateApiKey(c.req.raw, "memory:write");
  if (apiKeyData) {
    if (apiKeyData.playbooks.guid !== guid) {
      return c.json({ error: "API key does not match playbook" }, 403);
    }
  } else {
    const user = await requireAuth(c.req.raw);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const playbook = await getPlaybookByGuid(guid, user.id);
    if (!playbook || playbook.user_id !== user.id) {
      return c.json({ error: "Forbidden" }, 403);
    }
  }

  const supabase = getServiceSupabase();

  const { data: playbook } = await supabase
    .from("playbooks")
    .select("id")
    .eq("guid", guid)
    .single();

  if (!playbook) {
    return c.json({ error: "Playbook not found" }, 404);
  }

  const { error } = await supabase
    .from("memories")
    .delete()
    .eq("playbook_id", playbook.id)
    .eq("key", key);

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ success: true });
});

export const PUT = handle(app);
export const DELETE = handle(app);
