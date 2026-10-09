import type { SupabaseClient } from "@supabase/supabase-js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve a skill of one playbook by UUID or by name.
 *
 * Skill names are not unique per playbook in the schema, so a name resolves to
 * the most recently created match, as the MCP tools have always done. Always
 * scoped to the playbook: an id from another playbook does not resolve.
 *
 * `columns` widens the row for a caller that needs more than the id in the same
 * round trip — a skill proposal carries the whole proposed version, so it needs
 * the current name, description, and content to fill the fields not changed.
 */
export async function findPlaybookSkill<Row extends { id: string } = { id: string }>(
  supabase: SupabaseClient,
  playbookId: string,
  idOrName: string,
  columns = "id",
): Promise<Row | null> {
  let query = supabase.from("skills").select(columns).eq("playbook_id", playbookId);
  query = UUID_PATTERN.test(idOrName) ? query.eq("id", idOrName) : query.ilike("name", idOrName);
  const { data } = await query
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Row | null) ?? null;
}
