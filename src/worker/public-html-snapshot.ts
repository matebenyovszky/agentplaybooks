import { SECURITY_HEADERS } from "../lib/security-headers";
import { publicPagePaths } from "./public-page-paths";
import { resolveLocale } from "../i18n/resolve-locale";

export interface PublicAssetBinding {
  fetch(request: Request): Promise<Response>;
}

export type SnapshotVariant = "html" | "rsc" | "prefetch" | "tree" | "metadata";

export function publicSnapshotPath(locale: string, pathname: string, variant: SnapshotVariant = "html"): string {
  return `/__apb_public_html/${locale}${pathname === "/" ? "/index" : pathname}${variant === "html" ? "" : `.${variant}`}.snapshot`;
}

/** These exact pages have no server session data, actions or query-dependent content. */
export function publicSnapshotRequest(request: Request, version: unknown) {
  if (typeof version !== "string" || !version || version.length > 128
    || (request.method !== "GET" && request.method !== "HEAD")) return null;
  const url = new URL(request.url);
  if (!publicPagePaths.has(url.pathname) || (url.pathname === "/docs" && url.searchParams.has("page"))) return null;
  // Draft content and unsupported internal protocols must still reach Next.
  for (const [name] of request.headers) {
    if (name === "upgrade" || name === "x-matched-path" || name === "next-action"
      || name.startsWith("x-middleware-") || name.startsWith("x-nextjs-")
      || name.startsWith("x-invoke-") || (name.startsWith("next-")
        && !["next-router-state-tree", "next-router-prefetch", "next-router-segment-prefetch", "next-url"].includes(name))) return null;
  }
  const cookies = (request.headers.get("cookie") ?? "").split(";").map(value => value.trim());
  if (cookies.some(value => /^__prerender_bypass=/.test(value))) return null;
  const encodedLocale = cookies.filter(value => value.startsWith("NEXT_LOCALE=")).at(-1)?.slice("NEXT_LOCALE=".length);
  let cookieLocale: string | undefined;
  try { cookieLocale = encodedLocale === undefined ? undefined : decodeURIComponent(encodedLocale); } catch { return null; }
  const rsc = request.headers.get("rsc");
  if (rsc !== null && rsc !== "1") return null;
  const prefetch = request.headers.get("next-router-prefetch");
  if (prefetch !== null && (prefetch !== "1" || rsc !== "1")) return null;
  const segment = request.headers.get("next-router-segment-prefetch");
  if (segment !== null && (segment !== "/_tree" || rsc !== "1" || prefetch !== "1")) return null;
  // Next requests missing page-head data separately. Returning an ordinary
  // prefetch (whose head is null) leaves that cache entry pending and causes
  // repeated metadata requests. Only the exact build-owned stub is reusable.
  let metadataOnly = false;
  const stateTree = request.headers.get("next-router-state-tree");
  if (stateTree?.includes("metadata-only")) {
    if (rsc !== "1" || segment !== null || stateTree.length > 512) return null;
    try {
      const state = JSON.parse(decodeURIComponent(stateTree));
      if (!Array.isArray(state) || state.length !== 4 || state[0] !== "" || state[2] !== null
        || state[3] !== "metadata-only" || !state[1] || typeof state[1] !== "object"
        || Array.isArray(state[1]) || Object.keys(state[1]).length !== 0) return null;
      metadataOnly = true;
    } catch { return null; }
  }
  const variant: SnapshotVariant = metadataOnly ? "metadata" : segment === "/_tree" ? "tree"
    : rsc === "1" ? (prefetch === "1" ? "prefetch" : "rsc") : "html";
  // These routes always return HTML for document requests, even when a crawler
  // advertises JSON. Accept is not a content-negotiation mechanism here; using
  // it as an escape hatch unnecessarily initializes Next for public content.
  return { pathname: url.pathname, locale: resolveLocale(cookieLocale, request.headers.get("accept-language")), variant };
}

/** Serve build-owned public content; never forward credentials to the asset binding. */
export async function servePublicSnapshot(
  request: Request,
  version: unknown,
  assets: PublicAssetBinding | undefined,
): Promise<Response | null> {
  const snapshot = publicSnapshotRequest(request, version);
  if (!snapshot || !assets) return null;
  const url = new URL(request.url);
  url.pathname = publicSnapshotPath(snapshot.locale, snapshot.pathname, snapshot.variant);
  url.search = "";
  let response: Response;
  try {
    // Do not forward cookies, credentials, router headers or client query data.
    // The .snapshot extension avoids the asset service's HTML URL redirects.
    response = await assets.fetch(new Request(url.toString(), { method: request.method }));
  } catch {
    return null;
  }
  if (response.status !== 200 || response.headers.has("Set-Cookie")) {
    await response.body?.cancel().catch(() => {});
    return null;
  }
  const headers = new Headers(response.headers);
  headers.set("Content-Type", snapshot.variant === "html" ? "text/html; charset=utf-8" : "text/x-component");
  headers.set("Cache-Control", "private, no-cache, no-store, max-age=0, must-revalidate");
  headers.set("X-APB-Page-Source", "STATIC");
  headers.set("X-APB-Page-Cache", "ASSET");
  headers.set("X-APB-Page-Variant", snapshot.variant);
  headers.set("Vary", "RSC, Next-Router-State-Tree, Next-Router-Prefetch, Next-Router-Segment-Prefetch, Accept-Language, Cookie");
  // A weak validator identifies this deployed, locale/protocol-specific
  // representation independently of asset-service compression and metadata.
  const etag = `W/"apb-${encodeURIComponent(String(version))}-${snapshot.locale}-${encodeURIComponent(snapshot.pathname)}-${snapshot.variant}"`;
  headers.set("ETag", etag);
  headers.delete("Last-Modified");
  // Range is optional: return the entire representation, never a partial Flight
  // document. Without Last-Modified, date preconditions are ignored per HTTP.
  headers.set("Accept-Ranges", "none");
  for (const { key: name, value } of SECURITY_HEADERS) headers.set(name, value);
  const ifMatch = request.headers.get("if-match");
  const ifNoneMatch = request.headers.get("if-none-match");
  // Weak tags never satisfy the strong comparison required by If-Match.
  const status = ifMatch !== null && ifMatch.trim() !== "*" ? 412
    : ifNoneMatch?.split(",").some(tag => tag.trim() === "*"
      || tag.trim().replace(/^W\//, "") === etag.slice(2)) ? 304 : 200;
  if (status !== 200) {
    await response.body?.cancel().catch(() => {});
    headers.delete("Content-Length");
    headers.delete("Content-Encoding");
    return new Response(null, { status, headers });
  }
  if (request.method === "HEAD") await response.body?.cancel().catch(() => {});
  return new Response(request.method === "HEAD" ? null : response.body, { status: 200, headers });
}
