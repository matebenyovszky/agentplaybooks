import { getDb } from "./supabase";
import { schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import type { Playbook } from "@/lib/supabase/types";

export async function checkPlaybookOwnership(userId: string, playbookId: string): Promise<boolean> {
  const db = getDb();
  const [playbook] = await db
    .select({ id: schema.playbooks.id })
    .from(schema.playbooks)
    .where(and(eq(schema.playbooks.id, playbookId), eq(schema.playbooks.user_id, userId)))
    .limit(1);
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

  const db = getDb();
  const [collaborator] = await db
    .select({ id: schema.playbookCollaborators.id })
    .from(schema.playbookCollaborators)
    .where(and(
      eq(schema.playbookCollaborators.playbook_id, playbookId),
      eq(schema.playbookCollaborators.user_id, userId)
    ))
    .limit(1);

  return collaborator ? "editor" : null;
}

export async function checkPlaybookWriteAccess(userId: string, playbookId: string): Promise<boolean> {
  return (await getPlaybookAccessRole(userId, playbookId)) !== null;
}

export async function getPlaybookByGuid(
  guid: string,
  userId: string | null
): Promise<Pick<Playbook, "id" | "user_id" | "visibility" | "guid"> | null> {
  const db = getDb();
  const [playbook] = await db
    .select({
      id: schema.playbooks.id,
      user_id: schema.playbooks.user_id,
      visibility: schema.playbooks.visibility,
      guid: schema.playbooks.guid,
    })
    .from(schema.playbooks)
    .where(eq(schema.playbooks.guid, guid))
    .limit(1);

  if (!playbook) return null;

  const isPublicOrUnlisted = playbook.visibility === 'public' || playbook.visibility === 'unlisted';
  if (!isPublicOrUnlisted) {
    if (!userId || !(await checkPlaybookWriteAccess(userId, playbook.id))) {
      return null;
    }
  }

  // Cast visibility to match supabase type expectations if needed, but string should be fine
  return playbook as Pick<Playbook, "id" | "user_id" | "visibility" | "guid">;
}
