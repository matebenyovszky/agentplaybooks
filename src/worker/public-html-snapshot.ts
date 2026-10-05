import { SECURITY_HEADERS } from "../lib/security-headers";
import { publicPageCacheKey } from "./public-page-cache";

export interface PublicAssetBinding {
  fetch(request: Request): Promise<Response>;
}

export function publicSnapshotPath(locale: string, pathname: string): string {
  return `/__apb_public_html/${locale}${pathname === "/" ? "/index" : pathname}.snapshot`;
}

/** Serve only anonymous GET/HEAD document requests for reviewed public pages. */
export async function servePublicSnapshot(
  request: Request,
  version: unknown,
  assets: PublicAssetBinding | undefined,
): Promise<Response | null> {
  const key = publicPageCacheKey(request.method === "HEAD" ? new Request(request, { method: "GET" }) : request, version);
  if (!key || !assets) return null;
  const url = new URL(key.url);
  const locale = url.searchParams.get("__apb_public_locale")!;
  url.pathname = publicSnapshotPath(locale, new URL(request.url).pathname);
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
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "private, no-cache, no-store, max-age=0, must-revalidate");
  headers.set("X-APB-Page-Source", "STATIC");
  headers.set("X-APB-Page-Cache", "ASSET");
  // Asset-service metadata is not Next's document metadata. In particular a
  // browser must not validate a locale-varying URL against one asset's ETag.
  headers.delete("ETag");
  headers.delete("Last-Modified");
  for (const { key: name, value } of SECURITY_HEADERS) headers.set(name, value);
  if (request.method === "HEAD") await response.body?.cancel().catch(() => {});
  return new Response(request.method === "HEAD" ? null : response.body, { status: 200, headers });
}
