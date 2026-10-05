import { describe, expect, it, vi } from "vitest";
import { publicSnapshotPath, publicSnapshotRequest, servePublicSnapshot, type PublicAssetBinding } from "@/worker/public-html-snapshot";

const html = () => new Response("<html lang=\"hu\">public</html>", {
  headers: { "Content-Type": "application/octet-stream", ETag: "asset-tag", "Last-Modified": "yesterday" },
});

describe("deployment-time public HTML snapshots", () => {
  it("uses the same last cookie value as Next when cookie scopes overlap", () => {
    expect(publicSnapshotRequest(new Request("https://example.com/docs", {
      headers: { Cookie: "NEXT_LOCALE=de; NEXT_LOCALE=hu", "Accept-Language": "en" },
    }), "v1")?.locale).toBe("hu");
  });
  it("serves the requested locale with native security headers and no browser cache", async () => {
    const fetch = vi.fn<PublicAssetBinding["fetch"]>(async () => html());
    const response = await servePublicSnapshot(new Request("https://example.com/docs/playbooks", {
      headers: { Cookie: "NEXT_LOCALE=hu", "Accept-Language": "de", "X-Custom": "untrusted" },
    }), "v1", { fetch });
    const assetRequest = fetch.mock.calls[0]?.[0] as Request | undefined;
    expect(assetRequest?.url).toBe("https://example.com/__apb_public_html/hu/docs/playbooks.snapshot");
    expect([...assetRequest!.headers]).toEqual([]);
    expect(response?.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(response?.headers.get("X-APB-Page-Source")).toBe("STATIC");
    expect(response?.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response?.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response?.headers.get("Cache-Control")).toContain("no-store");
    expect(response?.headers.has("ETag")).toBe(false);
    expect(response?.headers.has("Last-Modified")).toBe(false);
    expect(await response?.text()).toContain("public");
    expect(publicSnapshotPath("en", "/")).toBe("/__apb_public_html/en/index.snapshot");
  });

  it("does not fetch snapshots for draft, conditional, unsupported protocols, private or unknown paths", async () => {
    const fetch = vi.fn(async () => html());
    const headers: HeadersInit[] = [{ Cookie: "__prerender_bypass=secret" }, { RSC: "invalid" },
      { "Next-Router-Prefetch": "1" }, { "Next-Router-Segment-Prefetch": "/unsupported" }, { "Next-Action": "action" },
      { "If-None-Match": "tag" }, { Range: "bytes=0-9" }];
    for (const values of headers) expect(await servePublicSnapshot(new Request("https://example.com/docs/playbooks", { headers: values }), "v1", { fetch })).toBeNull();
    for (const path of ["/dashboard", "/playbooks/private", "/api/connections", "/docs/unknown-private", "/docs?page=playbooks"])
      expect(await servePublicSnapshot(new Request(`https://example.com${path}`), "v1", { fetch })).toBeNull();
    expect(await servePublicSnapshot(new Request("https://example.com/", { method: "POST" }), "v1", { fetch })).toBeNull();
    expect(await servePublicSnapshot(new Request("https://example.com/"), undefined, { fetch })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("serves only build-owned public documents for signed-in visitors without forwarding any credentials", async () => {
    const fetch = vi.fn<PublicAssetBinding["fetch"]>(async () => html());
    const response = await servePublicSnapshot(new Request("https://example.com/docs/playbooks?utm_source=untrusted", {
      headers: { Authorization: "Bearer secret", "X-Api-Key": "secret", Cookie: "session=secret; NEXT_LOCALE=hu" },
    }), "v1", { fetch });
    expect(response?.status).toBe(200);
    expect(fetch.mock.calls[0][0].url).toBe("https://example.com/__apb_public_html/hu/docs/playbooks.snapshot");
    expect([...fetch.mock.calls[0][0].headers]).toEqual([]);
    expect(await response?.text()).not.toContain("secret");
  });

  it("keeps HTML, full navigation Flight and prefetch Flight assets separate", async () => {
    const fetch = vi.fn<PublicAssetBinding["fetch"]>(async () => new Response("public-flight"));
    for (const prefetch of [false, true]) {
      const response = await servePublicSnapshot(new Request("https://example.com/blog?_rsc=client-hash", {
        headers: { RSC: "1", "Next-Router-State-Tree": "untrusted-client-tree", "Next-Url": "/dashboard",
          "Accept-Language": "de", ...(prefetch ? { "Next-Router-Prefetch": "1" } : {}) },
      }), "v1", { fetch });
      const asset = fetch.mock.calls.at(-1)![0];
      expect(asset.url).toBe(`https://example.com/__apb_public_html/de/blog.${prefetch ? "prefetch" : "rsc"}.snapshot`);
      expect([...asset.headers]).toEqual([]);
      expect(response?.headers.get("Content-Type")).toBe("text/x-component");
      expect(response?.headers.get("Vary")).toContain("RSC");
      expect(response?.headers.get("Cache-Control")).toContain("no-store");
    }
  });

  it("serves the declared route-tree prefetch separately from other Flight protocols", async () => {
    const fetch = vi.fn<PublicAssetBinding["fetch"]>(async () => new Response("public-tree"));
    const response = await servePublicSnapshot(new Request("https://example.com/docs/playbooks?_rsc=tree", {
      headers: { RSC: "1", "Next-Router-Prefetch": "1", "Next-Router-Segment-Prefetch": "/_tree" },
    }), "v1", { fetch });
    expect(fetch.mock.calls[0][0].url).toBe("https://example.com/__apb_public_html/en/docs/playbooks.tree.snapshot");
    expect(response?.headers.get("X-APB-Page-Variant")).toBe("tree");
    expect(response?.headers.get("Vary")).not.toContain("Next-Url");
  });

  it("serves public HEAD requests from assets without an HTML body or a Next render", async () => {
    const fetch = vi.fn<PublicAssetBinding["fetch"]>(async () => new Response(null));
    const response = await servePublicSnapshot(new Request("https://example.com/", { method: "HEAD" }), "v1", { fetch });
    expect(fetch.mock.calls[0][0].method).toBe("HEAD");
    expect(response?.status).toBe(200);
    expect(response?.headers.get("X-APB-Page-Source")).toBe("STATIC");
    expect(await response?.text()).toBe("");
  });

  it("returns control to Next when the asset service is absent, fails, misses, or sets cookies", async () => {
    const request = new Request("https://example.com/docs/playbooks");
    expect(await servePublicSnapshot(request, "v1", undefined)).toBeNull();
    expect(await servePublicSnapshot(request, "v1", { fetch: async () => { throw new Error("unavailable"); } })).toBeNull();
    for (const response of [new Response("missing", { status: 404 }), new Response("redirect", { status: 307 }),
      new Response("private", { headers: { "Set-Cookie": "session=private" } })]) {
      const cancel = vi.spyOn(response.body!, "cancel");
      expect(await servePublicSnapshot(request, "v1", { fetch: async () => response })).toBeNull();
      expect(cancel).toHaveBeenCalled();
    }
  });
});
