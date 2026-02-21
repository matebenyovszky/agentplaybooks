import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "../../_shared/supabase";
import { getAuthenticatedUser } from "../../_shared/auth";
import {
    formatAsOpenAPI,
    formatAsMCP,
    formatAsAnthropic,
    formatAsMarkdown,
    PlaybookWithExports
} from "../../_shared/formatters";

// Helper: Convert playbook to persona shape
function playbookToPersona(playbook: any) {
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
    { params }: { params: { guid: string } }
) {
    const { guid: idOrGuid } = params;
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
    const isOwner = user && playbook.user_id === user.id;
    const isPublicOrUnlisted = playbook.visibility === 'public' || playbook.visibility === 'unlisted';

    if (!isPublicOrUnlisted && !isOwner) {
        return NextResponse.json({ error: "Playbook not found" }, { status: 404 });
    }

    // Get related data
    const [skillsRes, mcpRes] = await Promise.all([
        supabase.from("skills").select("*").eq("playbook_id", playbook.id),
        supabase.from("mcp_servers").select("*").eq("playbook_id", playbook.id),
    ]);

    const persona = playbookToPersona(playbook);

    const fullPlaybook: PlaybookWithExports = {
        ...playbook,
        persona,
        personas: [persona],
        skills: skillsRes.data || [],
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
            return NextResponse.json(fullPlaybook);
    }
}

async function checkPlaybookOwnership(userId: string, playbookId: string): Promise<boolean> {
    const supabase = getServiceSupabase();
    const { data } = await supabase
        .from("playbooks")
        .select("id")
        .eq("id", playbookId)
        .eq("user_id", userId)
        .single();
    return !!data;
}

export async function PUT(
    request: NextRequest,
    { params }: { params: { guid: string } }
) {
    const user = await getAuthenticatedUser(request);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { guid: idOrGuid } = params;
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

    const body = await request.json();
    const { name, description, is_public, visibility, config } = body;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (visibility !== undefined) {
        updateData.visibility = visibility;
    } else if (is_public !== undefined) {
        updateData.visibility = is_public ? 'public' : 'private';
    }
    if (config !== undefined) updateData.config = config;

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
    { params }: { params: { guid: string } }
) {
    const user = await getAuthenticatedUser(request);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { guid: idOrGuid } = params;
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
