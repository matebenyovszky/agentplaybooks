import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => vi.resetModules());
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("native public registry search", () => {
  it("shares searches and caches successful public data without forwarding credentials", async () => {
    const fetch = vi.fn(async () => Response.json({ servers: [], metadata: { count: 0 } }));
    vi.stubGlobal("fetch", fetch);
    const { GET } = await import("@/app/api/mcp-registry/search/route");
    const request = new Request("https://example.com/api/mcp-registry/search?q=cloudflare", { headers: { Authorization: "Bearer secret" } });
    const results = await Promise.all(Array.from({ length: 10 }, () => GET(request)));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await results[0].json()).toEqual(await results[9].json());
    expect(JSON.stringify(fetch.mock.calls)).not.toContain("secret");
    expect(results[0].headers.get("Cache-Control")).toBe("public, max-age=300");
    expect((await GET(request)).status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("drops failures and bounds both search text and cached query count", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 503 })).mockImplementation(async () => Response.json({ servers: [] }));
    vi.stubGlobal("fetch", fetch);
    const { GET } = await import("@/app/api/mcp-registry/search/route");
    const request = (q: string) => new Request(`https://example.com/api/mcp-registry/search?q=${q}`);
    expect((await GET(request("first"))).status).toBe(502);
    expect((await GET(request("first"))).status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect((await GET(request("x".repeat(513)))).status).toBe(400);
    for (let i = 0; i < 9; i++) await GET(request(String(i)));
    await GET(request("first"));
    expect(fetch).toHaveBeenCalledTimes(12);
  });

  it("rejects oversized upstream data", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x".repeat(2 * 1024 * 1024 + 1))));
    const { GET } = await import("@/app/api/mcp-registry/search/route");
    expect((await GET(new Request("https://example.com/api/mcp-registry/search"))).status).toBe(502);
  });

  it("times out an upstream that sends headers but never finishes its body", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => new Response(new ReadableStream({
      start(controller) { init.signal?.addEventListener("abort", () => controller.error(new Error("Timed out"))); },
    }))));
    const { GET } = await import("@/app/api/mcp-registry/search/route");
    // AbortSignal.timeout uses the runtime timer rather than Vitest fake timers.
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation(ms => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), ms);
      return controller.signal;
    });
    try {
      const response = GET(new Request("https://example.com/api/mcp-registry/search"));
      await vi.advanceTimersByTimeAsync(10_001);
      expect((await response).status).toBe(502);
    } finally { timeout.mockRestore(); }
  });
});
