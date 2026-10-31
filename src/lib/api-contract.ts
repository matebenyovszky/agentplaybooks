import contract from "./api-contract.json";

export const API_VERSION = contract.api_version;
export const API_MAJOR = contract.default_major;
export const API_MAJOR_HEADER = "X-AgentPlaybooks-API-Version";
export const API_REVISION_HEADER = "X-AgentPlaybooks-API-Revision";

export function apiCompatibilityInfo() {
  return {
    ...contract,
    version_discovery: "/api/versions",
    rest_base_path: `/api/v${API_MAJOR}`,
    mcp_endpoint: "/api/mcp/manage",
    version_header: API_MAJOR_HEADER,
    policy: { breaking_change: "new_major", additive_change: "minor", compatible_fix: "patch" },
  };
}

export function apiVersionHeaders(major = contract.unversioned_alias_major) {
  const versions: Record<string, string> = contract.versions;
  return { [API_MAJOR_HEADER]: String(major), [API_REVISION_HEADER]: versions[String(major)] ?? API_VERSION };
}

/** Absence stays pinned to v1; it must never follow the newest major automatically. */
export function apiVersionProblem(request: Request) {
  const requested = request.headers.get(API_MAJOR_HEADER)?.trim() ?? String(contract.unversioned_alias_major);
  if (contract.supported_majors.some(major => String(major) === requested)) return null;
  return {
    reason: "unsupported_api_version",
    requested_version: requested.slice(0, 100),
    supported_majors: contract.supported_majors,
    api_version: API_VERSION,
    next_steps: ["Select a supported API major or update the plugin. GET /api/versions describes compatibility. The MCP-Protocol-Version header is separate."],
  };
}

export function apiVersionRefusal(request: Request): Response | null {
  const data = apiVersionProblem(request);
  if (!data) return null;
  const message = "Unsupported AgentPlaybooks API version; request a supported major number.";
  const body = new URL(request.url).pathname.startsWith("/api/mcp/")
    ? { jsonrpc: "2.0", id: null, error: { code: -32602, message, data } }
    : { error: message, data };
  return Response.json(body, { status: 400, headers: { ...apiVersionHeaders(), "Cache-Control": "no-store" } });
}

/** Reuse existing handlers without redirecting credentials or changing their OAuth resource. */
export async function invokeApiV1(
  request: Request,
  handler: (request: Request) => Response | Promise<Response>,
): Promise<Response> {
  const requested = request.headers.get(API_MAJOR_HEADER)?.trim();
  if (requested !== undefined && requested !== "1") {
    return Response.json({ error: "The /api/v1 path requires API major 1.", data: {
      reason: "api_version_conflict", requested_version: requested.slice(0, 100), path_major: 1,
    } }, { status: 400, headers: { ...apiVersionHeaders(), "Cache-Control": "no-store" } });
  }
  const headers = new Headers(request.headers);
  headers.set(API_MAJOR_HEADER, "1");
  const response = await handler(new Request(request, { headers }));
  const result = new Response(response.body, response);
  // v1 aliases remain v1 even after the service adds another default major.
  result.headers.set(API_MAJOR_HEADER, "1");
  result.headers.set(API_REVISION_HEADER, apiVersionHeaders(1)[API_REVISION_HEADER]);
  return result;
}
