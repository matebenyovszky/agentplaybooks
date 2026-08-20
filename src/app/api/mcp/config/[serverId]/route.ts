import { handle } from "hono/vercel";
import { createApiApp } from "@/app/api/_shared/hono";
import { getUserFromAuthOrApiKey } from "@/app/api/_shared/auth";
import { getServiceSupabase } from "@/app/api/_shared/supabase";
import { FederationError, knownProtocolEra, listFederatedResources, listFederatedTools } from "@/lib/mcp/federation";
import { loadFederationSecrets } from "@/app/api/_shared/federation-secrets";
import type { MCPServer } from "@/lib/supabase/types";

const app = createApiApp("/api/mcp/config/:serverId");

async function ownedServer(request: Request, serverId: string) {
  const user = await getUserFromAuthOrApiKey(request, "playbooks:write");
  if (!user) return null;
  const { data } = await getServiceSupabase()
    .from("mcp_servers")
    .select("id, playbook_id, name, transport_type, transport_config, playbooks!inner(user_id)")
    .eq("id", serverId)
    .eq("playbooks.user_id", user.id)
    .single();
  return data;
}

app.get("/", async (c) => {
  const serverId = c.req.param("serverId");
  if (!serverId) return c.json({ error: "Missing MCP server ID" }, 400);
  const server = await ownedServer(c.req.raw, serverId);
  if (!server) return c.json({ error: "MCP server not found" }, 404);
  return c.json({
    id: server.id,
    name: server.name,
    transport_type: server.transport_type,
    transport_config: server.transport_config || {},
  });
});

app.put("/", async (c) => {
  const serverId = c.req.param("serverId");
  if (!serverId) return c.json({ error: "Missing MCP server ID" }, 400);
  const server = await ownedServer(c.req.raw, serverId);
  if (!server) return c.json({ error: "MCP server not found" }, 404);
  const body = await c.req.json<{
    transport_type?: "http" | "sse" | "openapi";
    transport_config?: Record<string, unknown>;
  }>();
  const supabase = getServiceSupabase();
  if (body.transport_type || body.transport_config) {
    const { error } = await supabase.from("mcp_servers").update({
      ...(body.transport_type ? { transport_type: body.transport_type } : {}),
      ...(body.transport_config ? { transport_config: body.transport_config } : {}),
    }).eq("id", serverId);
    if (error) return c.json({ error: error.message }, 400);
  }
  return c.json({ success: true });
});

/**
 * Ask the upstream what it offers, using the credential resolution a real call
 * would use.
 *
 * A federated server's tools are discovered from the upstream at call time, so
 * the stored `tools`/`resources` columns stay empty for one and there was no way
 * to tell a working connection from a wrong URL or a missing secret except by
 * connecting an agent and watching it fail. This is that check, on demand.
 */
app.post("/test", async (c) => {
  const serverId = c.req.param("serverId");
  if (!serverId) return c.json({ error: "Missing MCP server ID" }, 400);
  const server = await ownedServer(c.req.raw, serverId);
  if (!server) return c.json({ error: "MCP server not found" }, 404);

  const full = { ...server, tools: [], resources: [] } as unknown as MCPServer;
  try {
    const secrets = await loadFederationSecrets(full, server.playbook_id);
    const [tools, resources] = await Promise.all([
      listFederatedTools([full], { secrets }),
      listFederatedResources([full], { secrets }),
    ]);
    return c.json({
      ok: true,
      era: knownProtocolEra(String((server.transport_config as { url?: string } | null)?.url ?? "")),
      tools: tools.map((tool) => tool.name),
      resources: resources.map((resource) => resource.uri),
    });
  } catch (error) {
    // The upstream's own words are the useful part — "Missing secret: X" or a
    // 401 from the far end says far more than "test failed".
    const federation = error instanceof FederationError
      ? { code: error.code, status: error.status }
      : {};
    return c.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      ...federation,
    }, 200);
  }
});

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const DELETE = handle(app);
