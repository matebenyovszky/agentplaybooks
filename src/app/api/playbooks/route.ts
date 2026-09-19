import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "../_shared/auth";
import {
    createPlaybook,
    listAccessiblePlaybooks,
    parseCreatePlaybookInput,
} from "@/lib/repositories/playbooks";

export async function GET(request: NextRequest) {
    const user = await requireAuth(request);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        return NextResponse.json(await listAccessiblePlaybooks(user.id));
    } catch (error) {
        const message = error instanceof Error ? error.message : "Database error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const user = await requireAuth(request);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = parseCreatePlaybookInput(body);
    if ("error" in parsed) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    try {
        const data = await createPlaybook(user.id, parsed.input);
        return NextResponse.json(data, { status: 201 });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Database error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
