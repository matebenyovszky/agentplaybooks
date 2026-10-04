import { SECURITY_HEADERS } from "../lib/security-headers";

export type ApiHandlers = Record<string, (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>>;
export type ApiRoute = { segments: string[]; methods: string[]; handlers: ApiHandlers | null };

export function matchApiRoute(pathname: string, routes: ApiRoute[]) {
  if (!pathname.startsWith("/api/")) return null;
  const parts = pathname.slice(5).split("/");
  for (const route of routes) {
    const params: Record<string, string> = {};
    let matched = true;
    for (let index = 0; index < route.segments.length; index++) {
      const segment = route.segments[index];
      if (segment.startsWith("[[...")) break;
      if (!parts[index]) { matched = false; break; }
      if (segment.startsWith("[")) {
        try { params[segment.slice(1, -1)] = decodeURIComponent(parts[index]); }
        catch { return null; } // Preserve Next's malformed-URL handling.
      } else if (segment !== parts[index]) { matched = false; break; }
    }
    if (matched && (route.segments.at(-1)?.startsWith("[[...") || parts.length === route.segments.length)) {
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
  const handler = route.handlers![method];
  let response: Response;
  if (handler) {
    response = await handler(request, { params: Promise.resolve(params) });
  } else if (method === "OPTIONS") {
    const allowed = new Set([...route.methods, "OPTIONS"]);
    if (allowed.has("GET")) allowed.add("HEAD");
    response = new Response(null, { status: 204, headers: { Allow: [...allowed].sort().join(", ") } });
  } else {
    response = new Response(null, { status: 405 });
  }
  const headers = new Headers(response.headers);
  for (const { key, value } of SECURITY_HEADERS) headers.set(key, value);
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "no-store");
  return new Response(request.method === "HEAD" ? null : response.body, { status: response.status, statusText: response.statusText, headers });
}
