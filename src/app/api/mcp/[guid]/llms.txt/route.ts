import { handle } from "hono/vercel";
import { createApiApp } from "@/app/api/_shared/hono";
import { canAccessPrivatePlaybook } from "@/app/api/_shared/auth";
import { privateAccessRefusal } from "@/app/api/_shared/mcp-protocol";
import { getServiceSupabase, getSupabase } from "@/app/api/_shared/supabase";
import { PLAYBOOK_TOOLS } from "@/app/api/_shared/playbook-tools";
import { buildAgentGuide } from "@/app/api/_shared/llms-guide";
import type { MCPServer } from "@/lib/supabase/types";

/**
 * `GET /api/mcp/:guid/llms.txt` — the one-fetch agent guide, as markdown.
 *
 * The JSON manifest tells a program what exists; this tells an agent how to
 * use it: authentication, the one-POST calling convention, a one-shot example
 * per tool. A private playbook serves it only to a caller its key admits — the
 * guide names tools and their shapes, which is exactly what "private" hides.
 */

const app = createApiApp("/api/mcp/:guid/llms.txt");

app.get("/", async (c) => {
  const guid = c.req.param("guid");
  if (!guid) return c.text("Missing playbook GUID", 400);
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(guid);

  let query = getSupabase().from("playbooks").select("id, guid, name, description");
  query = isUuid ? query.eq("id", guid) : query.eq("guid", guid);
  let { data: playbook } = await query.eq("visibility", "public").maybeSingle();

  if (!playbook) {
    let privateQuery = getServiceSupabase().from("playbooks").select("id, guid, name, description");
    privateQuery = isUuid ? privateQuery.eq("id", guid) : privateQuery.eq("guid", guid);
    const { data: privatePlaybook } = await privateQuery.maybeSingle();
    if (privatePlaybook && await canAccessPrivatePlaybook(c.req.raw, privatePlaybook.id)) {
      playbook = privatePlaybook;
    } else if (privatePlaybook) {
      const refusal = privateAccessRefusal(c.req.raw);
      return c.text(refusal.message, refusal.status, refusal.headers);
    }
  }
  if (!playbook) return c.text("Playbook not found", 404);

  const { data: mcpRows } = await getServiceSupabase()
    .from("mcp_servers")
    .select("*")
    .eq("playbook_id", playbook.id);

  const requestUrl = new URL(c.req.url);
  const guide = buildAgentGuide({
    baseUrl: `${requestUrl.protocol}//${requestUrl.host}`,
    guid: playbook.guid ?? guid,
    playbookName: playbook.name ?? "AgentPlaybooks playbook",
    description: playbook.description,
    tools: PLAYBOOK_TOOLS,
    servers: (mcpRows || []) as MCPServer[],
  });

  return c.text(guide, 200, {
    "Content-Type": "text/markdown; charset=utf-8",
    "Cache-Control": "public, max-age=300",
  });
});

export const GET = handle(app);
