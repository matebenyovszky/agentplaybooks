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

    const { data, error } = await supabase
        .from("playbooks")
        .select(`
      *,
      skills:skills(count),
      mcp_servers:mcp_servers(count)
    `)
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Transform count objects to numbers
    const playbooks = (data || []).map((p) => {
        const playbook = p as unknown as Playbook & {
            skills: { count: number }[];
            mcp_servers: { count: number }[];
        };
        return {
            ...playbook,
            persona_count: playbook.persona_name ? 1 : 0,
            skill_count: playbook.skills?.[0]?.count || 0,
            mcp_server_count: playbook.mcp_servers?.[0]?.count || 0,
            skills: undefined,
            mcp_servers: undefined,
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
