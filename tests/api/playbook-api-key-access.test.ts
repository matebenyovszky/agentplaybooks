import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST, DELETE, PUT } from "@/app/api/[[...route]]/route";
import { getAuthenticatedUser } from "@/app/api/_shared/auth";
import { checkPlaybookWriteAccess } from "@/app/api/_shared/guards";

vi.mock("@/app/api/_shared/auth", () => ({
  getAuthenticatedUser: vi.fn(),
}));
vi.mock("@/app/api/_shared/guards", () => ({
  checkPlaybookWriteAccess: vi.fn(),
  resolvePlaybookId: vi.fn(async (identifier: string) => identifier),
  checkPlaybookOwnership: vi.fn().mockResolvedValue(false),
  getPlaybookAccessRole: vi.fn(),
}));

const metadata = { id: "key1", key_prefix: "apb_live_test", name: "Bot", role: "admin", permissions: ["full"] };
const select = vi.fn();
const from = vi.fn();
vi.mock("@/app/api/_shared/supabase", () => ({
  getServiceSupabase: () => ({ from }),
  getSupabase: () => ({ from }),
}));

describe("Playbook API key metadata access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: "editor" });
    vi.mocked(checkPlaybookWriteAccess).mockResolvedValue(true);
    const chain = {
      select,
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      single: vi.fn(async () => ({ data: null, error: null })),
      order: vi.fn(async () => ({ data: [metadata], error: null })),
    };
    select.mockReturnValue(chain);
    from.mockReturnValue(chain);
  });

  const request = (suffix = "", method = "GET") => new Request(
    `http://localhost/api/playbooks/playbook1/api-keys${suffix}`,
    { method, headers: { Authorization: "Bearer session" } },
  );

  it("allows an accepted editor to list metadata without exposing hashes", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual([metadata]);
    expect(checkPlaybookWriteAccess).toHaveBeenCalledWith("editor", "playbook1");
    expect(select.mock.calls[0][0]).not.toMatch(/key_hash|encrypted/);
  });

  it("denies a user without accepted editor access", async () => {
    vi.mocked(checkPlaybookWriteAccess).mockResolvedValue(false);
    const response = await GET(request());
    expect(response.status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });

  it("requires a human session", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });

  it.each([
    ["POST", "", POST],
    ["DELETE", "/key1", DELETE],
    ["PUT", "/key1/rotate", PUT],
  ] as const)("keeps %s owner-only", async (method, suffix, handler) => {
    const response = await handler(request(suffix, method));
    expect(response.status).toBe(403);
    expect(from).not.toHaveBeenCalledWith("api_keys");
  });
});
