import { describe, expect, it, vi } from "vitest";
import { invokeMcpOperation } from "@/app/api/_shared/operation-http";
import { captureOperationResult } from "@/app/api/_shared/operation-result";

describe("REST/OpenAPI operation projection", () => {
  it("projects an authorized result without serializing or parsing an MCP envelope", async () => {
    const request = new Request("https://agentplaybooks.ai/api/control/read_memory", { method: "POST" });
    const response = await invokeMcpOperation(async () => {
      expect(captureOperationResult("read_memory", { value: "fixture" })).toBe(true);
      // An empty body proves the projection did not attempt response.json().
      return new Response(null, { headers: { "X-AgentPlaybooks-API-Version": "1" } });
    }, request, "/api/mcp/manage", "read_memory", {});
    expect(await response.json()).toEqual({ value: "fixture" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(captureOperationResult("read_memory", { value: "outside" })).toBe(false);
  });

  it("propagates client cancellation to the internal handler", async () => {
    const controller = new AbortController();
    const response = await invokeMcpOperation(async request => {
      controller.abort();
      expect(request.signal.aborted).toBe(true);
      return Response.json({ result: { content: [{ type: "text", text: "{}" }] } });
    }, new Request("https://agentplaybooks.ai/api/control/read_memory", { method: "POST", signal: controller.signal }),
    "/api/mcp/manage", "read_memory", {});
    expect(await response.json()).toEqual({});
  });

  it("isolates concurrent projections and retains the discovery merge path", async () => {
    const invoke = (value: string) => invokeMcpOperation(async () => {
      await Promise.resolve();
      expect(captureOperationResult("other_tool", "wrong")).toBe(false);
      expect(captureOperationResult("read_memory", { value })).toBe(true);
      return new Response(null);
    }, new Request("https://agentplaybooks.ai/api/control/read_memory", { method: "POST" }), "/api/mcp/manage", "read_memory", {});
    const responses = await Promise.all([invoke("one"), invoke("two")]);
    expect(await Promise.all(responses.map(response => response.json()))).toEqual([{ value: "one" }, { value: "two" }]);
    const discovery = await invokeMcpOperation(async () => {
      expect(captureOperationResult("find_tools", {})).toBe(false);
      return Response.json({ result: { content: [{ type: "text", text: '{"matches":[]}' }] } });
    }, new Request("https://agentplaybooks.ai/api/control/find_tools", { method: "POST" }), "/api/mcp/manage", "find_tools", {});
    expect(await discovery.json()).toEqual({ matches: [] });
  });
  it("passes the REST body to the MCP operation handler and unwraps its result", async () => {
    const handler = vi.fn(async (request: Request) => {
      const body = await request.json();
      expect(new URL(request.url).pathname).toBe("/api/mcp/demo");
      expect(body.params).toEqual({ name: "write_memory", arguments: { key: "k", value: { ok: true } } });
      return Response.json({
        jsonrpc: "2.0",
        id: body.id,
        result: { content: [{ type: "text", text: JSON.stringify({ saved: true }) }] },
      });
    });

    const response = await invokeMcpOperation(
      handler,
      new Request("https://agentplaybooks.ai/api/playbooks/demo/operations/write_memory", {
        method: "POST",
        headers: { Authorization: "Bearer apb_test" },
      }),
      "/api/mcp/demo",
      "write_memory",
      { key: "k", value: { ok: true } },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ saved: true });
    expect(handler).toHaveBeenCalledOnce();
  });

  it("maps JSON-RPC argument errors to an HTTP client error", async () => {
    const response = await invokeMcpOperation(
      async () => Response.json({ jsonrpc: "2.0", id: 1, error: { code: -32602, message: "playbook_id is required" } }),
      new Request("https://agentplaybooks.ai/api/control/write_memory", { method: "POST" }),
      "/api/mcp/manage",
      "write_memory",
      {},
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "playbook_id is required", code: -32602 });
  });
  it.each([
    ["proxy_only", 422], ["secrets_read_required", 422], ["secret_not_found", 422],
    ["secret_query_failed", 422], ["audit_unavailable", 422],
  ])("preserves reason %s without changing the legacy HTTP %s status", async (reason, status) => {
    const data = { reason, next_steps: ["Confirm the secret state with the user"] };
    const response = await invokeMcpOperation(async request => {
      expect(request.headers.get("X-AgentPlaybooks-Toolset")).toBe("secrets");
      return Response.json({ error: { code: -32000, message: "Operation refused", data } });
    }, new Request("https://agentplaybooks.ai/api/control/reveal_secret", {
      method: "POST", headers: { "X-AgentPlaybooks-Toolset": "secrets" },
    }), "/api/mcp/manage", "reveal_secret", {});
    expect(response.status).toBe(status);
    expect((await response.json()).data).toEqual(data);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("preserves authentication challenges and does not cache revealed values", async () => {
    const request = new Request("https://agentplaybooks.ai/api/control/reveal_secret", { method: "POST" });
    const denied = await invokeMcpOperation(async () => Response.json({ error: { code: -32001, message: "Connect first" } }, {
      status: 401, headers: { "WWW-Authenticate": "Bearer resource_metadata=example" },
    }), request, "/api/mcp/manage", "reveal_secret", {});
    expect(denied.status).toBe(401);
    expect(denied.headers.get("WWW-Authenticate")).toContain("resource_metadata");
    const revealed = await invokeMcpOperation(async () => Response.json({ result: { content: [{ type: "text", text: JSON.stringify({ value: "FIXTURE" }) }], structuredContent: { value: "FIXTURE" } } }),
      request, "/api/mcp/manage", "reveal_secret", {});
    expect(revealed.headers.get("Cache-Control")).toBe("no-store");
    expect(await revealed.json()).toEqual({ value: "FIXTURE" });
  });

  it("keeps legacy text-result precedence and the no-text response envelope", async () => {
    const request = new Request("https://agentplaybooks.ai/api/control/read_memory", { method: "POST" });
    const result = { content: [{ type: "text", text: JSON.stringify({ legacy: true }) }], structuredContent: { richer: true } };
    const response = await invokeMcpOperation(async () => Response.json({ result }), request, "/api/mcp/manage", "read_memory", {});
    expect(await response.json()).toEqual({ legacy: true });
    const noText = { content: [], structuredContent: { richer: true } };
    const fallback = await invokeMcpOperation(async () => Response.json({ result: noText }), request, "/api/mcp/manage", "read_memory", {});
    expect(await fallback.json()).toEqual(noText);
  });

});
