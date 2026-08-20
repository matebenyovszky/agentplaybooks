import { describe, expect, it, vi } from "vitest";
import {
  assertSafeRemoteUrl,
  callFederatedTool,
  federatedResourceUri,
  federatedToolName,
  listFederatedResources,
  listFederatedTools,
  parseFederatedResourceUri,
  readFederatedResource,
} from "@/lib/mcp/federation";
import type { MCPServer } from "@/lib/supabase/types";
import { exportSkill, exportedMemoryFields, exportedSkillSchema } from "@/lib/playbook-export-schema";

const server = (overrides: Partial<MCPServer> = {}): MCPServer => ({
  id: "12345678-1234-1234-1234-123456789abc",
  playbook_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  publisher_id: null,
  name: "Research",
  description: "Research tools",
  tools: [],
  resources: [],
  transport_type: "http",
  transport_config: { url: "https://mcp.example.com/rpc", timeout_ms: 1000 },
  created_at: "2026-07-30T00:00:00.000Z",
  ...overrides,
});

function jsonResponse(value: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("MCP federation", () => {
  it("discovers, namespaces, and calls upstream MCP tools", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { method: string };
      if (request.method === "tools/list") {
        return jsonResponse({ jsonrpc: "2.0", id: "1", result: { tools: [{ name: "search", inputSchema: { type: "object" } }] } });
      }
      return jsonResponse({ jsonrpc: "2.0", id: "2", result: { content: [{ type: "text", text: "found" }] } });
    });
    const audit = vi.fn();
    const [tool] = await listFederatedTools([server()], { fetch: fetchMock as typeof fetch, audit });
    expect(tool.name).toBe("ext__123456781234__search");
    const result = await callFederatedTool(server(), tool.name, { query: "MCP" }, { fetch: fetchMock as typeof fetch, audit });
    expect(result).toEqual({ content: [{ type: "text", text: "found" }] });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ operation: "tools/call", status: "success" }));
  });

  it("proxies MCP resources through reversible namespaced URIs", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { method: string };
      if (request.method === "resources/list") {
        return jsonResponse({ jsonrpc: "2.0", id: "1", result: { resources: [{ uri: "docs://guide", name: "Guide" }] } });
      }
      return jsonResponse({ jsonrpc: "2.0", id: "2", result: { contents: [{ uri: "docs://guide", text: "hello" }] } });
    });
    const [resource] = await listFederatedResources([server()], { fetch: fetchMock as typeof fetch });
    expect(parseFederatedResourceUri(resource.uri)).toEqual({ serverId: server().id, originalUri: "docs://guide" });
    await expect(readFederatedResource(server(), "docs://guide", { fetch: fetchMock as typeof fetch }))
      .resolves.toEqual({ contents: [{ uri: "docs://guide", text: "hello" }] });
    expect(federatedResourceUri(server().id, "docs://guide")).toBe(resource.uri);
  });

  it("discovers and invokes OpenAPI operations", async () => {
    const openApiServer = server({
      transport_type: "openapi",
      transport_config: {
        base_url: "https://api.example.com/v1/",
        openapi: {
          openapi: "3.1.0",
          paths: {
            "/search": {
              get: {
                operationId: "searchWeb",
                parameters: [{ name: "q", in: "query", required: true, schema: { type: "string" } }],
              },
            },
          },
        },
      },
    });
    const fetchMock = vi.fn(async (url: string | URL | Request) => jsonResponse({ url: String(url), ok: true }));
    const [tool] = await listFederatedTools([openApiServer], { fetch: fetchMock as typeof fetch });
    expect(tool.name).toBe(federatedToolName(openApiServer, "searchWeb"));
    const result = await callFederatedTool(openApiServer, tool.name, { q: "agents" }, { fetch: fetchMock as typeof fetch });
    expect(result).toEqual({ status: 200, data: { url: "https://api.example.com/v1/search?q=agents", ok: true } });
  });

  it("obtains OAuth client-credentials tokens without leaking secrets", async () => {
    const oauthServer = server({
      transport_config: {
        url: "https://mcp.example.com/rpc",
        auth: {
          type: "oauth2_client_credentials",
          token_url: "https://auth.example.com/token",
          client_id: "agentplaybooks",
          client_secret: "client_secret",
        },
      },
    });
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).includes("auth.example.com")) return jsonResponse({ access_token: "oauth-token", expires_in: 300 });
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer oauth-token");
      return jsonResponse({ jsonrpc: "2.0", id: "1", result: { tools: [] } });
    });
    const audit = vi.fn();
    await listFederatedTools([oauthServer], {
      fetch: fetchMock as typeof fetch,
      secrets: { client_secret: "not-logged" },
      audit,
    });
    expect(JSON.stringify(audit.mock.calls)).not.toContain("not-logged");
  });

  it("renews an access token from a stored refresh token", async () => {
    // The consent step happens once, outside this app; from here on renewal is
    // an ordinary POST, which is what makes user-scoped APIs reachable at all.
    const refreshServer = server({
      transport_config: {
        url: "https://mcp.example.com/rpc",
        auth: {
          type: "oauth2_refresh_token",
          token_url: "https://auth.example.com/token",
          client_id: "agentplaybooks",
          refresh_token_secret: "GMAIL_REFRESH_TOKEN",
        },
      },
    });
    let tokenRequestBody = "";
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).includes("auth.example.com")) {
        tokenRequestBody = String(init?.body);
        return jsonResponse({ access_token: "renewed-token", expires_in: 3600 });
      }
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer renewed-token");
      return jsonResponse({ jsonrpc: "2.0", id: "1", result: { tools: [] } });
    });
    const audit = vi.fn();

    await listFederatedTools([refreshServer], {
      fetch: fetchMock as typeof fetch,
      secrets: { GMAIL_REFRESH_TOKEN: "refresh-value-not-logged" },
      audit,
    });

    const sent = new URLSearchParams(tokenRequestBody);
    expect(sent.get("grant_type")).toBe("refresh_token");
    expect(sent.get("refresh_token")).toBe("refresh-value-not-logged");
    // Declared in the config, so it goes along; a public PKCE client omits it.
    expect(sent.get("client_id")).toBe("agentplaybooks");
    expect(sent.get("client_secret")).toBeNull();
    expect(JSON.stringify(audit.mock.calls)).not.toContain("refresh-value-not-logged");
  });

  it("names the missing refresh token instead of failing vaguely", async () => {
    const refreshServer = server({
      // A stored schema, so tool resolution succeeds and the failure comes from
      // the token exchange rather than from name lookup.
      tools: [{ name: "send", inputSchema: { type: "object" } }],
      transport_config: {
        url: "https://mcp.example.com/rpc",
        auth: {
          type: "oauth2_refresh_token",
          token_url: "https://auth.example.com/token",
          refresh_token_secret: "GMAIL_REFRESH_TOKEN",
        },
      },
    });
    const fetchMock = vi.fn(async () => jsonResponse({ jsonrpc: "2.0", id: "1", result: { tools: [] } }));

    // The vault has nothing under that name, so the error should say which
    // secret is missing rather than fail as a generic upstream error.
    await expect(
      callFederatedTool(refreshServer, federatedToolName(refreshServer, "send"), {}, {
        fetch: fetchMock as typeof fetch,
        secrets: {},
      }),
    ).rejects.toThrow(/GMAIL_REFRESH_TOKEN/);
  });

  it("blocks private network upstreams", () => {
    expect(() => assertSafeRemoteUrl("http://127.0.0.1:3000/mcp", true)).toThrow(/Private upstream/);
    expect(() => assertSafeRemoteUrl("https://metadata.internal/mcp")).toThrow(/Private upstream/);
    expect(() => assertSafeRemoteUrl("https://[fd00::1]/mcp")).toThrow(/Private upstream/);
    expect(() => assertSafeRemoteUrl("https://[::ffff:192.168.1.20]/mcp")).toThrow(/Private upstream/);
  });

  it("parses SSE JSON-RPC responses", async () => {
    const sseServer = server({ id: "87654321-4321-4321-4321-cba987654321", transport_type: "sse" });
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { method: string };
      const result = request.method === "tools/list"
        ? { tools: [{ name: "sse_search", inputSchema: { type: "object" } }] }
        : {};
      return new Response(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: "1", result })}\n\n`, {
        headers: { "Content-Type": "text/event-stream" },
      });
    });
    const tools = await listFederatedTools([sseServer], { fetch: fetchMock as typeof fetch });
    expect(tools[0].name).toBe(federatedToolName(sseServer, "sse_search"));
  });

  it("aborts upstream calls at the configured timeout", async () => {
    const timeoutServer = server({
      id: "99999999-9999-9999-9999-999999999999",
      tools: [{ name: "slow", inputSchema: { type: "object" } }],
      transport_config: { url: "https://slow.example.com/mcp", timeout_ms: 100 },
    });
    const fetchMock = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    await expect(callFederatedTool(
      timeoutServer,
      federatedToolName(timeoutServer, "slow"),
      {},
      { fetch: fetchMock as typeof fetch },
    )).rejects.toMatchObject({ code: "UPSTREAM_TIMEOUT", status: 504 });
  });
});

describe("export schema compatibility", () => {
  it("exports current SKILL.md fields without removed definition/examples fields", () => {
    const skill = exportSkill({
      id: "skill-id",
      playbook_id: "playbook-id",
      publisher_id: null,
      name: "Research guide",
      description: "How to research",
      content: "# Research\nUse primary sources.",
      licence: "MIT",
      priority: 80,
      created_at: "2026-07-30T00:00:00.000Z",
    });
    expect(skill).toHaveProperty("content");
    expect(skill).not.toHaveProperty("definition");
    expect(skill).not.toHaveProperty("examples");
    expect(exportedSkillSchema.properties).not.toHaveProperty("definition");
  });

  it("uses the current memory tier and retention enums", () => {
    expect(exportedMemoryFields.tier.enum).toEqual(["working", "contextual", "longterm"]);
    expect(exportedMemoryFields.retention_policy.enum).toEqual(["permanent", "session", "auto"]);
  });
});
