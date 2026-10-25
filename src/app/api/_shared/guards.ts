import { getServiceSupabase } from "./supabase";
import type { Playbook } from "@/lib/supabase/types";
import { playbookIdentifierColumn } from "@/lib/playbook-identifier";
import {
  roleMayWrite,
  type PlaybookAccessRole,
} from "@/lib/audit-access";

export type { PlaybookAccessRole };

/**
 * The UUID of the playbook a request names by UUID or by GUID. Routes keyed on
 * the UUID call this first, so a caller holding the GUID from a URL reaches
 * them too. An unknown identifier comes back unchanged and fails the route's
 * own lookup, with the same 404 or 403 as before.
 */
export async function resolvePlaybookId(identifier: string): Promise<string> {
  if (playbookIdentifierColumn(identifier) === "id") return identifier;
  const { data, error } = await getServiceSupabase()
    .from("playbooks")
    .select("id")
    .eq("guid", identifier)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to resolve playbook: ${error.message}`);
  }
  return data?.id ?? identifier;
}

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

export async function getPlaybookAccessRole(
  userId: string,
  playbookId: string
): Promise<PlaybookAccessRole | null> {
  if (await checkPlaybookOwnership(userId, playbookId)) {
    return "owner";
  }

  const { data: collaborator, error } = await getServiceSupabase()
    .from("playbook_collaborators")
    .select("id, role")
    .eq("playbook_id", playbookId)
    .eq("user_id", userId)
    .not("accepted_at", "is", null)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to check playbook collaboration: ${error.message}`);
  }

  if (!collaborator) return null;
  return collaborator.role === "auditor" ? "auditor" : "editor";
}

export async function checkPlaybookWriteAccess(userId: string, playbookId: string): Promise<boolean> {
  return roleMayWrite(await getPlaybookAccessRole(userId, playbookId));
}

/**
 * Resolve a playbook by GUID for a caller that may be a session user, a
 * playbook-scoped API key, or neither.
 *
 * A playbook API key is bound to exactly one playbook, so presenting a valid
 * one *is* the proof of access — such a caller has no session to check against
 * `playbook_collaborators`. Before `apiKeyPlaybookId` existed, a private
 * playbook answered 404 to every API-key caller, because the visibility gate
 * ran before the key was ever considered. That made the agent-facing half of
 * the secrets vault unreachable unless the playbook was public or unlisted.
 */
export async function getPlaybookByGuid(
  guid: string,
  userId: string | null,
  apiKeyPlaybookId: string | null = null
): Promise<Pick<Playbook, "id" | "user_id" | "visibility" | "guid"> | null> {
  const { data: playbook, error } = await getServiceSupabase()
    .from("playbooks")
    .select("id, user_id, visibility, guid")
    .eq(playbookIdentifierColumn(guid), guid)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load playbook: ${error.message}`);
  }
  if (!playbook) return null;

  const isPublicOrUnlisted = playbook.visibility === 'public' || playbook.visibility === 'unlisted';
  if (!isPublicOrUnlisted) {
    const keyIsForThisPlaybook = apiKeyPlaybookId !== null
      && apiKeyPlaybookId === playbook.id;
    if (!keyIsForThisPlaybook) {
      if (!userId || !(await checkPlaybookWriteAccess(userId, playbook.id))) {
        return null;
      }
    }
  }

  return playbook;
}
