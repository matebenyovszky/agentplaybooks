import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, CallToolResultSchema, ListToolsRequestSchema, ToolSchema } from "@modelcontextprotocol/sdk/types.js";
import { managementTools } from "@/app/api/_shared/management-tools";
import { managementToolset } from "@/app/api/_shared/management-toolsets";

const requiredEnvironment = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "AGENTPLAYBOOKS_API_KEY",
] as const;

function toolError(text: string) {
  return { isError: true, content: [{ type: "text" as const, text }] };
}

/** Local transport for the application's account tools, using the same handlers and authorization. */
export function createStdioServer() {
  const view = managementToolset(managementTools(), process.env.AGENTPLAYBOOKS_TOOLSET);
  if ("error" in view) throw new Error(view.error);
  const tools = view.advertised.map(tool => ToolSchema.parse(tool));
  const server = new Server(
    { name: "agentplaybooks-management", version: "0.4.0" },
    {
      capabilities: { tools: {} },
      instructions: "AgentPlaybooks account tools. Discovery defaults to 15 common tools and works without credentials. Use find_tools to discover additional operations, or set AGENTPLAYBOOKS_TOOLSET=full for clients requiring all schemas up front. Tool calls require your self-hosted Supabase configuration and an AgentPlaybooks user API key; existing account permissions apply. No hosted MCP endpoint is proxied.",
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (!["core", "full", "runtime"].includes(view.name) && !view.allows(request.params.name)) {
      return toolError(`Tool is not available in the ${view.name} toolset.`);
    }
    const missing = requiredEnvironment.filter((name) => !process.env[name]);
    if (missing.length) {
      return toolError(`Local AgentPlaybooks is not configured. Set ${missing.join(", ")} to execute tools. See docs/mcp-stdio.md. No tool was executed.`);
    }
    try {
      // Import lazily: protocol discovery needs neither database clients nor credentials.
      // Invoke our local handler in-process; its normal API-key and ownership checks run unchanged.
      const { POST } = await import("@/app/api/mcp/manage/route");
      const response = await POST(new Request(`http://localhost/api/mcp/manage?toolset=${view.name}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-API-Key": process.env.AGENTPLAYBOOKS_API_KEY!,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: request.params }),
      }));
      if (!response.ok) {
        return toolError(response.status === 401 || response.status === 403
          ? "AgentPlaybooks rejected the API key or permission. No additional access was granted."
          : `The local AgentPlaybooks handler failed (HTTP ${response.status}).`);
      }
      const payload = await response.json();
      if (payload.error) return toolError(payload.error.message || "AgentPlaybooks could not execute the tool.");
      return CallToolResultSchema.parse(payload.result);
    } catch {
      // Do not send database connection details, credentials or exception stacks to MCP clients.
      return toolError("The local AgentPlaybooks handler could not complete this request. Check the self-hosted configuration.");
    }
  });
  return server;
}
