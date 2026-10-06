import { afterEach, describe, expect, it, vi } from "vitest";
import { logMcpDiscovery } from "@/app/api/_shared/mcp-observability";

afterEach(() => vi.restoreAllMocks());
describe("MCP connection attribution", () => {
  it("records bounded client identity and key prefix without credentials or tool arguments", () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    logMcpDiscovery(new Request("https://example.com", { headers: { Authorization: "Bearer SECRET_TOKEN", "User-Agent": "python-httpx2/2.7.0" } }), "initialize", "pb", { kind: "playbook_key", keyPrefix: "apb_live_123" }, { clientInfo: { name: "Hermes\nAgent", version: "1" }, secret: "SECRET_ARGUMENT" });
    const text = log.mock.calls[0][0] as string;
    expect(JSON.parse(text)).toMatchObject({ event: "mcp.connection", clientName: "HermesAgent", keyPrefix: "apb_live_123" });
    expect(text).not.toContain("SECRET");
  });
  it("records the first discovery in each window, then samples repeats", () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const request = new Request("https://example.com", { headers: { "User-Agent": "discovery-test" } });
    logMcpDiscovery(request, "tools/list", "pb", null, {});
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.parse(log.mock.calls[0][0] as string)).toMatchObject({ sampleRate: 1, observationWindowMs: 300000 });
    log.mockClear();
    logMcpDiscovery(request, "tools/list", "pb", null, {});
    logMcpDiscovery(request, "tools/call", "pb", null, {});
    expect(log).not.toHaveBeenCalled();
    vi.spyOn(Math, "random").mockReturnValue(0);
    logMcpDiscovery(request, "tools/list", "pb", null, {});
    expect(JSON.parse(log.mock.calls[0][0] as string)).toMatchObject({ event: "mcp.discovery", method: "tools/list", sampleRate: 0.02 });
  });
});
