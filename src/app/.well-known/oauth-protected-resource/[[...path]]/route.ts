// Native Request/Response handler: shared by Next.js and the Worker dispatcher.
// @worker-native
import {
  MANAGEMENT_MCP_PATH,
  oauthResourceUrl,
  protectedResourceMetadata,
} from "@/lib/mcp-oauth";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ path?: string[] }> },
) {
  const { path } = await context.params;
  const resourcePath = path?.length ? `/${path.join("/")}` : MANAGEMENT_MCP_PATH;

  return Response.json(protectedResourceMetadata(oauthResourceUrl(resourcePath)), {
    headers: {
      "Cache-Control": "public, max-age=300",
    },
  });
}

