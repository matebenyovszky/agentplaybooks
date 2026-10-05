import { SECURITY_HEADERS } from "../lib/security-headers";
import { publicPagePaths } from "./public-page-paths";
import { resolveLocale } from "../i18n/resolve-locale";

export interface PublicAssetBinding {
  fetch(request: Request): Promise<Response>;
}

export type SnapshotVariant = "html" | "rsc" | "prefetch";

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
    if (name === "range" || name === "upgrade" || name === "x-matched-path" || name === "next-action"
      || name.startsWith("if-") || name.startsWith("x-middleware-") || name.startsWith("x-nextjs-")
      || name.startsWith("x-invoke-") || (name.startsWith("next-")
        && !["next-router-state-tree", "next-router-prefetch", "next-url"].includes(name))) return null;
  }
  const cookies = (request.headers.get("cookie") ?? "").split(";").map(value => value.trim());
  if (cookies.some(value => /^__prerender_bypass=/.test(value))) return null;
  const encodedLocale = cookies.find(value => value.startsWith("NEXT_LOCALE="))?.slice("NEXT_LOCALE=".length);
  let cookieLocale: string | undefined;
  try { cookieLocale = encodedLocale === undefined ? undefined : decodeURIComponent(encodedLocale); } catch { return null; }
  const rsc = request.headers.get("rsc");
  if (rsc !== null && rsc !== "1") return null;
  const prefetch = request.headers.get("next-router-prefetch");
  if (prefetch !== null && (prefetch !== "1" || rsc !== "1")) return null;
  const variant: SnapshotVariant = rsc === "1" ? (prefetch === "1" ? "prefetch" : "rsc") : "html";
  const accept = request.headers.get("accept");
  if (variant === "html" && accept && !accept.includes("text/html") && !accept.includes("*/*")) return null;
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
  headers.set("Vary", "RSC, Next-Router-State-Tree, Next-Router-Prefetch, Next-Url, Accept-Language, Cookie");
  // Asset-service metadata is not Next's document metadata. In particular a
  // browser must not validate a locale-varying URL against one asset's ETag.
  headers.delete("ETag");
  headers.delete("Last-Modified");
  for (const { key: name, value } of SECURITY_HEADERS) headers.set(name, value);
  if (request.method === "HEAD") await response.body?.cancel().catch(() => {});
  return new Response(request.method === "HEAD" ? null : response.body, { status: 200, headers });
}
