import { getAuthenticatedUser, validateUserApiKey } from "./auth";
import { getPlaybookAccessRole } from "./guards";
import { getServiceSupabase } from "./supabase";
import type { AuditActor } from "./audit";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PROPOSAL_COLUMNS =
  "id, playbook_id, kind, target, payload, rationale, status, submitted_via, submitted_by, submitter_key_prefix, reviewed_by, reviewed_at, review_note, applied_ref, created_at";

export async function resolveProposalPlaybook(idOrGuid: string): Promise<{ id: string; guid: string } | null> {
  let query = getServiceSupabase().from("playbooks").select("id, guid");
  query = UUID.test(idOrGuid) ? query.eq("id", idOrGuid) : query.eq("guid", idOrGuid);
  const { data } = await query.maybeSingle();
  return (data as { id: string; guid: string } | null) ?? null;
}

export type ProposalReviewer = { userId: string; actor: AuditActor };

/**
 * Who may read and decide proposals: the owner or an editor, by dashboard
 * session or by a user key that holds `userKeyPermission`. A playbook API key
 * never qualifies: approving is the human step that proposals exist for, and
 * a proposer key in particular must not see what others proposed.
 */
export async function resolveProposalReviewer(
  request: Request,
  playbookId: string,
  userKeyPermission: string,
): Promise<ProposalReviewer | null> {
  const user = await getAuthenticatedUser(request);
  if (user && await getPlaybookAccessRole(user.id, playbookId)) {
    return { userId: user.id, actor: { type: "owner", id: user.id } };
  }
  const userKey = await validateUserApiKey(request, userKeyPermission);
  if (userKey && await getPlaybookAccessRole(userKey.user_id, playbookId)) {
    return { userId: userKey.user_id, actor: { type: "api_key", id: userKey.key_prefix } };
  }
  return null;
}
