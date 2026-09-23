import { NextRequest, NextResponse } from "next/server";
import { getUserFromAuthOrApiKey } from "@/app/api/_shared/auth";
import { getServiceSupabase } from "@/app/api/_shared/supabase";
import { validatePortableSnapshot } from "@/lib/portable-snapshot";

/** Owner-only disaster recovery, including after the playbook was deleted. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ guid: string }> }) {
  const { guid } = await params;
  const user = await getUserFromAuthOrApiKey(request, "playbooks:read");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (request.nextUrl.searchParams.has("list")) {
    const { data, error } = await getServiceSupabase().from("playbook_snapshots")
      .select("id,digest,file_count,size_bytes,created_at,playbook_guid,playbook_name")
      .eq("owner_user_id", user.id).eq("playbook_guid", guid)
      .order("created_at", { ascending: false }).limit(100);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  }
  const snapshotId = request.nextUrl.searchParams.get("snapshot");
  let query = getServiceSupabase().from("playbook_snapshots")
    .select("id,digest,snapshot,created_at,playbook_guid,playbook_name")
    .eq("owner_user_id", user.id).eq("playbook_guid", guid);
  if (snapshotId) query = query.eq("id", snapshotId);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Backup not found" }, { status: 404 });
  try {
    if (validatePortableSnapshot(data.snapshot).digest !== data.digest) throw new Error("Stored snapshot digest mismatch.");
  } catch (validationError) {
    return NextResponse.json({ error: validationError instanceof Error ? validationError.message : "Corrupt snapshot" }, { status: 500 });
  }
  return NextResponse.json(data);
}
