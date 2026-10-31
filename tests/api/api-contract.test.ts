import { describe, expect, it, vi } from "vitest";
import { GET as versions } from "@/app/api/versions/route";
import { createApiApp } from "@/app/api/_shared/hono";
import { API_MAJOR_HEADER, API_REVISION_HEADER, API_VERSION } from "@/lib/api-contract";
import { invokeMcpOperation } from "@/app/api/_shared/operation-http";

vi.mock("@/app/api/_shared/supabase", () => ({
  getServiceSupabase: () => { throw new Error("Compatibility discovery must not query private data"); },
}));

function application(path: string) {
  const app = createApiApp(path);
  const operation = vi.fn(() => ({ ok: true }));
  app.post("/", c => c.json(operation()));
  return { app, operation };
}

describe("AgentPlaybooks API contract versioning", () => {
  it("discovers supported majors and optional features without loading tool schemas", async () => {
    const response = await versions();
    expect(response.headers.get(API_MAJOR_HEADER)).toBe("1");
    const body = await response.json();
    expect(body).toMatchObject({ api_version: "1.1.0", supported_majors: [1], unversioned_alias_major: 1, rest_base_path: "/api/v1" });
    expect(body.features).toHaveProperty("secret_status", "1.1.0");
    expect(body.tools).toBeUndefined();
    expect(JSON.stringify(body).length).toBeLessThan(2000);
  });

  it.each([undefined, "1"])("keeps legacy and explicit-v1 requests equivalent (%s)", async version => {
    const { app, operation } = application("/api/control/demo");
    const response = await app.request("/api/control/demo", {
      method: "POST", headers: version ? { [API_MAJOR_HEADER]: version } : {},
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(operation).toHaveBeenCalledOnce();
    expect(response.headers.get(API_MAJOR_HEADER)).toBe("1");
    expect(response.headers.get(API_REVISION_HEADER)).toBe(API_VERSION);
  });

  it("refuses unknown API versions before any operation is invoked", async () => {
    const { app, operation } = application("/api/mcp/manage");
    const response = await app.request("/api/mcp/manage", { method: "POST", headers: { [API_MAJOR_HEADER]: "2" } });
    expect(response.status).toBe(400);
    expect((await response.json()).error.data).toMatchObject({ reason: "unsupported_api_version", supported_majors: [1] });
    expect(operation).not.toHaveBeenCalled();
  });

  it("does not confuse the MCP protocol version with the application API version", async () => {
    const { app, operation } = application("/api/mcp/manage");
    const response = await app.request("/api/mcp/manage", { method: "POST", headers: { "MCP-Protocol-Version": "2099-01-01" } });
    expect(response.status).toBe(200);
    expect(operation).toHaveBeenCalledOnce();
  });

  it("permits version headers in CORS and exposes the selected API to browser clients", async () => {
    const { app } = application("/api/mcp/manage");
    const response = await app.request("/api/mcp/manage", { method: "OPTIONS", headers: {
      Origin: "https://agentplaybooks.ai", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": API_MAJOR_HEADER,
    } });
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain(API_MAJOR_HEADER);
    const executed = await app.request("/api/mcp/manage", { method: "POST", headers: { Origin: "https://agentplaybooks.ai" } });
    expect(executed.headers.get("Access-Control-Expose-Headers")).toContain(API_REVISION_HEADER);
  });

  it("preserves API identity through REST projection, including version mismatches", async () => {
    const { app } = application("/api/mcp/manage");
    const response = await invokeMcpOperation(req => app.fetch(req), new Request("https://agentplaybooks.ai/api/control/demo", {
      method: "POST", headers: { [API_MAJOR_HEADER]: "2" },
    }), "/api/mcp/manage", "demo", {});
    expect(response.status).toBe(400);
    expect((await response.json()).data.reason).toBe("unsupported_api_version");
    expect(response.headers.get(API_REVISION_HEADER)).toBe(API_VERSION);
  });
});
