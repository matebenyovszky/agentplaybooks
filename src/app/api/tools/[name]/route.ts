// @worker-native
import { API_VERSION, apiVersionHeaders } from "@/lib/api-contract";
import { managementTools } from "@/app/api/_shared/management-tools";
import { operationPathsFromTools } from "@/app/api/_shared/operation-openapi";
import { MCP_CATALOG_REVISION } from "@/app/api/_shared/mcp-diagnostics";

type Context = { params: Promise<{ name: string }> };

/** One public built-in schema at a time. No private data or credential lookup. */
export async function GET(request: Request, context: Context) {
  const { name } = await context.params;
  const tool = managementTools().find(tool => tool.name === name);
  if (!tool) return Response.json({ error: "Built-in operation not found" }, { status: 404 });
  const url = new URL(request.url);
  const restPath = `/api/control/${tool.name}`;
  const headers = { ...apiVersionHeaders(), "Cache-Control": "public, max-age=300" };
  if (url.searchParams.get("format") === "openapi") {
    return Response.json({ openapi: "3.1.0", info: { title: `${tool.name} — AgentPlaybooks`, version: API_VERSION },
      servers: [{ url: url.origin }],
      paths: operationPathsFromTools([tool], () => restPath),
      components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } } },
    }, { headers });
  }
  if (url.searchParams.get("format") === "markdown") {
    return new Response([
      `# ${tool.name}`, "", tool.description ?? "", "",
      `Authenticated execution: POST /api/v1/control/${tool.name} with a JSON argument object.`,
      `Legacy v1 alias: POST ${restPath}.`,
      "Account tools require an authorized account connection; playbook tools additionally require playbook_id and that playbook’s access permissions.",
      "Use an authorized existing HTTP credential reference. Never obtain or copy host-owned OAuth tokens to use another transport.", "",
      "## Input schema", "", "```json", JSON.stringify(tool.inputSchema, null, 2), "```", "",
      "## Effect annotations", "", "```json", JSON.stringify(tool.annotations ?? {}, null, 2), "```",
    ].join("\n"), { headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } });
  }
  return Response.json({ api_version: API_VERSION, catalog_revision: MCP_CATALOG_REVISION, ...tool, rest: { method: "POST", path: restPath, versioned_path: `/api/v1/control/${tool.name}`, authentication_required: true } }, { headers });
}
