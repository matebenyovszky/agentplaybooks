import { describe, expect, it, vi } from "vitest";
import { dispatchApi, matchApiRoute, type ApiParams, type ApiRoute } from "@/worker/api-dispatch";
import { apiRoutes } from "@/worker/api-routes";
import { readdir, readFile } from "node:fs/promises";

describe("native Worker API routing", () => {
  it("routes migrated API handlers before the Hono catch-all", () => {
    for (const path of ["/api/playbooks", "/api/playbooks/test", "/api/connections", "/api/manage/playbooks/id/snapshots/latest"]) {
      expect(typeof matchApiRoute(path, apiRoutes)?.route.handlers).toBe("function");
    }
    expect(matchApiRoute("/api/mcp/manage", apiRoutes)?.route.segments).toEqual(["mcp", "manage"]);
    expect(matchApiRoute("/api/playbooks/id/secrets/proxy", apiRoutes)?.route.segments.at(-1)).toBe("proxy");
    expect(matchApiRoute("/api/playbooks/id/personas", apiRoutes)?.route.segments).toEqual(["[[...route]]"]);
    expect(matchApiRoute("/api/mcp/id/unknown", apiRoutes)?.route.segments).toEqual(["[[...route]]"]);
  });

  it("covers every filesystem API route without eager imports", async () => {
    const files = (await readdir("src/app/api", { recursive: true })).filter((file) => file.replaceAll("\\", "/").endsWith("/route.ts"));
    expect(apiRoutes.filter(route => route.basePath === "/api")).toHaveLength(files.length);
    for (const file of files) {
      const segments = file.replaceAll("\\", "/").replace(/\/route.ts$/, "").split("/");
      const route = apiRoutes.find((entry) => entry.basePath === "/api" && JSON.stringify(entry.segments) === JSON.stringify(segments));
      expect(route, file).toBeDefined();
      const source = await readFile(`src/app/api/${file}`, "utf8");
      if (/from\s+["']next\//.test(source)) expect(route?.handlers, file).toBeNull();
      else expect(typeof route?.handlers, file).toBe("function");
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
    const GET = vi.fn(async (_request: Request, context: { params: Promise<ApiParams> }) => Response.json(await context.params, { status: 403 }));
    const routes: ApiRoute[] = [{ segments: ["sample", "[id]"], methods: ["GET"], handlers: { GET } }];
    const response = await dispatchApi(new Request("https://example.com/api/sample/a%20b"), routes);
    expect(response?.status).toBe(403);
    expect(await response?.json()).toEqual({ id: "a b" });
    expect((await dispatchApi(new Request("https://example.com/api/sample/x", { method: "OPTIONS" }), routes))?.headers.get("Allow")).toBe("GET, HEAD, OPTIONS");
    expect((await dispatchApi(new Request("https://example.com/api/sample/x", { method: "POST" }), routes))?.status).toBe(405);
    expect(await (await dispatchApi(new Request("https://example.com/api/sample/x", { method: "HEAD" }), routes))?.text()).toBe("");
    for (const path of ["/api/sample/x/", "/api//sample/x", "/api/sample/%ZZ", "/website"]) expect(await dispatchApi(new Request(`https://example.com${path}`), routes)).toBeNull();
  });

  it("does not load unrelated handlers or modules for unsupported methods", async () => {
    const load = vi.fn(async () => ({ GET: async () => Response.json({ ok: true }) }));
    const unrelated = vi.fn(async () => ({ GET: async () => Response.json({ unrelated: true }) }));
    const routes: ApiRoute[] = [
      { segments: ["light"], methods: ["GET"], handlers: load },
      { segments: ["heavy"], methods: ["GET"], handlers: unrelated },
    ];
    expect((await dispatchApi(new Request("https://example.com/api/light", { method: "POST" }), routes))?.status).toBe(405);
    expect(load).not.toHaveBeenCalled();
    expect((await dispatchApi(new Request("https://example.com/api/light"), routes))?.status).toBe(200);
    expect(load).toHaveBeenCalledTimes(1);
    expect(unrelated).not.toHaveBeenCalled();
  });

  it("keeps future Next reservations ahead of a native catch-all", async () => {
    const fallback = vi.fn(async () => Response.json({ wrong: true }));
    const routes: ApiRoute[] = [
      { segments: ["next"], methods: ["GET"], handlers: null },
      { segments: ["[[...path]]"], methods: ["GET"], handlers: { GET: fallback } },
    ];
    expect(await dispatchApi(new Request("https://example.com/api/next"), routes)).toBeNull();
    expect(fallback).not.toHaveBeenCalled();
  });

  it("decodes well-known catch-all arrays once and supports the empty base", async () => {
    const routes: ApiRoute[] = [{ basePath: "/.well-known", segments: ["skills", "[[...path]]"], methods: ["GET"], handlers: { GET: async (_req, ctx) => Response.json(await ctx.params) } }];
    expect(await (await dispatchApi(new Request("https://example.com/.well-known/skills"), routes))?.json()).toEqual({});
    expect(await (await dispatchApi(new Request("https://example.com/.well-known/skills/a%20b/reference%252Ffile"), routes))?.json()).toEqual({ path: ["a b", "reference%2Ffile"] });
    expect(await dispatchApi(new Request("https://example.com/.well-known/skills/a/%ZZ"), routes)).toBeNull();
    expect(await dispatchApi(new Request("https://example.com/other/skills/a"), routes)).toBeNull();
    expect((await dispatchApi(new Request("https://example.com/.well-known/oauth-protected-resource/api/mcp/manage"), apiRoutes))?.status).toBe(200);
    expect(matchApiRoute("/playbooks/test/.well-known/skills/review/SKILL.md", apiRoutes)?.params).toEqual({ guid: "test", path: ["review", "SKILL.md"] });
    expect(matchApiRoute("/playbooks/test", apiRoutes)).toBeNull();
  });

  it("returns a sanitized HTTP 500 and cancels HEAD response bodies", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const cancel = vi.fn();
    const routes: ApiRoute[] = [
      { segments: ["error"], methods: ["GET"], handlers: { GET: async () => { throw new Error("SECRET_TOKEN"); } } },
      { segments: ["stream"], methods: ["GET"], handlers: { GET: async () => new Response(new ReadableStream({ cancel })) } },
    ];
    try {
      const error = await dispatchApi(new Request("https://example.com/api/error"), routes);
      expect(error?.status).toBe(500);
      expect(await error?.text()).not.toContain("SECRET_TOKEN");
      expect(log.mock.calls.flat().join()).not.toContain("SECRET_TOKEN");
      expect(error?.headers.get("Cache-Control")).toBe("no-store");
      await dispatchApi(new Request("https://example.com/api/stream", { method: "HEAD" }), routes);
      expect(cancel).toHaveBeenCalledTimes(1);
    } finally { log.mockRestore(); }
  });
});
