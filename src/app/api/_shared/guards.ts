import { getServiceSupabase } from "./supabase";
import type { Playbook } from "@/lib/supabase/types";

export async function checkPlaybookOwnership(userId: string, playbookId: string): Promise<boolean> {
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("playbooks")
    .select("id")
    .eq("id", playbookId)
    .eq("user_id", userId)
    .single();
  return !!data;
}

export async function getPlaybookByGuid(
  guid: string,
  userId: string | null
): Promise<Pick<Playbook, "id" | "user_id" | "is_public" | "guid"> | null> {
  const supabase = getServiceSupabase();
  const { data: playbook } = await supabase
    .from("playbooks")
    .select("id, user_id, is_public, guid")
    .eq("guid", guid)
    .single();

  if (!playbook) return null;

  if (!playbook.is_public && (!userId || playbook.user_id !== userId)) {
    return null;
  }

  return playbook;
}
