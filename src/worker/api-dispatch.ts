import { SECURITY_HEADERS } from "../lib/security-headers";

export type ApiParams = Record<string, string | string[]>;
export type ApiHandlers = Record<string, (request: Request, context: { params: Promise<ApiParams> }) => Promise<Response> | Response>;
export type ApiRoute = { basePath?: string; segments: string[]; methods: string[]; handlers: ApiHandlers | (() => Promise<ApiHandlers>) | null };

export function matchApiRoute(pathname: string, routes: ApiRoute[]) {
  for (const route of routes) {
    const base = route.basePath ?? "/api";
    if (pathname !== base && !pathname.startsWith(`${base}/`)) continue;
    const parts = pathname === base ? [] : pathname.slice(base.length + 1).split("/");
    const params: ApiParams = {};
    let matched = true;
    let consumed = 0;
    for (let index = 0; index < route.segments.length; index++) {
      const segment = route.segments[index];
      const optionalCatchAll = segment.startsWith("[[...");
      if (optionalCatchAll || segment.startsWith("[...")) {
        const remaining = parts.slice(index);
        if ((!optionalCatchAll && !remaining.length) || remaining.some((part) => !part)) { matched = false; break; }
        if (remaining.length) {
          try { params[segment.slice(optionalCatchAll ? 5 : 4, optionalCatchAll ? -2 : -1)] = remaining.map(decodeURIComponent); }
          catch { return null; }
        }
        consumed = parts.length;
        break;
      }
      if (!parts[index]) { matched = false; break; }
      if (segment.startsWith("[")) {
        try { params[segment.slice(1, -1)] = decodeURIComponent(parts[index]); }
        catch { return null; } // Preserve Next's malformed-URL handling.
      } else if (segment !== parts[index]) { matched = false; break; }
      consumed++;
    }
    if (matched && consumed === parts.length) {
      return { route, params };
    }
  }
  return null;
}

export async function dispatchApi(request: Request, routes: ApiRoute[]): Promise<Response | null> {
  const url = new URL(request.url);
  // Next owns canonical redirects (including trailing slashes) and malformed URLs.
  if (url.pathname.endsWith("/") || url.pathname.includes("//")) return null;
  const match = matchApiRoute(url.pathname, routes);
  if (!match?.route.handlers) return null;
  const { route, params } = match;
  const method = request.method === "HEAD" && !route.methods.includes("HEAD") ? "GET" : request.method;
  let response: Response;
  const allowed = new Set([...route.methods, "OPTIONS"]);
  if (allowed.has("GET")) allowed.add("HEAD");
  if (!route.methods.includes(method)) {
    response = new Response(null, { status: method === "OPTIONS" ? 204 : 405, headers: { Allow: [...allowed].sort().join(", ") } });
  } else {
    try {
      // ESM caches each imported module. Lightweight discovery requests no
      // longer evaluate unrelated MCP, formatter, and secret-handler modules.
      const handlers = typeof route.handlers === "function" ? await route.handlers() : route.handlers!;
      response = await handlers[method](request, { params: Promise.resolve(params) });
    } catch (error) {
      // Keep private error details, tokens, and request data out of responses
      // and logs. Preserve HTTP 500 semantics instead of a Worker exception.
      console.error(JSON.stringify({ event: "api.handler_error", errorType: error instanceof Error ? error.name : "UnknownError" }));
      response = Response.json({ error: "Internal server error" }, { status: 500 });
    }
  }
  const headers = new Headers(response.headers);
  for (const { key, value } of SECURITY_HEADERS) headers.set(key, value);
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "no-store");
  if (request.method === "HEAD") await response.body?.cancel();
  return new Response(request.method === "HEAD" ? null : response.body, { status: response.status, statusText: response.statusText, headers });
}
