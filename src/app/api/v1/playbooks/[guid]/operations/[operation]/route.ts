// @worker-native
import { POST as legacyPOST } from "@/app/api/playbooks/[guid]/operations/[operation]/route";
import { invokeApiV1 } from "@/lib/api-contract";

type RouteContext = { params: Promise<{ guid: string; operation: string }> };

export async function POST(request: Request, context: RouteContext) {
  return invokeApiV1(request, pinned => legacyPOST(pinned, context));
}
