import { describe, expect, it, vi } from "vitest";
import type { MCPServer } from "@/lib/supabase/types";

function server(id: string, url: string, auth?: Record<string, unknown>): MCPServer {
  return {
    id,
    playbook_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    publisher_id: null,
    name: "Cache test",
    description: null,
    tools: [],
    resources: [],
    transport_type: "http",
    transport_config: { url, timeout_ms: 1000, ...(auth ? { auth } : {}) },
    created_at: "2026-10-04T00:00:00.000Z",
  } as unknown as MCPServer;
}

function json(value: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

describe("federation cache isolation", () => {
  it("reuses one legacy session but opens another after a credential change", async () => {
    vi.resetModules();
    const { listFederatedTools } = await import("@/lib/mcp/federation");
    const target = server("rotating-legacy", "https://legacy-rotation.example.com/mcp", {
      type: "bearer",
      token_secret: "TOKEN",
    });
    const calls: Array<{ method: string; session: string | null; authorization: string | null }> = [];
    let handshakes = 0;
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      const method = JSON.parse(String(init?.body)).method as string;
      calls.push({
        method,
        session: headers.get("Mcp-Session-Id"),
        authorization: headers.get("Authorization"),
      });
      if (headers.get("MCP-Protocol-Version") === "2026-07-28") return json({ error: "legacy" }, 400);
      if (method === "initialize") {
        handshakes += 1;
        return json({ jsonrpc: "2.0", result: { protocolVersion: "2025-03-26" } }, 200, {
          "Mcp-Session-Id": `session-${handshakes}`,
        });
      }
      if (method === "notifications/initialized") return new Response(null, { status: 202 });
      return json({ jsonrpc: "2.0", result: { tools: [{ name: "search" }] } });
    });

    const options = (token: string) => ({ fetch: fetchMock as typeof fetch, secrets: { TOKEN: token } });
    await listFederatedTools([target], options("first"));
    await listFederatedTools([target], options("first"));
    await listFederatedTools([target], options("second"));

    expect(handshakes).toBe(2);
    expect(calls.filter((call) => call.method === "tools/list" && call.session)
      .map((call) => [call.session, call.authorization]))
      .toEqual([
        ["session-1", "Bearer first"],
        ["session-1", "Bearer first"],
        ["session-2", "Bearer second"],
      ]);
  });

  it("shares an in-flight legacy handshake among concurrent requests", async () => {
    vi.resetModules();
    const { listFederatedTools } = await import("@/lib/mcp/federation");
    const target = server("parallel-legacy", "https://parallel-legacy.example.com/mcp");
    let handshakes = 0;
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      const method = JSON.parse(String(init?.body)).method as string;
      if (headers.get("MCP-Protocol-Version") === "2026-07-28") return json({ error: "legacy" }, 400);
      if (method === "initialize") {
        handshakes += 1;
        return json({ jsonrpc: "2.0", result: { protocolVersion: "2025-03-26" } }, 200, {
          "Mcp-Session-Id": "parallel-session",
        });
      }
      if (method === "notifications/initialized") return new Response(null, { status: 202 });
      return json({ jsonrpc: "2.0", result: { tools: [{ name: "search" }] } });
    });

    const [first, second] = await Promise.all([
      listFederatedTools([target], { fetch: fetchMock as typeof fetch }),
      listFederatedTools([target], { fetch: fetchMock as typeof fetch }),
    ]);
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(handshakes).toBe(1);
  });

  it("does not classify a denied modern endpoint as legacy", async () => {
    vi.resetModules();
    const { knownProtocolEra, listFederatedTools } = await import("@/lib/mcp/federation");
    const url = "https://denied-modern.example.com/mcp";
    const fetchMock = vi.fn(async () => json({ error: "Unauthorized" }, 401));

    await listFederatedTools([server("denied-modern", url)], { fetch: fetchMock as typeof fetch });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(knownProtocolEra(url)).toBeNull();
  });

  it("keeps protocol eras separate for paths on the same origin", async () => {
    vi.resetModules();
    const { knownProtocolEra, listFederatedTools } = await import("@/lib/mcp/federation");
    const legacyUrl = "https://mixed.example.com/legacy";
    const modernUrl = "https://mixed.example.com/modern";
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const method = JSON.parse(String(init?.body)).method as string;
      if (String(url) === legacyUrl && new Headers(init?.headers).get("MCP-Protocol-Version") === "2026-07-28") {
        return json({ error: "legacy" }, 400);
      }
      if (method === "initialize") return json({ jsonrpc: "2.0", result: {} });
      if (method === "notifications/initialized") return new Response(null, { status: 202 });
      return json({ jsonrpc: "2.0", result: { tools: [{ name: "search" }] } });
    });

    await listFederatedTools([server("mixed-legacy", legacyUrl)], { fetch: fetchMock as typeof fetch });
    await listFederatedTools([server("mixed-modern", modernUrl)], { fetch: fetchMock as typeof fetch });

    expect(knownProtocolEra(legacyUrl)).toBe("legacy");
    expect(knownProtocolEra(modernUrl)).toBe("modern");
    const modernCalls = fetchMock.mock.calls.filter(([url]) => String(url) === modernUrl);
    expect(modernCalls).toHaveLength(1);
  });

  it("gets a fresh OAuth token when the client secret rotates", async () => {
    vi.resetModules();
    const { listFederatedTools } = await import("@/lib/mcp/federation");
    const target = server("oauth-rotation", "https://oauth-rotation.example.com/mcp", {
      type: "oauth2_client_credentials",
      token_url: "https://oauth-rotation.example.com/token",
      client_id: "client",
      client_secret: "CLIENT_SECRET",
    });
    const authorizations: string[] = [];
    let tokenRequests = 0;
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith("/token")) {
        tokenRequests += 1;
        const secret = new URLSearchParams(String(init?.body)).get("client_secret");
        return json({ access_token: `access-${secret}`, expires_in: 300 });
      }
      authorizations.push(new Headers(init?.headers).get("Authorization") || "");
      return json({ jsonrpc: "2.0", result: { tools: [] } });
    });

    const options = (secret: string) => ({ fetch: fetchMock as typeof fetch, secrets: { CLIENT_SECRET: secret } });
    await listFederatedTools([target], options("first"));
    await listFederatedTools([target], options("first"));
    await listFederatedTools([target], options("second"));

    expect(tokenRequests).toBe(2);
    expect(authorizations).toEqual(["Bearer access-first", "Bearer access-first", "Bearer access-second"]);
  });
});
