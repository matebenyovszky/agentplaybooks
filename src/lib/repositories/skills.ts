import type { SupabaseClient } from "@supabase/supabase-js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve a skill of one playbook by UUID or by name.
 *
 * Skill names are not unique per playbook in the schema, so a name resolves to
 * the most recently created match, as the MCP tools have always done. Always
 * scoped to the playbook: an id from another playbook does not resolve.
 */
export async function findPlaybookSkill(
  supabase: SupabaseClient,
  playbookId: string,
  idOrName: string,
): Promise<{ id: string } | null> {
  let query = supabase.from("skills").select("id").eq("playbook_id", playbookId);
  query = UUID_PATTERN.test(idOrName) ? query.eq("id", idOrName) : query.ilike("name", idOrName);
  const { data } = await query
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { id: string } | null) ?? null;
}
