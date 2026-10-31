import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/mcp/manage/route";
import { getAuthenticatedUser, validateUserApiKey } from "@/app/api/_shared/auth";
import { getServiceSupabase } from "@/app/api/_shared/supabase";
import { listAccessiblePlaybooks } from "@/lib/repositories/playbooks";

vi.mock("@/app/api/_shared/supabase", () => ({ getServiceSupabase: vi.fn() }));
vi.mock("@/lib/repositories/playbooks", () => ({ listAccessiblePlaybooks: vi.fn(), createPlaybook: vi.fn() }));

vi.mock("@/app/api/_shared/auth", () => ({
  getAuthenticatedUser: vi.fn(),
  validateUserApiKey: vi.fn(),
}));

const mockValidateUserApiKey = vi.mocked(validateUserApiKey);
const mockGetAuthenticatedUser = vi.mocked(getAuthenticatedUser);

const authenticatedUserKey = {
  id: "user-key-id",
  user_id: "user-id",
  key_hash: "hash",
  key_prefix: "apb_live_test",
  name: "test",
  permissions: ["full"],
  is_active: true,
  expires_at: null,
  last_used_at: null,
  created_at: "2026-01-01T00:00:00.000Z",
};

function mcpRequest(body: Record<string, unknown>, headers: Record<string, string> = {}, query = "") {
  return new Request(`http://localhost/api/mcp/manage${query}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", ...body }),
  });
}

describe("AgentPlaybooks management MCP transport", () => {
  beforeEach(() => {
    mockValidateUserApiKey.mockResolvedValue(authenticatedUserKey);
    mockGetAuthenticatedUser.mockResolvedValue(null);
  });

  it("advertises the API contract independently from the MCP protocol and server build", async () => {
    const response = await POST(mcpRequest({ id: 100, method: "initialize", params: { protocolVersion: "2025-11-25" } }));
    const payload = await response.json();
    expect(response.headers.get("X-AgentPlaybooks-API-Version")).toBe("1");
    expect(payload.result.protocolVersion).toBe("2025-11-25");
    expect(payload.result._meta["ai.agentplaybooks/apiVersion"]).toBe("1.1.0");
    expect(payload.result.serverInfo.version).toBe("0.4.0");
  });

  it("rejects unauthenticated keepalive requests", async () => {
    mockValidateUserApiKey.mockResolvedValueOnce(null);

    const response = await POST(mcpRequest({ id: 0, method: "ping" }));

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toContain(
      "/.well-known/oauth-protected-resource/api/mcp/manage",
    );
    expect(await response.json()).toMatchObject({
      id: null,
      error: { code: -32001 },
    });
  });

  it("declares a read-only OAuth profile tool and resolves only the validated account", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { display_name: "First account" }, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    vi.mocked(getServiceSupabase).mockReturnValue({ from: () => ({ select: () => ({ eq }) }) } as never);
    const listed = await POST(mcpRequest({ id: 10, method: "tools/list" }));
    const { result: catalog } = await listed.json();
    const descriptor = catalog.tools.find((tool: { name: string }) => tool.name === "get_profile");
    expect(descriptor._meta).toEqual({ "openai/profile": true });
    expect(descriptor.annotations.readOnlyHint).toBe(true);
    expect(descriptor.securitySchemes).toEqual([{ type: "oauth2", scopes: [] }]);

    const request = () => mcpRequest({ id: 11, method: "tools/call", params: { name: "get_profile", arguments: {} } });
    const first = await (await POST(request())).json();
    expect(first.result.structuredContent).toEqual({ id: "user-id", name: "First account" });
    expect(eq).toHaveBeenLastCalledWith("auth_user_id", "user-id");
    mockValidateUserApiKey.mockResolvedValueOnce({ ...authenticatedUserKey, user_id: "other-user" });
    const second = await (await POST(request())).json();
    expect(second.result.structuredContent.id).toBe("other-user");
    expect(eq).toHaveBeenLastCalledWith("auth_user_id", "other-user");
    mockValidateUserApiKey.mockResolvedValueOnce(null);
    expect((await POST(request())).status).toBe(401);
  });

  it("uses bounded metadata discovery and never accepts an unbounded list request", async () => {
    const list = vi.mocked(listAccessiblePlaybooks).mockResolvedValue([]);
    const call = (args: object) => POST(mcpRequest({ id: 20, method: "tools/call", params: { name: "list_playbooks", arguments: args } }));
    expect((await (await call({})).json()).result.structuredContent).toEqual({ playbooks: [] });
    expect(list).toHaveBeenLastCalledWith("user-id", { compact: true, limit: 50, offset: 0 });
    await call({ query: "robot", limit: 5, offset: 10 });
    expect(list).toHaveBeenLastCalledWith("user-id", { compact: true, query: "robot", limit: 5, offset: 10 });
    for (const args of [{ limit: 101 }, { offset: -1 }, { offset: 1000 }, { query: {} }, { query: "x".repeat(201) }]) {
      list.mockClear();
      expect((await (await call(args)).json()).error).toBeDefined();
      expect(list).not.toHaveBeenCalled();
    }
  });

  it("rejects an unauthenticated body before attempting to parse it", async () => {
    mockValidateUserApiKey.mockResolvedValueOnce(null);

    const response = await POST(new Request("http://localhost/api/mcp/manage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    }));

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toContain("resource_metadata=");
  });

  it("does not build the management manifest without a user key", async () => {
    mockValidateUserApiKey.mockResolvedValueOnce(null);

    const response = await GET(new Request("http://localhost/api/mcp/manage", {
      headers: { Accept: "application/json" },
    }));

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toContain("resource_metadata=");
  });

  it("accepts a Supabase OAuth access token as the signed-in account", async () => {
    mockValidateUserApiKey.mockResolvedValueOnce(null);
    mockGetAuthenticatedUser.mockResolvedValueOnce({ id: "oauth-user" });

    const response = await GET(new Request("http://localhost/api/mcp/manage", {
      headers: { Authorization: "Bearer oauth-access-token" },
    }));
    const manifest = await response.json();

    expect(response.status).toBe(200);
    expect(manifest.serverInfo).toMatchObject({
      name: "agentplaybooks-management",
      version: "0.4.0",
    });
    expect(manifest._auth).toMatchObject({ type: "oauth2", actor: "oauth" });
  });

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
    expect(payload.result.serverInfo.version).toBe("0.4.0");
  });

  it("accepts the initialized notification without a JSON-RPC body", async () => {
    const response = await POST(mcpRequest({ method: "notifications/initialized" }));
    expect(response.status).toBe(202);
    expect(await response.text()).toBe("");
  });

  it("acknowledges cancellation notifications without a JSON-RPC reply", async () => {
    const response = await POST(mcpRequest({ method: "notifications/cancelled", params: { requestId: 1 } }));
    expect(response.status).toBe(202);
    expect(await response.text()).toBe("");
  });

  it("reports malformed authenticated requests as protocol errors", async () => {
    const invalidJson = await POST(new Request("http://localhost/api/mcp/manage", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{",
    }));
    expect(invalidJson.status).toBe(400);
    expect((await invalidJson.json()).error.code).toBe(-32700);
    const invalidEnvelope = await POST(mcpRequest({ id: 1, method: 123 }));
    expect(invalidEnvelope.status).toBe(400);
    expect((await invalidEnvelope.json()).error.code).toBe(-32600);
  });

  it("supports ping", async () => {
    const response = await POST(mcpRequest({ id: 2, method: "ping" }));
    expect(await response.json()).toEqual({ jsonrpc: "2.0", id: 2, result: {} });
  });

  it("supports full discovery at a fixed URL without changing the default compact view", async () => {
    const list = { id: 3, method: "tools/list" };
    const full = await (await POST(mcpRequest(list, { "X-AgentPlaybooks-Toolset": "full" }))).json();
    const compact = await (await POST(mcpRequest(list))).json();
    expect(full.result.tools.length).toBeGreaterThan(compact.result.tools.length);
    expect(full.result.tools.map((tool: { name: string }) => tool.name)).toContain("delete_secret");
    const manifest = await (await GET(new Request("http://localhost/api/mcp/manage", {
      headers: { "X-AgentPlaybooks-Toolset": "full" },
    }))).json();
    expect(manifest.tools).toEqual(full.result.tools);
  });

  it("does not let the discovery header override an explicit restricted domain", async () => {
    const response = await POST(mcpRequest({ id: 3, method: "tools/list" },
      { "X-AgentPlaybooks-Toolset": "full" }, "?toolset=memory"));
    const payload = await response.json();
    expect(payload.result.tools.map((tool: { name: string }) => tool.name)).not.toContain("delete_secret");
    const denied = await POST(mcpRequest({ id: 4, method: "tools/call", params: { name: "delete_secret", arguments: {} } },
      { "X-AgentPlaybooks-Toolset": "full" }, "?toolset=memory"));
    expect((await denied.json()).error.code).toBe(-32602);
  });

  it("projects every playbook operation with an explicit playbook_id", async () => {
    const response = await POST(mcpRequest({ id: 4, method: "tools/list" }, {}, "?toolset=full"));
    const payload = await response.json();
    const tools = payload.result.tools as Array<{
      name: string;
      description?: string;
      inputSchema: { properties?: Record<string, unknown>; required?: string[] };
      annotations?: {
        readOnlyHint?: boolean;
        destructiveHint?: boolean;
        idempotentHint?: boolean;
        openWorldHint?: boolean;
      };
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
      expect(tool.description).not.toContain("Target a playbook with playbook_id.");
      expect(tool.annotations?.readOnlyHint).toBe(false);
    }
    for (const tool of tools) {
      expect(tool.annotations, `${tool.name} missing annotations in tools/list`).toEqual(
        expect.objectContaining({
          readOnlyHint: expect.any(Boolean),
          destructiveHint: expect.any(Boolean),
          idempotentHint: expect.any(Boolean),
          openWorldHint: expect.any(Boolean),
        }),
      );
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
