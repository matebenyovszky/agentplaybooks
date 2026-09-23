import { NextRequest, NextResponse } from "next/server";
import { getUserFromAuthOrApiKey } from "@/app/api/_shared/auth";
import { getPlaybookAccessRole } from "@/app/api/_shared/guards";
import { getServiceSupabase } from "@/app/api/_shared/supabase";
import { validatePortableSnapshot } from "@/lib/portable-snapshot";

type Context = { params: Promise<{ id: string }> };

async function authorized(request: NextRequest, id: string, permission: string) {
  const user = await getUserFromAuthOrApiKey(request, permission);
  return user && await getPlaybookAccessRole(user.id, id) ? user : null;
}

export async function GET(request: NextRequest, { params }: Context) {
  const { id } = await params;
  if (!await authorized(request, id, "playbooks:read")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await getServiceSupabase().from("playbook_snapshots")
    .select("id,digest,file_count,size_bytes,created_at")
    .eq("playbook_id", id).order("created_at", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(request: NextRequest, { params }: Context) {
  const { id } = await params;
  const user = await authorized(request, id, "playbooks:write");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > 6 * 1024 * 1024) return NextResponse.json({ error: "Snapshot upload exceeds 6 MiB." }, { status: 413 });
  let snapshot;
  let digest;
  try {
    const body = JSON.parse(raw);
    ({ snapshot, digest } = validatePortableSnapshot(body.snapshot));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid snapshot" }, { status: 400 });
  }

  const db = getServiceSupabase();
  const playbook = await db.from("playbooks").select("guid,name,user_id").eq("id", id).single();
  if (playbook.error || !playbook.data) return NextResponse.json({ error: "Playbook not found" }, { status: 404 });
  const existing = await db.from("playbook_snapshots")
    .select("id,digest,file_count,size_bytes,created_at")
    .eq("playbook_guid", playbook.data.guid)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (existing.error) return NextResponse.json({ error: existing.error.message }, { status: 500 });
  if (existing.data?.digest === digest) return NextResponse.json(existing.data);

  const sizeBytes = snapshot.files.reduce((sum, file) => sum + Buffer.from(file.content, "base64").length, 0);
  const { data, error } = await db.from("playbook_snapshots").insert({
    playbook_id: id, playbook_guid: playbook.data.guid,
    playbook_name: playbook.data.name, owner_user_id: playbook.data.user_id,
    digest, file_count: snapshot.files.length, size_bytes: sizeBytes,
    snapshot, created_by: user.id,
  }).select("id,digest,file_count,size_bytes,created_at").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
