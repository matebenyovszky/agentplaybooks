import { API_MAJOR_HEADER, API_REVISION_HEADER } from "@/lib/api-contract";

type McpRouteHandler = (request: Request) => Response | Promise<Response>;

type McpError = {
  code?: number;
  message?: string;
  data?: { reason?: string; [key: string]: unknown };
};

function statusForMcpError(error: McpError): number {
  // Existing REST clients already interpret these status codes. Add precise
  // failure reasons in data without changing the legacy transport contract.
  if (error.code === -32602) return 400;
  if (error.code === -32001) return 401;
  if (error.code === -32002) return 404;
  return 422;
}
/** REST/OpenAPI projects the same operation handler, permission checks and diagnostics. */
export async function invokeMcpOperation(
  handler: McpRouteHandler,
  request: Request,
  endpointPath: string,
  operation: string,
  args: Record<string, unknown>,
): Promise<Response> {
  const endpointUrl = new URL(request.url);
  endpointUrl.pathname = endpointPath;
  endpointUrl.search = "";
  const rpcResponse = await handler(new Request(endpointUrl, {
    method: "POST",
    headers: new Headers(request.headers),
    body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method: "tools/call", params: { name: operation, arguments: args } }),
  }));

  const headers = new Headers({ "Cache-Control": "no-store" });
  for (const name of [API_MAJOR_HEADER, API_REVISION_HEADER]) {
    const value = rpcResponse.headers.get(name);
    if (value) headers.set(name, value);
  }
  const challenge = rpcResponse.headers.get("WWW-Authenticate");
  if (challenge) headers.set("WWW-Authenticate", challenge);
  const payload = await rpcResponse.json() as {
    result?: { content?: Array<{ type?: string; text?: string }>; structuredContent?: unknown };
    error?: McpError;
  };
  if (payload.error) {
    return Response.json({ error: payload.error.message || "Operation failed", code: payload.error.code,
      ...(payload.error.data ? { data: payload.error.data } : {}) }, {
      status: statusForMcpError(payload.error), headers,
    });
  }
  const text = payload.result?.content?.find(item => item.type === "text")?.text;
  if (text === undefined) return Response.json(payload.result ?? null, { headers });
  try { return Response.json(JSON.parse(text), { headers }); }
  catch { return Response.json({ result: text }, { headers }); }
}
