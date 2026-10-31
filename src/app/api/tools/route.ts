// @worker-native
import { API_VERSION, apiVersionHeaders } from "@/lib/api-contract";
import { managementTools } from "@/app/api/_shared/management-tools";
import { searchToolCatalog } from "@/app/api/_shared/toolsets";
import { MCP_CATALOG_REVISION } from "@/app/api/_shared/mcp-diagnostics";

/** Public documentation only: never inspect accounts, playbooks, connections or vaults. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("query") ?? "";
  const limit = Number(url.searchParams.get("limit") ?? 10);
  const offset = Number(url.searchParams.get("offset") ?? 0);
  if (query.length > 200 || !Number.isInteger(limit) || limit < 1 || limit > 25
      || !Number.isInteger(offset) || offset < 0 || offset > 1000) {
    return Response.json({ error: "Use query up to 200 characters, limit 1–25, and offset 0–1000." }, { status: 400 });
  }
  const tools = searchToolCatalog(managementTools(), query, limit, { includeSchemas: false, browse: true, offset });
  const next = tools.length === limit ? offset + tools.length : null;
  const headers = { ...apiVersionHeaders(), "Cache-Control": "public, max-age=300" };
  if (url.searchParams.get("format") === "markdown") {
    return new Response([
      "# AgentPlaybooks public tool catalog", "",
      "Built-in operation documentation only. Account data, connected private tools and execution require authentication.", "",
      ...tools.map(tool => `- [${tool.name}](/api/tools/${tool.name}?format=markdown): ${tool.description}`),
      ...(next !== null ? ["", `Next page: /api/tools?offset=${next}&limit=${limit}&query=${encodeURIComponent(query)}&format=markdown`] : []),
    ].join("\n"), { headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } });
  }
  return Response.json({ api_version: API_VERSION, catalog_revision: MCP_CATALOG_REVISION, tools, next_offset: next, detail_template: "/api/tools/{name}" }, { headers });
}
