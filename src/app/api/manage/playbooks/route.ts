import { NextRequest, NextResponse } from "next/server";
import { getUserFromAuthOrApiKey } from "../../_shared/auth";
import {
  createPlaybook,
  listAccessiblePlaybooks,
  parseCreatePlaybookInput,
} from "@/lib/repositories/playbooks";

/**
 * `/api/manage/*` is the control-plane surface a user API key is for, and the
 * catch-all Hono app answers every other path under it with
 * `getUserFromAuthOrApiKey`. This file is a concrete Next.js route, so it wins
 * the match over that catch-all — and it used to accept only a browser
 * session, which silently removed key support from this one path.
 *
 * The CLI walks straight into it: `apb pull <guid>` lists playbooks to resolve
 * the guid, gets 401 here, and reports "Unauthorized" while `apb pull <uuid>`
 * on the very same key works, because that path does reach the Hono app.
 */
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
