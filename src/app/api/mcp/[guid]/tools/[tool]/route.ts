import { handle } from "hono/vercel";
import { createApiApp } from "@/app/api/_shared/hono";
import { validateApiKey } from "@/app/api/_shared/auth";
import { getServiceSupabase, getSupabase } from "@/app/api/_shared/supabase";
import {
  callFederatedTool,
  federatedServerPrefix,
  type FederationAuditEvent,
} from "@/lib/mcp/federation";
import { decryptMcpSecrets } from "@/lib/mcp/secrets";
import type { ApiKey, MCPServer } from "@/lib/supabase/types";

type AuthenticatedPlaybookKey = ApiKey & { playbooks: { id: string; guid: string } };

const app = createApiApp("/api/mcp/:guid/tools/:tool");

app.post("/", async (c) => {
  const guid = c.req.param("guid");
  const toolName = c.req.param("tool");
  if (!guid || !toolName) return c.json({ error: "Missing playbook GUID or tool name" }, 400);
  const supabase = getSupabase();
  let { data: playbook } = await supabase
    .from("playbooks")
    .select("id")
    .eq("guid", guid)
    .eq("visibility", "public")
    .single();
  let authenticatedKey: AuthenticatedPlaybookKey | null = null;
  if (!playbook) {
    authenticatedKey = await validateApiKey(c.req.raw, "tools:call");
    if (authenticatedKey?.playbooks.guid === guid) {
      playbook = { id: authenticatedKey.playbooks.id };
    }
  }
  if (!playbook) return c.json({ error: "Playbook not found" }, 404);
  const { data: rows } = await getServiceSupabase()
    .from("mcp_servers")
    .select("*")
    .eq("playbook_id", playbook.id);
  const server = ((rows || []) as MCPServer[]).find((item) => toolName.startsWith(federatedServerPrefix(item)));
  if (!server) return c.json({ error: "Federated tool not found" }, 404);
  const access = (server.transport_config as { access?: string } | null)?.access;
  if (access !== "public") {
    const key = authenticatedKey || await validateApiKey(c.req.raw, "tools:call");
    if (!key || key.playbooks.id !== playbook.id) return c.json({ error: "tools:call permission required" }, 401);
  }
  const service = getServiceSupabase();
  const { data: secretRow } = await service
    .from("mcp_server_secrets")
    .select("encrypted_payload, iv")
    .eq("mcp_server_id", server.id)
    .maybeSingle();
  const secrets = secretRow ? await decryptMcpSecrets(secretRow.encrypted_payload, secretRow.iv) : {};
  const requestId = c.req.header("cf-ray") || c.req.header("x-request-id") || crypto.randomUUID();
  const audit = async (event: FederationAuditEvent) => {
    await service.from("mcp_proxy_audit_logs").insert({
      playbook_id: playbook.id,
      mcp_server_id: event.serverId,
      operation: event.operation,
      target: event.target || null,
      status: event.status,
      latency_ms: event.latencyMs,
      error_code: event.errorCode || null,
      request_id: requestId,
    });
  };
  try {
    const args = await c.req.json<Record<string, unknown>>().catch(() => ({}));
    const result = await callFederatedTool(server, toolName, args, { secrets, audit });
    return c.json({ tool: toolName, result });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Federated tool call failed", request_id: requestId }, 502);
  }
});

export const POST = handle(app);
