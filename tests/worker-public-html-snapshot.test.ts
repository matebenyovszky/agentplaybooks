import { describe, expect, it, vi } from "vitest";
import { publicSnapshotPath, servePublicSnapshot, type PublicAssetBinding } from "@/worker/public-html-snapshot";

const html = () => new Response("<html lang=\"hu\">public</html>", {
  headers: { "Content-Type": "application/octet-stream", ETag: "asset-tag", "Last-Modified": "yesterday" },
});

describe("deployment-time public HTML snapshots", () => {
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

  it("does not fetch snapshots for credentials, other cookies, query, RSC, private or unknown paths", async () => {
    const fetch = vi.fn(async () => html());
    const headers: HeadersInit[] = [{ Authorization: "Bearer secret" }, { "X-Api-Key": "secret" },
      { Cookie: "NEXT_LOCALE=hu; session=secret" }, { RSC: "1" }, { "Next-Router-State-Tree": "tree" },
      { "If-None-Match": "tag" }, { Range: "bytes=0-9" }];
    for (const values of headers) expect(await servePublicSnapshot(new Request("https://example.com/docs/playbooks", { headers: values }), "v1", { fetch })).toBeNull();
    for (const path of ["/dashboard", "/playbooks/private", "/api/connections", "/docs/unknown-private", "/docs/playbooks?q=user"])
      expect(await servePublicSnapshot(new Request(`https://example.com${path}`), "v1", { fetch })).toBeNull();
    expect(await servePublicSnapshot(new Request("https://example.com/", { method: "POST" }), "v1", { fetch })).toBeNull();
    expect(await servePublicSnapshot(new Request("https://example.com/"), undefined, { fetch })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
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
