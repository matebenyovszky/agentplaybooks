import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/app/api/_shared/auth";
import { getServiceSupabase } from "@/app/api/_shared/supabase";
import { hashToken } from "@/lib/utils";

async function findInvite(token: string) {
  const supabase = getServiceSupabase();
  const tokenHash = await hashToken(token);
  const { data } = await supabase
    .from("playbook_collaborators")
    .select("id, playbook_id, user_id, accepted_at, invite_expires_at, playbooks!inner(id, name, user_id)")
    .eq("invite_token_hash", tokenHash)
    .single();
  return data;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const invite = await findInvite(token);
  if (!invite || invite.accepted_at || invite.user_id || new Date(invite.invite_expires_at) <= new Date()) {
    return NextResponse.json({ error: "Invite is invalid or expired" }, { status: 404 });
  }

  const joined = invite.playbooks as unknown as { id: string; name: string; user_id: string };
  return NextResponse.json({ playbook_name: joined.name, expires_at: invite.invite_expires_at });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { token } = await params;
  const invite = await findInvite(token);
  if (!invite || invite.accepted_at || invite.user_id || new Date(invite.invite_expires_at) <= new Date()) {
    return NextResponse.json({ error: "Invite is invalid or expired" }, { status: 404 });
  }

  const joined = invite.playbooks as unknown as { id: string; name: string; user_id: string };
  if (joined.user_id === user.id) {
    return NextResponse.json({ error: "The owner cannot accept their own invite" }, { status: 409 });
  }

  const supabase = getServiceSupabase();
  const { data: existing } = await supabase
    .from("playbook_collaborators")
    .select("id")
    .eq("playbook_id", invite.playbook_id)
    .eq("user_id", user.id)
    .not("accepted_at", "is", null)
    .maybeSingle();
  if (existing) {
    await supabase.from("playbook_collaborators").delete().eq("id", invite.id);
    return NextResponse.json({ playbook_id: invite.playbook_id, already_member: true });
  }

  const { data, error } = await supabase
    .from("playbook_collaborators")
    .update({ user_id: user.id, accepted_at: new Date().toISOString() })
    .eq("id", invite.id)
    .is("user_id", null)
    .is("accepted_at", null)
    .gt("invite_expires_at", new Date().toISOString())
    .select("playbook_id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Invite was already used" }, { status: 409 });
  }
  return NextResponse.json({ playbook_id: data.playbook_id });
}
