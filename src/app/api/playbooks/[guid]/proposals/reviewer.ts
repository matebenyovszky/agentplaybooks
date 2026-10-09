import { getAuthenticatedUser, validateApiKey, validateUserApiKey } from "@/app/api/_shared/auth";
import { checkPlaybookWriteAccess } from "@/app/api/_shared/guards";
import { getServiceSupabase } from "@/app/api/_shared/supabase";
import type { ProposalKind } from "@/app/api/_shared/proposals";

// Who may review which proposals: the owner and editors review both kinds; a
// playbook key reviews the kind it may write directly. A proposer never
// reviews, so nobody approves their own suggestion with a propose-only key.
export async function reviewerKinds(
  request: Request,
  guid: string,
): Promise<{ playbookId: string; kinds: ProposalKind[] } | null> {
  const { data: playbook } = await getServiceSupabase()
    .from("playbooks")
    .select("id")
    .eq("guid", guid)
    .maybeSingle();
  if (!playbook) return null;

  const user = await getAuthenticatedUser(request);
  if (user && await checkPlaybookWriteAccess(user.id, playbook.id)) {
    return { playbookId: playbook.id, kinds: ["memory", "skill"] };
  }

  const userKey = await validateUserApiKey(request, "playbooks:write");
  if (userKey && await checkPlaybookWriteAccess(userKey.user_id, playbook.id)) {
    return { playbookId: playbook.id, kinds: ["memory", "skill"] };
  }

  const kinds: ProposalKind[] = [];
  const memoryKey = await validateApiKey(request, "memory:write");
  if (memoryKey?.playbooks.id === playbook.id) kinds.push("memory");
  const skillsKey = await validateApiKey(request, "skills:write");
  if (skillsKey?.playbooks.id === playbook.id) kinds.push("skill");
  return kinds.length ? { playbookId: playbook.id, kinds } : null;
}
