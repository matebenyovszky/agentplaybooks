import { describe, expect, it, vi } from "vitest";
import { GET as index } from "@/app/api/tools/route";
import { GET as detail } from "@/app/api/tools/[name]/route";

vi.mock("@/app/api/_shared/supabase", () => ({
  getServiceSupabase: () => { throw new Error("Public documentation must not query private data"); },
}));
const request = (path: string) => new Request(`https://agentplaybooks.ai${path}`);

describe("public, on-demand operation documentation", () => {
  it("returns compact paginated summaries without schemas or customer data", async () => {
    const response = await index(request("/api/tools?limit=2"));
    const body = await response.json();
    expect(body.tools).toHaveLength(2);
    expect(body.next_offset).toBe(2);
    expect(body.tools.every((tool: { inputSchema?: unknown }) => !tool.inputSchema)).toBe(true);
    const second = await (await index(request("/api/tools?limit=2&offset=2"))).json();
    expect(second.tools[0].name).not.toBe(body.tools[0].name);
    expect(response.headers.get("Cache-Control")).toContain("public");
    expect((await index(request("/api/tools?limit=1000"))).status).toBe(400);
  });

  it("fetches exactly one schema or OpenAPI operation without authentication", async () => {
    const context = { params: Promise.resolve({ name: "get_secret_status" }) };
    const body = await (await detail(request("/api/tools/get_secret_status"), context)).json();
    expect(body.inputSchema.required).toEqual(["playbook_id", "secret_name"]);
    expect(body.api_version).toBe("1.1.0");
    expect(body.rest.versioned_path).toBe("/api/v1/control/get_secret_status");
    expect(body.rest).toMatchObject({ path: "/api/control/get_secret_status", authentication_required: true });
    const spec = await (await detail(request("/api/tools/get_secret_status?format=openapi"), context)).json();
    expect(spec.info.version).toBe("1.1.0");
    expect(Object.keys(spec.paths)).toEqual(["/api/control/get_secret_status"]);
    expect(spec.paths["/api/control/get_secret_status"].post.responses["403"].content["application/json"].schema.properties.data.properties.reason.type).toBe("string");
    expect(spec.paths["/api/control/get_secret_status"].post.security).toEqual([{ bearerAuth: [] }]);
    expect((await detail(request("/api/tools/not_real"), { params: Promise.resolve({ name: "not_real" }) })).status).toBe(404);
  });

  it("provides a web-readable description without enumerating connected servers", async () => {
    const listing = await (await index(request("/api/tools?query=secret&format=markdown"))).text();
    expect(listing).toContain("/api/tools/get_secret_status?format=markdown");
    const response = await detail(request("/api/tools/get_secret_status?format=markdown"), { params: Promise.resolve({ name: "get_secret_status" }) });
    expect(await response.text()).toContain("POST /api/control/get_secret_status");
  });
});
