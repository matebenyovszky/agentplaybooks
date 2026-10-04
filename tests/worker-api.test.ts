import { describe, expect, it, vi } from "vitest";
import { dispatchApi, matchApiRoute, type ApiRoute } from "@/worker/api-dispatch";
import { apiRoutes } from "@/worker/api-routes";
import { readdir, readFile } from "node:fs/promises";

describe("native Worker API routing", () => {
  it("keeps route-specific reservations ahead of the Hono catch-all", () => {
    for (const path of ["/api/playbooks", "/api/playbooks/test", "/api/connections", "/api/manage/playbooks/id/snapshots/latest"]) {
      expect(matchApiRoute(path, apiRoutes)?.route.handlers).toBeNull();
    }
    expect(matchApiRoute("/api/mcp/manage", apiRoutes)?.route.segments).toEqual(["mcp", "manage"]);
    expect(matchApiRoute("/api/playbooks/id/secrets/proxy", apiRoutes)?.route.segments.at(-1)).toBe("proxy");
    expect(matchApiRoute("/api/playbooks/id/personas", apiRoutes)?.route.segments).toEqual(["[[...route]]"]);
    expect(matchApiRoute("/api/mcp/id/unknown", apiRoutes)?.route.segments).toEqual(["[[...route]]"]);
  });

  it("covers every filesystem API route and keeps Next-dependent modules on Next", async () => {
    const files = (await readdir("src/app/api", { recursive: true })).filter((file) => file.replaceAll("\\", "/").endsWith("/route.ts"));
    expect(apiRoutes).toHaveLength(files.length);
    for (const file of files) {
      const segments = file.replaceAll("\\", "/").replace(/\/route.ts$/, "").split("/");
      const route = apiRoutes.find((entry) => JSON.stringify(entry.segments) === JSON.stringify(segments));
      expect(route, file).toBeDefined();
      const source = await readFile(`src/app/api/${file}`, "utf8");
      if (/from\s+["']next\//.test(source)) expect(route?.handlers, file).toBeNull();
    }
  });

  it("preserves existing handler authorization, CORS, and security headers", async () => {
    const response = await dispatchApi(new Request("https://example.com/api/mcp/manage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }), apiRoutes);
    expect(response?.status).toBe(401);
    expect(response?.headers.get("WWW-Authenticate")).toContain("Bearer");
    expect(response?.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response?.headers.get("Cache-Control")).toBe("no-store");
  });

  it("decodes operation params once, preserves HEAD/OPTIONS/405, and never falls through after handler refusal", async () => {
    const GET = vi.fn(async (_request: Request, context: { params: Promise<Record<string, string>> }) => Response.json(await context.params, { status: 403 }));
    const routes: ApiRoute[] = [{ segments: ["sample", "[id]"], methods: ["GET"], handlers: { GET } }];
    const response = await dispatchApi(new Request("https://example.com/api/sample/a%20b"), routes);
    expect(response?.status).toBe(403);
    expect(await response?.json()).toEqual({ id: "a b" });
    expect((await dispatchApi(new Request("https://example.com/api/sample/x", { method: "OPTIONS" }), routes))?.headers.get("Allow")).toBe("GET, HEAD, OPTIONS");
    expect((await dispatchApi(new Request("https://example.com/api/sample/x", { method: "POST" }), routes))?.status).toBe(405);
    expect(await (await dispatchApi(new Request("https://example.com/api/sample/x", { method: "HEAD" }), routes))?.text()).toBe("");
    for (const path of ["/api/sample/x/", "/api//sample/x", "/api/sample/%ZZ", "/website"]) expect(await dispatchApi(new Request(`https://example.com${path}`), routes)).toBeNull();
  });
});
