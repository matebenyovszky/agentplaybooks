import { afterEach, describe, expect, it, vi } from "vitest";
import { startMcpPerformance, parsedMcpPerformance, authorizedMcpPerformance, finishMcpPerformance } from "@/app/api/_shared/mcp-performance";
import { POST } from "@/app/api/mcp/[guid]/route";

afterEach(() => vi.restoreAllMocks());

describe("MCP wall-time diagnostics", () => {
  it("runs through the actual Hono endpoint middleware", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const response = await POST(new Request("http://localhost/api/mcp/test", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    }));
    expect(response.status).toBe(202);
    expect(log.mock.calls.map(call => JSON.parse(call[0] as string))).toContainEqual(expect.objectContaining({
      event: "mcp.performance", method: "notifications/initialized", status: 202,
    }));
  });
  it("records phases for slow requests without credentials, URLs or request contents", () => {
    const now = vi.spyOn(performance, "now");
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const request = new Request("https://example.com/api/mcp/PRIVATE?key=SECRET", {
      headers: { Authorization: "Bearer SECRET", Cookie: "SECRET" },
    });
    now.mockReturnValue(0); startMcpPerformance(request);
    now.mockReturnValue(2); parsedMcpPerformance(request, "tools/list");
    now.mockReturnValue(1500); authorizedMcpPerformance(request);
    now.mockReturnValue(1505); finishMcpPerformance(request, 200);
    const text = log.mock.calls[0][0] as string;
    expect(JSON.parse(text)).toEqual({ event: "mcp.performance", method: "tools/list", status: 200,
      totalWallMs: 1505, parseWallMs: 2, authorizationWallMs: 1498, handlerWallMs: 5, sampleRate: 1 });
    expect(text).not.toMatch(/SECRET|PRIVATE|example\.com/);
    finishMcpPerformance(request, 200);
    expect(log).toHaveBeenCalledTimes(1);
  });
  it("samples fast requests and suppresses arbitrary method names", () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(0);
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const random = vi.spyOn(Math, "random").mockReturnValue(0.5);
    const request = new Request("https://example.com");
    startMcpPerformance(request); parsedMcpPerformance(request, "SECRET-METHOD");
    now.mockReturnValue(10); finishMcpPerformance(request, 400);
    expect(log).not.toHaveBeenCalled();
    random.mockReturnValue(0); startMcpPerformance(request);
    parsedMcpPerformance(request, "SECRET-METHOD"); finishMcpPerformance(request, 400);
    expect(JSON.parse(log.mock.calls[0][0] as string)).toMatchObject({ method: "other", sampleRate: 0.02 });
    expect(log.mock.calls[0][0]).not.toContain("SECRET");
  });
});
