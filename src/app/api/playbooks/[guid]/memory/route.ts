import { handle } from "hono/vercel";
import { createApiApp } from "@/app/api/_shared/hono";
import { getServiceSupabase } from "@/app/api/_shared/supabase";
import { getAuthenticatedUser } from "@/app/api/_shared/auth";
import { getPlaybookByGuid } from "@/app/api/_shared/guards";
import type { MemoryTier, MemoryType } from "@/lib/supabase/types";

const app = createApiApp("/api/playbooks/:guid/memory");

app.get("/", async (c) => {
  const guid = c.req.param("guid");
  if (!guid) {
    return c.json({ error: "Missing playbook GUID" }, 400);
  }
  const key = c.req.query("key");
  const search = c.req.query("search");
  const tagsParam = c.req.query("tags");
  const user = await getAuthenticatedUser(c.req.raw);

  const playbook = await getPlaybookByGuid(guid, user ? user.id : null);
  if (!playbook) {
    return c.json({ error: "Playbook not found" }, 404);
  }

  const supabase = getServiceSupabase();

  if (key) {
    const { data, error } = await supabase
      .from("memories")
      .select("key, value, tags, description, tier, priority, parent_key, summary, memory_type, status, metadata, updated_at")
      .eq("playbook_id", playbook.id)
      .eq("key", key)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return c.json({ error: "Memory not found" }, 404);
      }
      return c.json({ error: error.message }, 500);
    }

    return c.json(data);
  }

  const tier = c.req.query("tier");
  const memoryType = c.req.query("memory_type");

  let query = supabase
    .from("memories")
    .select("key, value, tags, description, tier, priority, parent_key, summary, memory_type, status, metadata, updated_at")
    .eq("playbook_id", playbook.id);

  if (search) {
    query = query.or(`key.ilike.%${search}%,description.ilike.%${search}%,summary.ilike.%${search}%`);
  }

  if (tagsParam) {
    const tags = tagsParam.split(",").map((tag) => tag.trim()).filter(Boolean);
    if (tags.length > 0) {
      query = query.overlaps("tags", tags);
    }
  }

  if (tier) {
    query = query.eq("tier", tier as MemoryTier);
  }

  if (memoryType) {
    query = query.eq("memory_type", memoryType as MemoryType);
  }

  const { data, error } = await query.order("updated_at", { ascending: false });
  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json(data || []);
});

export const GET = handle(app);
