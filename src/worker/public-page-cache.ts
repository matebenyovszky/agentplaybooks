import { resolveLocale } from "../i18n/resolve-locale";
import { publicPagePaths } from "./public-page-paths";

export interface PublicPageCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

const fills = new Map<string, Promise<void>>();
const BROWSER_CACHE_CONTROL = "private, no-cache, no-store, max-age=0, must-revalidate";

export function publicPageCacheKey(request: Request, version: unknown): Request | null {
  if (typeof version !== "string" || !version || version.length > 128 || request.method !== "GET") return null;
  const url = new URL(request.url);
  if (!publicPagePaths.has(url.pathname) || url.search) return null;
  for (const [name] of request.headers) {
    if (name === "authorization" || name === "x-api-key" || name === "rsc" || name === "range"
      || name === "upgrade" || name === "x-matched-path"
      || name.startsWith("next-") || name.startsWith("if-") || name.startsWith("x-middleware-")
      || name.startsWith("x-nextjs-") || name.startsWith("x-invoke-")) return null;
  }
  const accept = request.headers.get("accept");
  if (accept && !accept.includes("text/html") && !accept.includes("*/*")) return null;
  let cookieLocale: string | undefined;
  for (const cookie of (request.headers.get("cookie") ?? "").split(";").map(item => item.trim()).filter(Boolean)) {
    const separator = cookie.indexOf("=");
    if (separator < 0 || cookie.slice(0, separator) !== "NEXT_LOCALE") return null;
    try { cookieLocale = decodeURIComponent(cookie.slice(separator + 1)); } catch { return null; }
  }
  url.searchParams.set("__apb_public_version", version);
  url.searchParams.set("__apb_public_locale", resolveLocale(cookieLocale, request.headers.get("accept-language")));
  // Cache keys never contain cookies, credentials, or client-controlled query strings.
  return new Request(url.toString());
}

function pageResponse(response: Response, status: "HIT" | "MISS"): Response {
  const headers = new Headers(response.headers);
  // Only the explicitly keyed Cache API may reuse HTML. Ordinary CDN/browser
  // caches must not mix locales or RSC and document responses.
  headers.set("Cache-Control", BROWSER_CACHE_CONTROL);
  headers.set("X-APB-Page-Cache", status);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export async function servePublicPage(
  request: Request,
  version: unknown,
  cache: PublicPageCache | undefined,
  render: () => Promise<Response>,
): Promise<Response> {
  const key = publicPageCacheKey(request, version);
  if (!key || !cache) return render();
  const read = () => cache.match(key).catch(() => undefined);
  const cached = await read();
  if (cached) return pageResponse(cached, "HIT");
  const existing = fills.get(key.url);
  if (existing) {
    await existing;
    const filled = await read();
    if (filled) return pageResponse(filled, "HIT");
  }

  let response: Response;
  const fill = Promise.resolve().then(async () => {
    response = await render();
    if (response.status !== 200 || response.headers.has("Set-Cookie")
      || !response.headers.get("Content-Type")?.startsWith("text/html")
      || response.headers.get("Vary")?.split(",").some(value => value.trim() === "*")) return;
    const stored = response.clone();
    const headers = new Headers(stored.headers);
    headers.set("Cache-Control", "public, max-age=300");
    await cache.put(key, new Response(stored.body, { status: stored.status, headers })).catch(() => {});
  });
  if (fills.size < 8) fills.set(key.url, fill);
  try { await fill; } finally { if (fills.get(key.url) === fill) fills.delete(key.url); }
  return pageResponse(response!, "MISS");
}
