import { describe, expect, it, vi, beforeEach } from "vitest";

const { getUserFromAuthOrApiKey, getServiceSupabase, loadFederationSecrets, listFederatedTools, listFederatedResources } = vi.hoisted(() => ({
  getUserFromAuthOrApiKey: vi.fn(),
  getServiceSupabase: vi.fn(),
  loadFederationSecrets: vi.fn(),
  listFederatedTools: vi.fn(),
  listFederatedResources: vi.fn(),
}));

vi.mock("@/app/api/_shared/auth", () => ({ getUserFromAuthOrApiKey }));
vi.mock("@/app/api/_shared/supabase", () => ({ getServiceSupabase }));
vi.mock("@/app/api/_shared/federation-secrets", () => ({ loadFederationSecrets }));
vi.mock("@/lib/mcp/federation", async () => {
  class FederationError extends Error {
    constructor(message: string, public readonly code: string, public readonly status = 502) {
      super(message);
    }
  }
  return { FederationError, listFederatedTools, listFederatedResources };
});

import { POST } from "@/app/api/mcp/config/[serverId]/route";
import { FederationError } from "@/lib/mcp/federation";

const SERVER = {
  id: "server-1",
  playbook_id: "playbook-1",
  name: "search",
  transport_type: "http",
  transport_config: { url: "https://mcp.example.com/mcp" },
};

function request() {
  return new Request("http://localhost/api/mcp/config/server-1/test", {
    method: "POST",
    headers: { Authorization: "Bearer apb_user" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getUserFromAuthOrApiKey.mockResolvedValue({ id: "user-1" });
  getServiceSupabase.mockReturnValue({
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ single: async () => ({ data: SERVER }) }) }) }),
    }),
  });
  loadFederationSecrets.mockResolvedValue({ token: "resolved" });
});

/**
 * The point of this endpoint is that a misconfigured upstream is visible here
 * rather than when an agent first tries to use the playbook.
 */
describe("POST /api/mcp/config/:serverId/test", () => {
  it("reports what the upstream offers", async () => {
    listFederatedTools.mockResolvedValue([{ name: "ext__a__search" }, { name: "ext__a__fetch" }]);
    listFederatedResources.mockResolvedValue([{ uri: "mcp-proxy://a/doc" }]);

    const payload = await (await POST(request())).json();

    expect(payload).toEqual({
      ok: true,
      tools: ["ext__a__search", "ext__a__fetch"],
      resources: ["mcp-proxy://a/doc"],
    });
  });

  it("passes the upstream's own words through, with the federation code", async () => {
    listFederatedTools.mockRejectedValue(new FederationError("Missing secret: token", "MISSING_SECRET", 500));
    listFederatedResources.mockResolvedValue([]);

    const response = await POST(request());
    const payload = await response.json();

    // 200 with ok:false — the request succeeded, the upstream did not. A 502 here
    // would make the dashboard's own fetch look broken.
    expect(response.status).toBe(200);
    expect(payload.ok).toBe(false);
    expect(payload.error).toContain("Missing secret: token");
    expect(payload.code).toBe("MISSING_SECRET");
  });

  it("refuses a server the caller does not own", async () => {
    getServiceSupabase.mockReturnValue({
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }) }),
      }),
    });

    const response = await POST(request());

    expect(response.status).toBe(404);
    expect(loadFederationSecrets).not.toHaveBeenCalled();
  });
});
