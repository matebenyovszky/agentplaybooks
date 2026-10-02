import { NextRequest, NextResponse } from "next/server";
import { authorizePlaybookRequest } from "@/app/api/_shared/auth";
import { recordProposalAudit } from "@/app/api/_shared/audit";
import {
  PROPOSAL_COLUMNS,
  resolveProposalPlaybook,
  resolveProposalReviewer,
} from "@/app/api/_shared/proposals";
import { getServiceSupabase } from "@/app/api/_shared/supabase";
import { MAX_PENDING_PROPOSALS, parseProposalInput } from "@/lib/proposals";

const STATUSES = ["pending", "approved", "rejected", "all"] as const;

/** GET /api/playbooks/:guid/proposals?status=pending — owner or editor only. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ guid: string }> },
) {
  const { guid } = await params;
  const playbook = await resolveProposalPlaybook(guid);
  if (!playbook) return NextResponse.json({ error: "Playbook not found" }, { status: 404 });

  const reviewer = await resolveProposalReviewer(request, playbook.id, "playbooks:read");
  if (!reviewer) return NextResponse.json({ error: "Only the owner or an editor can read proposals" }, { status: 403 });

  const status = request.nextUrl.searchParams.get("status") ?? "pending";
  if (!STATUSES.includes(status as typeof STATUSES[number])) {
    return NextResponse.json({ error: `status must be one of ${STATUSES.join(", ")}` }, { status: 400 });
  }
  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit")) || 100, 1), 200);

  let query = getServiceSupabase()
    .from("playbook_proposals")
    .select(PROPOSAL_COLUMNS)
    .eq("playbook_id", playbook.id);
  if (status !== "all") query = query.eq("status", status as "pending" | "approved" | "rejected");
  const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

/**
 * POST /api/playbooks/:guid/proposals — submit a skill change or memory entry.
 *
 * Needs proposals:write: a playbook key bound to this playbook (the "proposer"
 * role holds nothing else), a user key with that permission, or the session of
 * the owner or an editor. The response is the id only: a proposer cannot read
 * proposals back, its own included.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ guid: string }> },
) {
  const { guid } = await params;
  const playbook = await resolveProposalPlaybook(guid);
  if (!playbook) return NextResponse.json({ error: "Playbook not found" }, { status: 404 });

  const actor = await authorizePlaybookRequest(request, playbook.id, "proposals:write");
  if (!actor) {
    return NextResponse.json({ error: "A credential with proposals:write for this playbook is required" }, { status: 401 });
  }

  const parsed = parseProposalInput(await request.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const supabase = getServiceSupabase();
  const { data: pending, error: countError } = await supabase
    .from("playbook_proposals")
    .select("id")
    .eq("playbook_id", playbook.id)
    .eq("status", "pending")
    .limit(MAX_PENDING_PROPOSALS);
  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });
  if ((pending ?? []).length >= MAX_PENDING_PROPOSALS) {
    return NextResponse.json({ error: "Too many pending proposals for this playbook; ask its owner to review them" }, { status: 429 });
  }

  const { data, error } = await supabase
    .from("playbook_proposals")
    .insert({
      playbook_id: playbook.id,
      kind: parsed.kind,
      target: parsed.target,
      payload: parsed.payload,
      rationale: parsed.rationale,
      submitted_via: actor.kind,
      submitted_by: actor.userId,
      submitter_key_prefix: actor.keyPrefix,
    })
    .select("id, status, created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const auditActor = actor.kind === "session"
    ? { type: "owner" as const, id: actor.userId }
    : { type: "api_key" as const, id: actor.keyPrefix };
  await recordProposalAudit(
    { playbookId: playbook.id, actor: auditActor },
    { operation: "proposal.submit", status: "success", target: `${parsed.kind}:${parsed.target}` },
  );
  return NextResponse.json(data, { status: 201 });
}
