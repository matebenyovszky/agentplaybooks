import { SECURITY_HEADERS } from "../lib/security-headers";
import { LEGAL_REDIRECTS } from "../lib/legal-routes";
import { pageRoutePatterns, metadataRoutePaths } from "./page-route-patterns";
import { publicPagePaths } from "./public-page-paths";
import { matchApiRoute, type ApiRoute } from "./api-dispatch";
import type { PublicAssetBinding } from "./public-html-snapshot";

export function matchesPageRoute(pathname: string): boolean {
  const parts = pathname === "/" ? [] : pathname.slice(1).split("/");
  if (parts.some(part => !part)) return false;
  // These dynamic routes are backed solely by the deployed public content list.
  if (parts[0] === "docs" || parts[0] === "blog") return publicPagePaths.has(pathname);
  return pageRoutePatterns.some(pattern => {
    for (let index = 0; index < pattern.length; index++) {
      const segment = pattern[index];
      if (segment.startsWith("[[...")) return index <= parts.length;
      if (segment.startsWith("[...")) return index < parts.length;
      if (!parts[index] || (!segment.startsWith("[") && segment !== parts[index])) return false;
    }
    return pattern.length === parts.length;
  });
}

function pageResponse(request: Request, status: number, body: string, extra?: HeadersInit) {
  const headers = new Headers({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...extra });
  for (const { key, value } of SECURITY_HEADERS) headers.set(key, value);
  headers.set("X-APB-Page-Source", "NATIVE");
  return new Response(request.method === "HEAD" ? null : body, { status, headers });
}

const NOT_FOUND = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width"><title>404 — AgentPlaybooks</title></head><body><main><h1>404 — Page not found</h1><p>This page does not exist.</p><p><a href="/">Home</a> · <a href="/docs">Documentation</a></p></main></body></html>';

/** Handle canonical URLs and route misses without initializing Next. */
export async function routePageRequest(request: Request, routes: ApiRoute[], assets?: PublicAssetBinding): Promise<Response | null> {
  const url = new URL(request.url);
  const normalized = url.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
  let pathname: string;
  try { pathname = normalized.split("/").map(decodeURIComponent).join("/"); }
  catch { return pageResponse(request, 400, "Bad Request"); }
  // API dispatch has already handled real path parameters (including encoded
  // values). A remaining encoded separator must not turn a dispatch miss into
  // a reserved API route and initialize Next just to produce a 404.
  if (/%(?:2f|5c)/i.test(normalized)) return pageResponse(request, 400, "Bad Request");
  const redirect = (target: string, status: number) => {
    // Build from the current origin, never interpret a query value as a URL.
    url.pathname = target;
    return pageResponse(request, status, "", { Location: url.toString() });
  };
  const legal = LEGAL_REDIRECTS.find(rule => rule.source === pathname);
  if (legal) return redirect(legal.destination, legal.statusCode);
  if (request.method === "GET" || request.method === "HEAD") {
    if (pathname === "/docs" && url.searchParams.has("page")) {
      const slug = (url.searchParams.get("page") || "readme").replace(/\.md$/i, "").toLowerCase();
      const target = `/docs/${slug}`;
      if (!publicPagePaths.has(target)) return pageResponse(request, 404, NOT_FOUND);
      url.searchParams.delete("page");
      return redirect(target, 308);
    }
    if (/^\/docs\/[^/]+$/.test(pathname)) {
      const target = pathname.replace(/\.md$/i, "").toLowerCase();
      if (target !== pathname && publicPagePaths.has(target)) return redirect(target, 308);
    }
  }
  const known = matchesPageRoute(pathname) || matchApiRoute(pathname, routes) || metadataRoutePaths.has(pathname);
  if (known) {
    if (normalized !== url.pathname) return redirect(normalized, 308);
    return null; // Private/dynamic pages and reserved API handlers retain their flow.
  }
  // Assets are usually served before the Worker. Check the binding for URL
  // aliases and static-file redirects before deciding that a path is absent.
  if (assets && (request.method === "GET" || request.method === "HEAD")) {
    try {
      const asset = await assets.fetch(new Request(request.url, { method: request.method }));
      if (asset.status === 200 || (asset.status >= 300 && asset.status < 400)) return asset;
      await asset.body?.cancel().catch(() => {});
    } catch { return null; } // Binding failures must not invent a route miss.
  }
  return pageResponse(request, 404, NOT_FOUND);
}
