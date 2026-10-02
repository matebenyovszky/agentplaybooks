import { NextRequest, NextResponse } from "next/server";
import { recordProposalAudit } from "@/app/api/_shared/audit";
import {
  PROPOSAL_COLUMNS,
  resolveProposalPlaybook,
  resolveProposalReviewer,
} from "@/app/api/_shared/proposals";
import { getServiceSupabase } from "@/app/api/_shared/supabase";
import { applyProposal, type StoredProposal } from "@/lib/proposals";
import { findPlaybookSkill } from "@/lib/repositories/skills";

type Params = { params: Promise<{ guid: string; proposalId: string }> };

async function loadProposal(playbookId: string, proposalId: string) {
  const { data } = await getServiceSupabase()
    .from("playbook_proposals")
    .select(PROPOSAL_COLUMNS)
    .eq("id", proposalId)
    .eq("playbook_id", playbookId)
    .maybeSingle();
  return data as (StoredProposal & { status: string }) | null;
}

/**
 * GET /api/playbooks/:guid/proposals/:id — one proposal plus what it would
 * replace (`current`), so a reviewer can compare. Owner or editor only.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const { guid, proposalId } = await params;
  const playbook = await resolveProposalPlaybook(guid);
  if (!playbook) return NextResponse.json({ error: "Playbook not found" }, { status: 404 });
  if (!await resolveProposalReviewer(request, playbook.id, "playbooks:read")) {
    return NextResponse.json({ error: "Only the owner or an editor can read proposals" }, { status: 403 });
  }

  const proposal = await loadProposal(playbook.id, proposalId);
  if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

  const supabase = getServiceSupabase();
  let current: unknown = null;
  if (proposal.kind === "skill") {
    const skill = await findPlaybookSkill(supabase, playbook.id, proposal.target);
    if (skill) {
      const { data } = await supabase.from("skills").select("name, description, content").eq("id", skill.id).maybeSingle();
      current = data ?? null;
    }
  } else {
    const { data } = await supabase
      .from("memories")
      .select("key, value, summary, tier, tags")
      .eq("playbook_id", playbook.id)
      .eq("key", proposal.target)
      .maybeSingle();
    current = data ?? null;
  }
  return NextResponse.json({ ...proposal, current });
}

/**
 * PATCH /api/playbooks/:guid/proposals/:id  { decision: "approve" | "reject", note? }
 *
 * Approval is claimed first (pending → approved, conditionally), then applied,
 * so two reviewers cannot apply the same proposal twice; a failed apply puts
 * it back to pending. A user key needs skills:write or memory:write for the
 * proposal's kind, like a direct write would.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { guid, proposalId } = await params;
  const playbook = await resolveProposalPlaybook(guid);
  if (!playbook) return NextResponse.json({ error: "Playbook not found" }, { status: 404 });

  const proposal = await loadProposal(playbook.id, proposalId);
  if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

  const reviewer = await resolveProposalReviewer(
    request,
    playbook.id,
    proposal.kind === "skill" ? "skills:write" : "memory:write",
  );
  if (!reviewer) return NextResponse.json({ error: "Only the owner or an editor can decide proposals" }, { status: 403 });

  const body = await request.json().catch(() => null) as { decision?: unknown; note?: unknown } | null;
  const decision = body?.decision;
  if (decision !== "approve" && decision !== "reject") {
    return NextResponse.json({ error: "decision must be 'approve' or 'reject'" }, { status: 400 });
  }
  if (body?.note !== undefined && body.note !== null && (typeof body.note !== "string" || body.note.length > 4000)) {
    return NextResponse.json({ error: "note must be a string of at most 4000 characters" }, { status: 400 });
  }
  const note = typeof body?.note === "string" ? body.note : null;
  if (proposal.status !== "pending") {
    return NextResponse.json({ error: `Proposal is already ${proposal.status}` }, { status: 409 });
  }

  const supabase = getServiceSupabase();
  const target = `${proposal.kind}:${proposal.target}`;
  const audit = { playbookId: playbook.id, actor: reviewer.actor };
  const { data: claimed, error: claimError } = await supabase
    .from("playbook_proposals")
    .update({
      status: decision === "approve" ? "approved" : "rejected",
      reviewed_by: reviewer.userId,
      reviewed_at: new Date().toISOString(),
      review_note: note,
    })
    .eq("id", proposal.id)
    .eq("status", "pending")
    .select(PROPOSAL_COLUMNS)
    .maybeSingle();
  if (claimError) return NextResponse.json({ error: claimError.message }, { status: 500 });
  if (!claimed) return NextResponse.json({ error: "Proposal was decided by someone else in the meantime" }, { status: 409 });

  if (decision === "reject") {
    await recordProposalAudit(audit, { operation: "proposal.reject", status: "success", target });
    return NextResponse.json(claimed);
  }

  try {
    const appliedRef = await applyProposal(supabase, playbook.id, proposal);
    const { data: finished } = await supabase
      .from("playbook_proposals")
      .update({ applied_ref: appliedRef })
      .eq("id", proposal.id)
      .select(PROPOSAL_COLUMNS)
      .maybeSingle();
    await recordProposalAudit(audit, { operation: "proposal.approve", status: "success", target });
    return NextResponse.json(finished ?? { ...claimed, applied_ref: appliedRef });
  } catch (error) {
    await supabase
      .from("playbook_proposals")
      .update({ status: "pending", reviewed_by: null, reviewed_at: null, review_note: null })
      .eq("id", proposal.id);
    await recordProposalAudit(audit, { operation: "proposal.approve", status: "error", target, reason: "apply_failed" });
    return NextResponse.json({ error: `Could not apply the proposal: ${error instanceof Error ? error.message : "unknown error"}` }, { status: 500 });
  }
}
