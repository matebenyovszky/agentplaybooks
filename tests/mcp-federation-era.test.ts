import { beforeEach, describe, expect, it, vi } from "vitest";
import { listFederatedTools } from "@/lib/mcp/federation";
import type { MCPServer } from "@/lib/supabase/types";

/**
 * The federation client is a client, and clients have an era too. Revision
 * 2026-07-28 dropped the `initialize` handshake, and the spec scores
 * "Legacy client + Modern server" as an outright failure — so this client opens
 * modern and falls back only when the answer says the upstream still expects a
 * handshake.
 */

const TOOLS = { tools: [{ name: "search", description: "Search" }] };

function server(overrides: Partial<MCPServer> = {}): MCPServer {
  return {
    id: "12345678-1234-1234-1234-123456789abc",
    playbook_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    publisher_id: null,
    name: "Research",
    description: null,
    tools: [],
    resources: [],
    transport_type: "http",
    transport_config: { url: "https://modern.example.com/mcp", timeout_ms: 1000 },
    created_at: "2026-08-20T00:00:00.000Z",
    ...overrides,
  } as unknown as MCPServer;
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type Call = { url: string; headers: Record<string, string>; body: Record<string, unknown> };

function recorder(handler: (call: Call) => Response) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    const call: Call = {
      url: String(url),
      headers: (init.headers ?? {}) as Record<string, string>,
      body: init.body ? JSON.parse(String(init.body)) : {},
    };
    calls.push(call);
    return handler(call);
  });
  return { calls, fetchMock: fetchMock as unknown as typeof fetch };
}

beforeEach(() => {
  vi.resetModules();
});

describe("federation client era handling", () => {
  it("opens modern: one POST, no handshake, version in both header and _meta", async () => {
    const { calls, fetchMock } = recorder(() => json({ jsonrpc: "2.0", id: "1", result: TOOLS }));

    const tools = await listFederatedTools([server()], { fetch: fetchMock });

    expect(tools).toHaveLength(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].body.method).toBe("tools/list");
    expect(calls[0].headers["MCP-Protocol-Version"]).toBe("2026-07-28");
    expect(calls[0].headers["Mcp-Method"]).toBe("tools/list");
    expect((calls[0].body.params as Record<string, unknown>)._meta)
      .toMatchObject({ "io.modelcontextprotocol/protocolVersion": "2026-07-28" });
    // The handshake is the thing that must not happen.
    expect(calls.some((call) => call.body.method === "initialize")).toBe(false);
  });

  it("falls back to the handshake when a 4xx carries no modern error", async () => {
    const { calls, fetchMock } = recorder((call) => {
      if (call.headers["MCP-Protocol-Version"] === "2026-07-28") {
        // A handshake-era server rejecting a request it did not expect.
        return json({ error: "Bad Request" }, 400);
      }
      if (call.body.method === "initialize") {
        return json({ jsonrpc: "2.0", id: "1", result: { protocolVersion: "2025-03-26" } });
      }
      return json({ jsonrpc: "2.0", id: "2", result: TOOLS });
    });

    const tools = await listFederatedTools([server({ id: "legacy-server-id", transport_config: { url: "https://legacy.example.com/mcp", timeout_ms: 1000 } })], { fetch: fetchMock });

    expect(tools).toHaveLength(1);
    expect(calls.map((call) => call.body.method)).toEqual([
      "tools/list",              // modern probe
      "initialize",              // fallback
      "notifications/initialized",
      "tools/list",              // the real call
    ]);
  });

  it("retries against the versions a -32022 advertises", async () => {
    const { calls, fetchMock } = recorder((call) => {
      if (call.headers["MCP-Protocol-Version"] === "2026-07-28") {
        return json({
          jsonrpc: "2.0",
          id: "1",
          error: {
            code: -32022,
            message: "Unsupported protocol version",
            data: { supported: ["2025-11-25", "2026-01-01"], requested: "2026-07-28" },
          },
        }, 400);
      }
      return json({ jsonrpc: "2.0", id: "2", result: TOOLS });
    });

    const tools = await listFederatedTools([server({ id: "version-server-id", transport_config: { url: "https://version.example.com/mcp", timeout_ms: 1000 } })], { fetch: fetchMock });

    expect(tools).toHaveLength(1);
    // Newest of the offered versions, and still no handshake: the server is modern.
    expect(calls[1].headers["MCP-Protocol-Version"]).toBe("2026-01-01");
    expect(calls.some((call) => call.body.method === "initialize")).toBe(false);
  });

  it("mirrors a tool name into Mcp-Name and wraps one that is not ASCII-safe", async () => {
    // The upstream names one tool in ASCII and one not. Both have to reach the
    // header, the second Base64-wrapped, or a conforming server rejects the
    // call for a header/body mismatch that would be baffling from this side.
    const { calls, fetchMock } = recorder(() => json({
      jsonrpc: "2.0",
      id: "1",
      result: { tools: [{ name: "search" }, { name: "keresés" }] },
    }));
    const { callFederatedTool } = await import("@/lib/mcp/federation");

    const target = server({
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      transport_config: { url: "https://named.example.com/mcp", timeout_ms: 1000 },
    });
    const tools = await listFederatedTools([target], { fetch: fetchMock });
    for (const tool of tools) {
      await callFederatedTool(target, tool.name, {}, { fetch: fetchMock }).catch(() => undefined);
    }

    const sent = calls.filter((entry) => entry.body.method === "tools/call")
      .map((entry) => entry.headers["Mcp-Name"]);
    const wrapped = "=?base64?" + Buffer.from("keresés", "utf8").toString("base64") + "?=";
    expect(sent).toEqual(["search", wrapped]);
  });
});
