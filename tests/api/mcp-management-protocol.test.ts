import { describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/mcp/manage/route";

function mcpRequest(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/mcp/manage", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", ...body }),
  });
}

describe("AgentPlaybooks management MCP transport", () => {
  it("negotiates the current protocol version", async () => {
    const response = await POST(mcpRequest({
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "test", version: "1.0.0" },
      },
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.result.protocolVersion).toBe("2025-11-25");
    expect(payload.result.serverInfo.name).toBe("agentplaybooks-management");
  });

  it("accepts the initialized notification without a JSON-RPC body", async () => {
    const response = await POST(mcpRequest({ method: "notifications/initialized" }));
    expect(response.status).toBe(202);
    expect(await response.text()).toBe("");
  });

  it("supports ping", async () => {
    const response = await POST(mcpRequest({ id: 2, method: "ping" }));
    expect(await response.json()).toEqual({ jsonrpc: "2.0", id: 2, result: {} });
  });

  it("projects every playbook operation with an explicit playbook_id", async () => {
    const response = await POST(mcpRequest({ id: 4, method: "tools/list" }));
    const payload = await response.json();
    const tools = payload.result.tools as Array<{
      name: string;
      inputSchema: { properties?: Record<string, unknown>; required?: string[] };
    }>;
    const names = tools.map((tool) => tool.name);

    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(expect.arrayContaining([
      "list_playbooks",
      "create_playbook",
      "create_mcp_server",
      "create_run",
      "write_canvas",
      "store_secret",
    ]));
    for (const name of ["create_mcp_server", "create_run", "write_canvas", "store_secret"]) {
      const tool = tools.find((candidate) => candidate.name === name)!;
      expect(tool.inputSchema.properties).toHaveProperty("playbook_id");
      expect(tool.inputSchema.required).toContain("playbook_id");
    }
  });

  it("serves a request whose protocol version it has never heard of", async () => {
    const response = await POST(mcpRequest(
      { id: 3, method: "ping" },
      { "MCP-Protocol-Version": "2099-01-01" },
    ));

    // This used to be a 400. The header is a modern-era mechanism; rejecting an
    // unknown value left a dual-era client with a 400 it could neither retry
    // against nor treat as "legacy server, fall back to initialize".
    expect(response.status).toBe(200);
  });

  it("returns 405 for an unsupported server-to-client SSE stream", async () => {
    const response = await GET(new Request("http://localhost/api/mcp/manage", {
      headers: { Accept: "text/event-stream" },
    }));
    expect(response.status).toBe(405);
  });
});
