import { getServiceSupabase } from "./supabase";
import type { Playbook } from "@/lib/supabase/types";

export async function checkPlaybookOwnership(userId: string, playbookId: string): Promise<boolean> {
  const { data: playbook, error } = await getServiceSupabase()
    .from("playbooks")
    .select("id")
    .eq("id", playbookId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to check playbook ownership: ${error.message}`);
  }

  return !!playbook;
}

export type PlaybookAccessRole = "owner" | "editor";

export async function getPlaybookAccessRole(
  userId: string,
  playbookId: string
): Promise<PlaybookAccessRole | null> {
  if (await checkPlaybookOwnership(userId, playbookId)) {
    return "owner";
  }

  const { data: collaborator, error } = await getServiceSupabase()
    .from("playbook_collaborators")
    .select("id")
    .eq("playbook_id", playbookId)
    .eq("user_id", userId)
    .not("accepted_at", "is", null)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to check playbook collaboration: ${error.message}`);
  }

  return collaborator ? "editor" : null;
}

export async function checkPlaybookWriteAccess(userId: string, playbookId: string): Promise<boolean> {
  return (await getPlaybookAccessRole(userId, playbookId)) !== null;
}

export async function getPlaybookByGuid(
  guid: string,
  userId: string | null
): Promise<Pick<Playbook, "id" | "user_id" | "visibility" | "guid"> | null> {
  const { data: playbook, error } = await getServiceSupabase()
    .from("playbooks")
    .select("id, user_id, visibility, guid")
    .eq("guid", guid)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load playbook: ${error.message}`);
  }
  if (!playbook) return null;

  const isPublicOrUnlisted = playbook.visibility === 'public' || playbook.visibility === 'unlisted';
  if (!isPublicOrUnlisted) {
    if (!userId || !(await checkPlaybookWriteAccess(userId, playbook.id))) {
      return null;
    }
  }

  return playbook;
}
