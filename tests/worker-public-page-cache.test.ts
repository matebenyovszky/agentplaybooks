import { describe, expect, it, vi } from "vitest";
import { publicPageCacheKey, servePublicPage, type PublicPageCache } from "@/worker/public-page-cache";

function memoryCache(): PublicPageCache {
  const entries = new Map<string, Response>();
  return {
    match: vi.fn(async request => entries.get(request.url)?.clone()),
    put: vi.fn(async (request, response) => { entries.set(request.url, new Response(await response.text(), { status: response.status, headers: response.headers })); }),
  };
}
const html = () => new Response("<html>public</html>", { headers: { "Content-Type": "text/html; charset=utf-8" } });

describe("public document cache", () => {
  it("keys by deployment, origin, path, and the same locale as SSR", () => {
    const request = (headers?: HeadersInit) => new Request("https://example.com/docs", { headers });
    const key = (headers?: HeadersInit, version = "v1") => publicPageCacheKey(request(headers), version)?.url;
    expect(key({ "Accept-Language": "hu-HU,en;q=0.8" })).toContain("locale=hu");
    expect(key({ Cookie: "NEXT_LOCALE=de", "Accept-Language": "hu-HU" })).toContain("locale=de");
    expect(key({ Cookie: "NEXT_LOCALE=%68u" })).toContain("locale=hu");
    expect(key({ Cookie: "NEXT_LOCALE=invalid", "Accept-Language": "es" })).toContain("locale=es");
    expect(key()).not.toBe(key(undefined, "v2"));
    expect(publicPageCacheKey(new Request("https://other.com/docs"), "v1")?.url).not.toBe(key());
    expect(publicPageCacheKey(new Request("https://example.com/"), "v1")?.url).not.toBe(key());
  });

  it("bypasses all credentials, other cookies, RSC, query strings, and private routes", () => {
    const excludedHeaders: HeadersInit[] = [
      { Authorization: "Bearer secret" }, { "X-Api-Key": "secret" }, { Cookie: "session=secret" },
      { Cookie: "NEXT_LOCALE=hu; sb-access-token=secret" }, { RSC: "1" },
      { "Next-Router-State-Tree": "tree" }, { "Next-Url": "/dashboard" },
      { "X-Nextjs-Data": "1" }, { "X-Invoke-Path": "/dashboard" }, { Upgrade: "websocket" },
      { "X-Middleware-Prefetch": "1" }, { "If-None-Match": "tag" }, { Range: "bytes=0-100" },
      { Accept: "text/x-component" }, { Cookie: "NEXT_LOCALE=%ZZ" },
    ];
    for (const headers of excludedHeaders) expect(publicPageCacheKey(new Request("https://example.com/", { headers }), "v1")).toBeNull();
    for (const path of ["/dashboard", "/api/playbooks", "/playbooks/private", "/docs?page=secrets", "/?utm_source=x"])
      expect(publicPageCacheKey(new Request(`https://example.com${path}`), "v1")).toBeNull();
    expect(publicPageCacheKey(new Request("https://example.com/", { method: "HEAD" }), "v1")).toBeNull();
    expect(publicPageCacheKey(new Request("https://example.com/"), undefined)).toBeNull();
  });

  it("serves successful HTML without rendering again and prevents browser cache mixing", async () => {
    const cache = memoryCache();
    const render = vi.fn(async () => html());
    const req = new Request("https://example.com/docs", { headers: { Cookie: "NEXT_LOCALE=hu" } });
    const first = await servePublicPage(req, "cache-v1", cache, render);
    expect(first.headers.get("X-APB-Page-Cache")).toBe("MISS");
    const second = await servePublicPage(req, "cache-v1", cache, render);
    expect(second.headers.get("X-APB-Page-Cache")).toBe("HIT");
    expect(second.headers.get("Cache-Control")).toContain("no-store");
    expect(await second.text()).toBe("<html>public</html>");
    expect(render).toHaveBeenCalledTimes(1);
    await servePublicPage(new Request("https://example.com/docs", { headers: { Cookie: "NEXT_LOCALE=de" } }), "cache-v1", cache, render);
    await servePublicPage(req, "cache-v2", cache, render);
    expect(render).toHaveBeenCalledTimes(3);
  });

  it("shares concurrent public renders without sharing authenticated responses", async () => {
    const cache = memoryCache();
    const render = vi.fn(async () => html());
    const request = new Request("https://example.com/");
    const results = await Promise.all(Array.from({ length: 8 }, () => servePublicPage(request, "parallel", cache, render)));
    expect(render).toHaveBeenCalledTimes(1);
    expect(await Promise.all(results.map(r => r.text()))).toEqual(Array(8).fill("<html>public</html>"));
    const privateReq = new Request("https://example.com/", { headers: { Authorization: "Bearer token" } });
    await Promise.all(Array.from({ length: 3 }, () => servePublicPage(privateReq, "parallel", cache, render)));
    expect(render).toHaveBeenCalledTimes(4);
  });

  it("does not store failures, redirects, cookies, JSON, or Vary-star responses", async () => {
    for (const response of [
      new Response("error", { status: 500, headers: { "Content-Type": "text/html" } }),
      new Response(null, { status: 307, headers: { Location: "/login" } }),
      new Response("user", { headers: { "Content-Type": "text/html", "Set-Cookie": "session=user" } }),
      Response.json({ private: true }),
      new Response("vary", { headers: { "Content-Type": "text/html", Vary: "*" } }),
    ]) {
      const cache = memoryCache();
      await servePublicPage(new Request("https://example.com/"), "no-cache", cache, async () => response);
      expect(cache.put).not.toHaveBeenCalled();
    }
  });

  it("keeps rendering when the Cache API fails", async () => {
    const cache = { match: vi.fn(async () => { throw new Error("unavailable"); }), put: vi.fn(async () => { throw new Error("unavailable"); }) };
    const response = await servePublicPage(new Request("https://example.com/"), "failed-cache", cache, async () => html());
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("<html>public</html>");
  });
});
