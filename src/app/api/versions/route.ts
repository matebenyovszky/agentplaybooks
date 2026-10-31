// @worker-native
import { apiCompatibilityInfo, apiVersionHeaders } from "@/lib/api-contract";

/** Small, public compatibility metadata; no tool schemas, account or vault reads. */
export async function GET() {
  return Response.json(apiCompatibilityInfo(), { headers: {
    ...apiVersionHeaders(), "Cache-Control": "public, max-age=300",
    "Access-Control-Allow-Origin": "*",
  } });
}
