import { handle } from "hono/vercel";
import { createApiApp } from "@/app/api/_shared/hono";
import { getUserFromAuthOrApiKey } from "@/app/api/_shared/auth";
import { getServiceSupabase } from "@/app/api/_shared/supabase";
import { encryptMcpSecrets } from "@/lib/mcp/secrets";

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
  const { data: secretRow } = await getServiceSupabase()
    .from("mcp_server_secrets")
    .select("mcp_server_id, updated_at")
    .eq("mcp_server_id", serverId)
    .maybeSingle();
  return c.json({
    id: server.id,
    name: server.name,
    transport_type: server.transport_type,
    transport_config: server.transport_config || {},
    has_secrets: !!secretRow,
    secrets_updated_at: secretRow?.updated_at || null,
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
    secrets?: Record<string, unknown>;
  }>();
  const supabase = getServiceSupabase();
  if (body.transport_type || body.transport_config) {
    const { error } = await supabase.from("mcp_servers").update({
      ...(body.transport_type ? { transport_type: body.transport_type } : {}),
      ...(body.transport_config ? { transport_config: body.transport_config } : {}),
    }).eq("id", serverId);
    if (error) return c.json({ error: error.message }, 400);
  }
  if (body.secrets) {
    const encrypted = await encryptMcpSecrets(body.secrets);
    const { error } = await supabase.from("mcp_server_secrets").upsert({
      mcp_server_id: serverId,
      encrypted_payload: encrypted.encryptedPayload,
      iv: encrypted.iv,
      updated_at: new Date().toISOString(),
    });
    if (error) return c.json({ error: error.message }, 400);
  }
  return c.json({ success: true });
});

app.delete("/", async (c) => {
  const serverId = c.req.param("serverId");
  if (!serverId) return c.json({ error: "Missing MCP server ID" }, 400);
  const server = await ownedServer(c.req.raw, serverId);
  if (!server) return c.json({ error: "MCP server not found" }, 404);
  const { error } = await getServiceSupabase()
    .from("mcp_server_secrets")
    .delete()
    .eq("mcp_server_id", serverId);
  if (error) return c.json({ error: error.message }, 400);
  return c.json({ success: true });
});

export const GET = handle(app);
export const PUT = handle(app);
export const DELETE = handle(app);
