import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "../../_shared/supabase";
import { getAuthenticatedUser } from "../../_shared/auth";
import { getPlaybookAccessRole } from "../../_shared/guards";
import { buildPlaybookUpdate } from "@/lib/playbook-access";
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
    request: NextRequest,
    { params }: { params: Promise<{ guid: string }> }
) {
    const { guid: idOrGuid } = await params;
    const searchParams = request.nextUrl.searchParams;
    const format = searchParams.get("format") || "json";
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

    const { data: playbook, error } = await query.single();

    if (error || !playbook) {
        return NextResponse.json({ error: "Playbook not found" }, { status: 404 });
    }

    // Check access: Public/Unlisted OR Owner
    const accessRole = user ? await getPlaybookAccessRole(user.id, playbook.id) : null;
    const isPublicOrUnlisted = playbook.visibility === 'public' || playbook.visibility === 'unlisted';

    if (!isPublicOrUnlisted && !accessRole) {
        return NextResponse.json({ error: "Playbook not found" }, { status: 404 });
    }

    // Get related data. The attachments come along with the skills because a
    // skill backed by a script is not usable without them: `apb pull` has to
    // be able to write the whole skill directory, and it only makes this one
    // request. They are dropped again below for the export formats, which
    // describe tools rather than files.
    const [skillsRes, mcpRes] = await Promise.all([
        supabase
            .from("skills")
            .select("*, skill_attachments(id, filename, content)")
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
            return NextResponse.json(formatAsOpenAPI(fullPlaybook));
        case "mcp":
            return NextResponse.json(formatAsMCP(fullPlaybook));
        case "anthropic":
            return NextResponse.json(formatAsAnthropic(fullPlaybook));
        case "markdown":
            return new NextResponse(formatAsMarkdown(fullPlaybook), {
                headers: { "Content-Type": "text/markdown" },
            });
        default:
            return NextResponse.json({ ...fullPlaybook, skills: skillsWithFiles });
    }
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ guid: string }> }
) {
    const user = await getAuthenticatedUser(request);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
        return NextResponse.json({ error: "Playbook not found" }, { status: 404 });
    }

    const accessRole = await getPlaybookAccessRole(user.id, playbook.id);
    if (!accessRole) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const updateData = buildPlaybookUpdate(body, accessRole);
    if (Object.keys(updateData).length === 0) {
        return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const { data, error } = await supabase
        .from("playbooks")
        .update(updateData)
        .eq("id", playbook.id)
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ guid: string }> }
) {
    const user = await getAuthenticatedUser(request);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
        return NextResponse.json({ error: "Playbook not found" }, { status: 404 });
    }

    // Check ownership
    if (playbook.user_id !== user.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error } = await supabase
        .from("playbooks")
        .delete()
        .eq("id", playbook.id);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
