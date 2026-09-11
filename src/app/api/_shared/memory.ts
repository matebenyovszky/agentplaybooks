import { getServiceSupabase } from "./supabase";
import { literalMemoryPattern, parseMemorySearch, type MemoryEntry } from "@/lib/memory";

export async function searchMemories(playbookId: string, input: Record<string, unknown>): Promise<MemoryEntry[]> {
  const options = parseMemorySearch(input);
  const supabase = getServiceSupabase();
  let query = supabase.from("memory_entries").select("*").eq("playbook_id", playbookId);
  if (options.history_key !== undefined) {
    const { data: current, error } = await supabase.from("memories").select("id").eq("playbook_id", playbookId).eq("key", options.history_key).maybeSingle();
    if (error) throw new Error(error.message);
    if (!current) return [];
    query = query.eq("memory_id", current.id).not("history_id", "is", null);
  } else if (!options.key && !options.id) {
    if (options.scope === "active") query = query.eq("is_archived", false);
    if (options.scope === "archived") query = query.eq("is_archived", true);
  }
  if (options.key) query = query.eq("key", options.key).is("history_id", null);
  if (options.id) query = query.eq("memory_id", options.id).is("history_id", null);
  if (options.search) query = query.ilike("search_text", literalMemoryPattern(options.search));
  if (options.tags?.length) query = query.overlaps("tags", options.tags);
  if (options.tier) query = query.eq("tier", options.tier);
  if (options.memory_type) query = query.eq("memory_type", options.memory_type);
  if (options.status) query = query.eq("status", options.status);
  if (options.include_children === false && !options.key && !options.id && !options.history_key) query = query.is("parent_key", null);
  if (options.after) query = query.gte("memory_at", options.after);
  if (options.before) query = query.lte("memory_at", options.before);
  const offset = options.offset ?? 0;
  const { data, error } = await query.order(options.history_key ? "updated_at" : "memory_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + (options.limit ?? 100) - 1);
  if (error) throw new Error(error.message);
  return (data || []).map(entry => {
    const result = { ...entry };
    delete result.search_text;
    return result;
  }) as MemoryEntry[];
}
