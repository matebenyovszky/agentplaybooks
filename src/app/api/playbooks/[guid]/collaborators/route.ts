import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/app/api/_shared/auth";
import { checkPlaybookOwnership } from "@/app/api/_shared/guards";
import { getServiceSupabase } from "@/app/api/_shared/supabase";
import { generateInviteToken, hashToken } from "@/lib/utils";

const INVITE_TTL_MS = 72 * 60 * 60 * 1000;
const MAX_COLLABORATION_ROWS = 25;

async function resolveOwnedPlaybook(userId: string, idOrGuid: string) {
  const supabase = getServiceSupabase();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrGuid);
  let query = supabase.from("playbooks").select("id, name, user_id");
  query = isUuid ? query.eq("id", idOrGuid) : query.eq("guid", idOrGuid);
  const { data } = await query.single();

  if (!data || !(await checkPlaybookOwnership(userId, data.id))) {
    return null;
  }
  return data;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ guid: string }> }
) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { guid } = await params;
  const playbook = await resolveOwnedPlaybook(user.id, guid);
  if (!playbook) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("playbook_collaborators")
    .select("id, user_id, invite_expires_at, accepted_at, created_at")
    .eq("playbook_id", playbook.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const userIds = (data || []).flatMap((row) => row.user_id ? [row.user_id] : []);
  const profileNames = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("auth_user_id, display_name")
      .in("auth_user_id", userIds);
    for (const profile of profiles || []) {
      if (profile.auth_user_id) profileNames.set(profile.auth_user_id, profile.display_name);
    }
  }

  return NextResponse.json((data || []).map((row) => ({
    ...row,
    display_name: row.user_id ? profileNames.get(row.user_id) || null : null,
    status: row.accepted_at ? "active" : new Date(row.invite_expires_at) <= new Date() ? "expired" : "pending",
  })));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ guid: string }> }
) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { guid } = await params;
  const playbook = await resolveOwnedPlaybook(user.id, guid);
  if (!playbook) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = getServiceSupabase();
  await supabase
    .from("playbook_collaborators")
    .delete()
    .eq("playbook_id", playbook.id)
    .is("accepted_at", null)
    .lt("invite_expires_at", new Date().toISOString());

  const { count } = await supabase
    .from("playbook_collaborators")
    .select("id", { count: "exact", head: true })
    .eq("playbook_id", playbook.id);
  if ((count || 0) >= MAX_COLLABORATION_ROWS) {
    return NextResponse.json({ error: "Collaboration limit reached" }, { status: 409 });
  }

  const token = generateInviteToken();
  const tokenHash = await hashToken(token);
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();
  const { data, error } = await supabase
    .from("playbook_collaborators")
    .insert({
      playbook_id: playbook.id,
      invited_by: user.id,
      invite_token_hash: tokenHash,
      invite_expires_at: expiresAt,
    })
    .select("id, invite_expires_at, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ...data,
    status: "pending",
    invite_path: `/invite/${token}`,
    warning: "This invite link is shown once and expires in 72 hours.",
  }, { status: 201 });
}
