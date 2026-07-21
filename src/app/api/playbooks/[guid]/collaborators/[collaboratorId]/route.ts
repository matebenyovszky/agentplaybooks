import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/app/api/_shared/auth";
import { checkPlaybookOwnership } from "@/app/api/_shared/guards";
import { getServiceSupabase } from "@/app/api/_shared/supabase";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ guid: string; collaboratorId: string }> }
) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { guid: idOrGuid, collaboratorId } = await params;
  const supabase = getServiceSupabase();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrGuid);
  let playbookQuery = supabase.from("playbooks").select("id");
  playbookQuery = isUuid ? playbookQuery.eq("id", idOrGuid) : playbookQuery.eq("guid", idOrGuid);
  const { data: playbook } = await playbookQuery.single();
  const playbookId = playbook?.id;

  if (!playbookId) return NextResponse.json({ error: "Playbook not found" }, { status: 404 });
  if (!(await checkPlaybookOwnership(user.id, playbookId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("playbook_collaborators")
    .delete()
    .eq("id", collaboratorId)
    .eq("playbook_id", playbookId)
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Collaborator or invite not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
