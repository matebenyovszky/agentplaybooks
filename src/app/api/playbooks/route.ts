// Native Request/Response handler: shared by Next.js and the Worker dispatcher.
// @worker-native
import { requireAuth } from "../_shared/auth";
import {
    createPlaybook,
    listAccessiblePlaybooks,
    parseCreatePlaybookInput,
} from "@/lib/repositories/playbooks";

export async function GET(request: Request) {
    const user = await requireAuth(request);
    if (!user) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        return Response.json(await listAccessiblePlaybooks(user.id));
    } catch (error) {
        const message = error instanceof Error ? error.message : "Database error";
        return Response.json({ error: message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const user = await requireAuth(request);
    if (!user) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = parseCreatePlaybookInput(body);
    if ("error" in parsed) {
        return Response.json({ error: parsed.error }, { status: 400 });
    }

    try {
        const data = await createPlaybook(user.id, parsed.input);
        return Response.json(data, { status: 201 });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Database error";
        return Response.json({ error: message }, { status: 500 });
    }
}
