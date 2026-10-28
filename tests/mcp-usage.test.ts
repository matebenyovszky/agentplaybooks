import { afterEach, describe, expect, it, vi } from "vitest";
import { finishMcpToolUsage, noteMcpUsageActor, skipMcpToolUsage, startMcpToolUsage, succeedMcpToolUsage } from "@/app/api/_shared/mcp-usage";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
describe("MCP operation measurements", () => {
  it("does not count handshakes or discovery as executed tools", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    await finishMcpToolUsage(new Request("https://example.com"), 200);
    expect(log).not.toHaveBeenCalled();
  });
  it("records failures even at HTTP 200, success and test classification without secrets", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.stubEnv("MCP_TEST_ACCOUNT_IDS", "test-owner");
    const request = new Request("https://example.com?api_key=SECRET", { headers: { Authorization: "SECRET", "x-request-id": "SECRET" } });
    noteMcpUsageActor(request, { kind: "account", id: "test-owner", accountId: "test-owner" });
    startMcpToolUsage(request, "write_memory", "management");
    await finishMcpToolUsage(request, 200);
    const text = String(log.mock.calls[0][0]);
    expect(JSON.parse(text)).toMatchObject({ outcome: "error", audience: "test", tool: "write_memory", sampleRate: 1 });
    expect(text).not.toContain("SECRET");
    expect(text).not.toContain("test-owner");
    expect(JSON.parse(text).actorRef).toMatch(/^[a-f0-9]{64}$/);
    startMcpToolUsage(request, "write_memory", "management");
    succeedMcpToolUsage(request);
    await finishMcpToolUsage(request, 200);
    expect(JSON.parse(String(log.mock.calls[1][0])).outcome).toBe("success");
    startMcpToolUsage(request, "call_connected_tool", "playbook");
    succeedMcpToolUsage(request, true);
    await finishMcpToolUsage(request, 200);
    expect(JSON.parse(String(log.mock.calls[2][0])).outcome).toBe("error");
  });
  it("does not double count management forwarding or equate shared keys to people", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const request = new Request("https://example.com");
    startMcpToolUsage(request, "read_canvas", "management");
    skipMcpToolUsage(request);
    await finishMcpToolUsage(request, 200);
    expect(log).not.toHaveBeenCalled();
    startMcpToolUsage(request, "read_canvas", "playbook");
    noteMcpUsageActor(request, { kind: "playbook_key", id: "key-id", accountId: "owner" });
    succeedMcpToolUsage(request);
    await finishMcpToolUsage(request, 200);
    expect(JSON.parse(String(log.mock.calls[0][0]))).toMatchObject({ actorKind: "playbook_key", audience: "unclassified" });
  });
});
