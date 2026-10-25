// Native Request/Response handler: shared by Next.js and the Worker dispatcher.
// @worker-native
import { runWithAuditRequest } from "@/lib/audit-context";
import { getServiceSupabase } from "../../_shared/supabase";
import { getAuthenticatedUser } from "../../_shared/auth";
import { getPlaybookAccessRole } from "../../_shared/guards";
import { buildPlaybookUpdate } from "@/lib/playbook-access";
import { playbookViewForRole, roleMayWrite } from "@/lib/audit-access";
import { getPublisherIdForAuthUser } from "@/lib/repositories/playbooks";
import {
    formatAsOpenAPI,
    formatAsMCP,
    formatAsAnthropic,
    formatAsMarkdown,
    PlaybookWithExports
} from "../../_shared/formatters";
import { isSafeSkillFile } from "@/lib/skill-markdown";
import type { Skill } from "@/lib/supabase/types";

/**
 * One bundled skill file, as a client needs it to rebuild the skill directory.
 * The id travels with it so a client that pushes back can update the file in
 * place rather than trying to create one that already exists.
 */
type AttachmentRow = { id: string; filename: string; content: string };

// Helper: Convert playbook to persona shape
function playbookToPersona(playbook: {
    id: string;
    persona_name: string | null;
    persona_system_prompt: string | null;
    persona_metadata: Record<string, unknown> | null;
    created_at: string;
}) {
    return {
        id: playbook.id,
        playbook_id: playbook.id,
        name: playbook.persona_name || "Assistant",
        system_prompt: playbook.persona_system_prompt || "You are a helpful AI assistant.",
        metadata: playbook.persona_metadata ?? {},
        created_at: playbook.created_at,
    };
}

export async function GET(
    request: Request,
    { params }: { params: Promise<{ guid: string }> }
) {
    const { guid: idOrGuid } = await params;
    const searchParams = new URL(request.url).searchParams;
    const format = searchParams.get("format") || "json";
    const includeAttachments = !["openapi", "mcp", "anthropic", "markdown"].includes(format);
    const supabase = getServiceSupabase();

    // Try to get user (optional auth)
    const user = await getAuthenticatedUser(request);

    // Check if it's a UUID or GUID
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrGuid);

    // Find playbook by ID or GUID
    let query = supabase
        .from("playbooks")
        .select("*");

    if (isUuid) {
        query = query.eq("id", idOrGuid);
    } else {
        query = query.eq("guid", idOrGuid);
    }

    // Legacy memory clients deliberately probe anonymously for an expected
    // 404. Filter before loading the row so a private persona/instructions
    // payload never travels from the database just to be discarded below.
    if (!user) query = query.in("visibility", ["public", "unlisted"]);

    const { data: playbook, error } = await query.single();

    if (error || !playbook) {
        return Response.json({ error: "Playbook not found" }, { status: 404 });
    }

    // Check access: Public/Unlisted OR Owner
    const accessRole = user ? await getPlaybookAccessRole(user.id, playbook.id) : null;
    const isPublicOrUnlisted = playbook.visibility === 'public' || playbook.visibility === 'unlisted';

    if (!isPublicOrUnlisted && !accessRole) {
        return Response.json({ error: "Playbook not found" }, { status: 404 });
    }

    if (accessRole === "auditor") {
        return Response.json(playbookViewForRole({ ...playbook, current_user_role: "auditor" }, "auditor"));
    }

    // Get related data. The attachments come along with the skills because a
    // skill backed by a script is not usable without them: `apb pull` has to
    // be able to write the whole skill directory, and it only makes this one
    // request. They are dropped again below for the export formats, which
    // describe tools rather than files.
    const [skillsRes, mcpRes] = await Promise.all([
        supabase
            .from("skills")
            .select(includeAttachments ? "*, skill_attachments(id, filename, content)" : "*")
            .eq("playbook_id", playbook.id),
        supabase.from("mcp_servers").select("*").eq("playbook_id", playbook.id),
    ]);

    type SkillRow = Skill & { skill_attachments?: AttachmentRow[] | null };
    const skillRows = (skillsRes.data ?? []) as unknown as SkillRow[];
    const bareSkills: Skill[] = [];
    const skillsWithFiles: Array<Skill & { attachments: AttachmentRow[] }> = [];
    for (const { skill_attachments, ...skill } of skillRows) {
        bareSkills.push(skill as Skill);
        skillsWithFiles.push({
            ...(skill as Skill),
            // A stored name that the serving rules would reject can never be
            // written to disk safely, so it is not offered to a client either.
            attachments: (skill_attachments ?? []).filter((file) => isSafeSkillFile(file.filename)),
        });
    }

    const persona = playbookToPersona(playbook);

    const fullPlaybook: PlaybookWithExports = {
        ...playbook,
        current_user_role: accessRole || "viewer",
        persona,
        personas: [persona],
        skills: bareSkills,
        mcp_servers: mcpRes.data || [],
    };

    // Format output
    switch (format) {
        case "openapi":
            return Response.json(formatAsOpenAPI(fullPlaybook));
        case "mcp":
            return Response.json(formatAsMCP(fullPlaybook));
        case "anthropic":
            return Response.json(formatAsAnthropic(fullPlaybook));
        case "markdown":
            return new Response(formatAsMarkdown(fullPlaybook), {
                headers: { "Content-Type": "text/markdown" },
            });
        default:
            return Response.json({ ...fullPlaybook, skills: skillsWithFiles });
    }
}

async function handlePUT(
    request: Request,
    { params }: { params: Promise<{ guid: string }> }
) {
    const user = await getAuthenticatedUser(request);
    if (!user) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { guid: idOrGuid } = await params;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrGuid);
    const supabase = getServiceSupabase();

    // Find the playbook ID first
    let query = supabase.from("playbooks").select("id, user_id, publisher_id");
    if (isUuid) {
        query = query.eq("id", idOrGuid);
    } else {
        query = query.eq("guid", idOrGuid);
    }

    const { data: playbook, error: findError } = await query.single();
    if (findError || !playbook) {
        return Response.json({ error: "Playbook not found" }, { status: 404 });
    }

    const accessRole = await getPlaybookAccessRole(user.id, playbook.id);
    if (!roleMayWrite(accessRole)) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const updateData = buildPlaybookUpdate(body, accessRole);
    if ((updateData.visibility === "public" || updateData.visibility === "unlisted")
        && !playbook.publisher_id) {
        try {
            updateData.publisher_id = await getPublisherIdForAuthUser(playbook.user_id);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Publisher profile not found";
            return Response.json({ error: message }, { status: 500 });
        }
    }
    if (Object.keys(updateData).length === 0) {
        return Response.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const { data, error } = await supabase
        .from("playbooks")
        .update(updateData)
        .eq("id", playbook.id)
        .select()
        .single();

    if (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json(data);
}

async function handleDELETE(
    request: Request,
    { params }: { params: Promise<{ guid: string }> }
) {
    const user = await getAuthenticatedUser(request);
    if (!user) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { guid: idOrGuid } = await params;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrGuid);
    const supabase = getServiceSupabase();

    // Find the playbook ID first
    let query = supabase.from("playbooks").select("id, user_id");
    if (isUuid) {
        query = query.eq("id", idOrGuid);
    } else {
        query = query.eq("guid", idOrGuid);
    }

    const { data: playbook, error: findError } = await query.single();
    if (findError || !playbook) {
        return Response.json({ error: "Playbook not found" }, { status: 404 });
    }

    // Check ownership
    if (playbook.user_id !== user.id) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error } = await supabase
        .from("playbooks")
        .delete()
        .eq("id", playbook.id);

    if (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ success: true });
}

export async function PUT(request: Request, { params }: { params: Promise<{ guid: string }> }) {
  return runWithAuditRequest(request, () => handlePUT(request, { params }));
}

export async function DELETE(request: Request, { params }: { params: Promise<{ guid: string }> }) {
  return runWithAuditRequest(request, () => handleDELETE(request, { params }));
}
