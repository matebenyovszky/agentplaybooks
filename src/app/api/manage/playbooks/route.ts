import { NextRequest, NextResponse } from "next/server";
import { getUserFromAuthOrApiKey } from "../../_shared/auth";
import {
  createPlaybook,
  listAccessiblePlaybooks,
  parseCreatePlaybookInput,
} from "@/lib/repositories/playbooks";

export async function GET(request: NextRequest) {
  const user = await getUserFromAuthOrApiKey(request, "playbooks:read");
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
  const user = await getUserFromAuthOrApiKey(request, "playbooks:write");
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = parseCreatePlaybookInput(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const playbook = await createPlaybook(user.id, parsed.input);
    return NextResponse.json(playbook, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
