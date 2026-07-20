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
  if (!isPublicOrUnlisted && (!userId || playbook.user_id !== userId)) {
    return null;
  }

  // Cast visibility to match supabase type expectations if needed, but string should be fine
  return playbook as Pick<Playbook, "id" | "user_id" | "visibility" | "guid">;
}
