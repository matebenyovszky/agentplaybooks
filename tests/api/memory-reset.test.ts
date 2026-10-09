import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  getUserFromAuthOrApiKey: vi.fn(),
  checkPlaybookWriteAccess: vi.fn(),
}));
vi.mock("@/app/api/_shared/auth", () => ({
  getAuthenticatedUser: vi.fn(),
  getUserFromAuthOrApiKey: mocks.getUserFromAuthOrApiKey,
}));
vi.mock("@/app/api/_shared/guards", () => ({
  checkPlaybookWriteAccess: mocks.checkPlaybookWriteAccess,
  getPlaybookAccessRole: vi.fn(),
}));
vi.mock("@/app/api/_shared/supabase", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient("https://memory-reset.supabase.co", "test-service-role", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: mocks.fetch },
  });
  return { getServiceSupabase: () => client, getSupabase: () => client };
});

const { DELETE } = await import("@/app/api/[[...route]]/route");
const request = () => new Request("https://apbks.test/api/manage/playbooks/playbook-1/memory?search=filtered&limit=100", { method: "DELETE" });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUserFromAuthOrApiKey.mockResolvedValue({ id: "user-1" });
  mocks.checkPlaybookWriteAccess.mockResolvedValue(true);
  mocks.fetch.mockResolvedValue(new Response(null, { status: 204 }));
});

describe("DELETE /api/manage/playbooks/:id/memory", () => {
  it("deletes all memories with only a playbook filter and requires memory:write", async () => {
    const response = await DELETE(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(mocks.getUserFromAuthOrApiKey).toHaveBeenCalledWith(expect.any(Request), "memory:write");
    expect(mocks.checkPlaybookWriteAccess).toHaveBeenCalledWith("user-1", "playbook-1");
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = mocks.fetch.mock.calls[0];
    expect(new URL(url).pathname).toBe("/rest/v1/memories");
    expect([...new URL(url).searchParams]).toEqual([["playbook_id", "eq.playbook-1"]]);
    expect(init.method).toBe("DELETE");
  });

  it("rejects missing credentials before making a database request", async () => {
    mocks.getUserFromAuthOrApiKey.mockResolvedValue(null);
    expect((await DELETE(request())).status).toBe(401);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("rejects viewers and users without playbook write access", async () => {
    mocks.checkPlaybookWriteAccess.mockResolvedValue(false);
    expect((await DELETE(request())).status).toBe(404);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("reports database failure instead of clearing the client list", async () => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ message: "delete failed" }), { status: 500 }));
    const response = await DELETE(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "delete failed" });
  });
});
