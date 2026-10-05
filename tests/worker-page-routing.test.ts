import { describe, expect, it, vi } from "vitest";
import { matchesPageRoute, routePageRequest } from "@/worker/page-routing";
import type { ApiRoute } from "@/worker/api-dispatch";

const routes: ApiRoute[] = [{ basePath: "/api", segments: ["[[...route]]"], methods: [], handlers: null },
  { basePath: "/.well-known", segments: ["oauth-protected-resource", "[[...path]]"], methods: [], handlers: null }];
const request = (path: string, method = "GET", headers?: HeadersInit) => new Request(`https://example.com${path}`, { method, headers });

describe("native page routing", () => {
  it("rejects encoded separators after an API dispatch miss without rendering Next", async () => {
    for (const path of ["/api%2F.env", "/api%2fmcp/manage", "/api%5c.env", "/docs%2Funknown"]) {
      const fetch = vi.fn(async () => new Response("missing", { status: 404 }));
      const response = await routePageRequest(request(path), routes, { fetch });
      expect(response?.status).toBe(400);
      expect(response?.headers.get("X-APB-Page-Source")).toBe("NATIVE");
      expect(fetch).not.toHaveBeenCalled();
    }
  });
  it("preserves every declared private/dynamic page and reserved API route", async () => {
    for (const path of ["/dashboard", "/dashboard/settings", "/dashboard/favorites", "/dashboard/playbook/private-id",
      "/login", "/explore", "/oauth/consent?authorization_id=private", "/invite/private-token", "/api/private/endpoint",
      "/.well-known/oauth-protected-resource/api/mcp/manage", "/robots.txt", "/sitemap.xml", "/docs/playbooks", "/blog/hermes-native-memory"]) {
      expect(await routePageRequest(request(path), routes)).toBeNull();
    }
    expect(matchesPageRoute("/dashboard/playbook/private-id/unknown")).toBe(false);
  });
  it("answers misses natively without echoing URL or credentials, including HEAD and RSC", async () => {
    for (const path of ["/chosen?token=secret", "/baxa1.phP8", "/blog/missing", "/docs/missing", "/nested/missing"])
      for (const method of ["GET", "HEAD", "POST"]) {
        const response = await routePageRequest(request(path, method, { Authorization: "Bearer secret", RSC: "1" }), routes);
        expect(response?.status).toBe(404);
        expect(response?.headers.get("X-APB-Page-Source")).toBe("NATIVE");
        expect(response?.headers.get("X-Content-Type-Options")).toBe("nosniff");
        expect(await response?.text()).not.toContain("secret");
        if (method === "HEAD") expect(await response?.text()).toBe("");
      }
  });
  it("canonicalizes trailing slashes, legal aliases and legacy docs links on the same origin", async () => {
    for (const [path, status, target] of [["/docs/playbooks/?q=1", 308, "/docs/playbooks?q=1"],
      ["/api/mcp/manage/", 308, "/api/mcp/manage"], ["/privacy-policy?utm_source=x", 301, "/privacy?utm_source=x"],
      ["/docs?page=Playbooks.md&utm_source=x", 308, "/docs/playbooks?utm_source=x"],
      ["/docs/Playbooks.md", 308, "/docs/playbooks"]] as const) {
      const response = await routePageRequest(request(path), routes);
      expect(response?.status).toBe(status);
      expect(response?.headers.get("Location")).toBe(`https://example.com${target}`);
    }
    expect((await routePageRequest(request("/docs?page=https://attacker.example"), routes))?.status).toBe(404);
    expect((await routePageRequest(request("/%XX"), routes))?.status).toBe(400);
  });
  it("checks static asset aliases before declaring a miss and does not forward credentials", async () => {
    const fetch = vi.fn(async (asset: Request) => {
      expect([...asset.headers]).toEqual([]);
      return new Response("public asset");
    });
    expect((await routePageRequest(request("/static-file", "GET", { Cookie: "session=secret" }), routes, { fetch }))?.status).toBe(200);
    expect(await routePageRequest(request("/static-file"), routes, { fetch: async () => { throw Error("unavailable"); } })).toBeNull();
    const missing = new Response("missing", { status: 404 });
    const cancel = vi.spyOn(missing.body!, "cancel");
    expect((await routePageRequest(request("/static-file"), routes, { fetch: async () => missing }))?.status).toBe(404);
    expect(cancel).toHaveBeenCalled();
  });
});
