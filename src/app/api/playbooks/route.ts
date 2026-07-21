import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "../_shared/supabase";
import { requireAuth } from "../_shared/auth";
import { generateGuid } from "@/lib/utils";
import type { Playbook } from "@/lib/supabase/types";

export async function GET(request: NextRequest) {
    const user = await requireAuth(request);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getServiceSupabase();

    const { data: ownedData, error } = await supabase
        .from("playbooks")
        .select(`
      *,
      skills:skills(count),
      mcp_servers:mcp_servers(count),
      memories:memories(count)
    `)
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: memberships, error: membershipError } = await supabase
        .from("playbook_collaborators")
        .select("playbook_id")
        .eq("user_id", user.id)
        .not("accepted_at", "is", null);
    if (membershipError) {
        return NextResponse.json({ error: membershipError.message }, { status: 500 });
    }

    const sharedIds = (memberships || []).map((membership) => membership.playbook_id);
    let sharedData: typeof ownedData = [];
    if (sharedIds.length > 0) {
        const sharedResult = await supabase
            .from("playbooks")
            .select(`
      *,
      skills:skills(count),
      mcp_servers:mcp_servers(count),
      memories:memories(count)
    `)
            .in("id", sharedIds)
            .order("updated_at", { ascending: false });
        if (sharedResult.error) {
            return NextResponse.json({ error: sharedResult.error.message }, { status: 500 });
        }
        sharedData = sharedResult.data || [];
    }

    // Transform count objects to numbers
    const rows = [
        ...(ownedData || []).map((playbook) => ({ playbook, role: "owner" as const })),
        ...(sharedData || []).map((playbook) => ({ playbook, role: "editor" as const })),
    ].sort((a, b) => new Date(b.playbook.updated_at).getTime() - new Date(a.playbook.updated_at).getTime());
    const playbooks = rows.map(({ playbook: p, role }) => {
        const playbook = p as unknown as Playbook & {
            skills: { count: number }[];
            mcp_servers: { count: number }[];
            memories: { count: number }[];
        };
        return {
            ...playbook,
            current_user_role: role,
            skill_count: playbook.skills?.[0]?.count || 0,
            mcp_server_count: playbook.mcp_servers?.[0]?.count || 0,
            memory_count: playbook.memories?.[0]?.count || 0,
            skills: undefined,
            mcp_servers: undefined,
            memories: undefined,
        };
    });

    return NextResponse.json(playbooks);
}

export async function POST(request: NextRequest) {
    const user = await requireAuth(request);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, description, is_public, visibility, config } = body;

    if (!name) {
        return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const supabase = getServiceSupabase();
    const guid = generateGuid();

    // Determine visibility
    let visibilityValue = visibility;
    if (!visibilityValue && is_public !== undefined) {
        visibilityValue = is_public ? 'public' : 'private';
    }
    if (!visibilityValue) visibilityValue = 'private';

    const { data, error } = await supabase
        .from("playbooks")
        .insert({
            user_id: user.id,
            guid,
            name,
            description: description || null,
            visibility: visibilityValue,
            config: config || {},
        })
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
}
