// Native Request/Response handler: shared by Next.js and the Worker dispatcher.
// @worker-native
import { getUserFromAuthOrApiKey } from "@/app/api/_shared/auth";
import { getPlaybookAccessRole } from "@/app/api/_shared/guards";
import { getServiceSupabase } from "@/app/api/_shared/supabase";
import { validatePortableSnapshot } from "@/lib/portable-snapshot";

export async function GET(request: Request, { params }: { params: Promise<{ id: string; snapshotId: string }> }) {
  const { id, snapshotId } = await params;
  const user = await getUserFromAuthOrApiKey(request, "playbooks:read");
  if (!user || !await getPlaybookAccessRole(user.id, id)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await getServiceSupabase().from("playbook_snapshots")
    .select("id,digest,snapshot,created_at")
    .eq("playbook_id", id).eq("id", snapshotId).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "Snapshot not found" }, { status: 404 });
  try {
    if (validatePortableSnapshot(data.snapshot).digest !== data.digest) throw new Error("Stored snapshot digest mismatch.");
  } catch (validationError) {
    return Response.json({ error: validationError instanceof Error ? validationError.message : "Corrupt snapshot" }, { status: 500 });
  }
  return Response.json(data);
}
