import { NextRequest, NextResponse } from "next/server";
import { getUserFromAuthOrApiKey } from "@/app/api/_shared/auth";
import { getPlaybookAccessRole } from "@/app/api/_shared/guards";
import { getServiceSupabase } from "@/app/api/_shared/supabase";
import { validatePortableSnapshot } from "@/lib/portable-snapshot";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUserFromAuthOrApiKey(request, "playbooks:read");
  if (!user || !await getPlaybookAccessRole(user.id, id)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await getServiceSupabase().from("playbook_snapshots")
    .select("id,digest,snapshot,created_at")
    .eq("playbook_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ snapshot: null });
  try {
    if (validatePortableSnapshot(data.snapshot).digest !== data.digest) throw new Error("Stored snapshot digest mismatch.");
  } catch (validationError) {
    return NextResponse.json({ error: validationError instanceof Error ? validationError.message : "Corrupt snapshot" }, { status: 500 });
  }
  return NextResponse.json(data);
}
