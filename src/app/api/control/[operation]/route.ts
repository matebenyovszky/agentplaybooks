import { runWithAuditRequest } from "@/lib/audit-context";
import { POST as handleControlPlaneMcp } from "@/app/api/mcp/manage/route";
import { invokeMcpOperation } from "@/app/api/_shared/operation-http";

type RouteContext = { params: Promise<{ operation: string }> };

async function handlePOST(request: Request, context: RouteContext) {
  const { operation } = await context.params;
  const args = await request.json().catch(() => ({}));
  if (typeof args !== "object" || args === null || Array.isArray(args)) {
    return Response.json({ error: "JSON object body required" }, { status: 400 });
  }
  return invokeMcpOperation(
    handleControlPlaneMcp,
    request,
    "/api/mcp/manage",
    operation,
    args as Record<string, unknown>,
  );
}

export async function POST(request: Request, context: RouteContext) {
  return runWithAuditRequest(request, () => handlePOST(request, context));
}
