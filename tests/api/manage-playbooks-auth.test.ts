/**
 * `/api/manage/playbooks` is a concrete Next.js route, so it wins the match
 * over the catch-all Hono app that answers every other `/api/manage/*` path.
 * That made it the one control-plane path where a user API key did not work,
 * and the failure was invisible from the client: `apb pull <guid>` lists
 * playbooks to resolve the guid and got 401, while `apb pull <uuid>` on the
 * same key succeeded because that path does reach the Hono app.
 *
 * These pin both directions: a key is accepted, and the permission it must
 * carry is still required.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/app/api/_shared/auth", () => ({ getUserFromAuthOrApiKey: vi.fn() }));
vi.mock("@/lib/repositories/playbooks", () => ({
  listAccessiblePlaybooks: vi.fn(async () => [{ id: "p1", guid: "office-skills" }]),
  createPlaybook: vi.fn(async () => ({ id: "p2", guid: "new" })),
  parseCreatePlaybookInput: vi.fn((body: unknown) => ({ input: body })),
}));

const { getUserFromAuthOrApiKey } = await import("@/app/api/_shared/auth");
const { GET, POST } = await import("@/app/api/manage/playbooks/route");

function request(body?: unknown) {
  return new Request("https://apbks.test/api/manage/playbooks", {
    method: body ? "POST" : "GET",
    headers: { Authorization: "Bearer apb_live_key", "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }) as unknown as NextRequest;
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/manage/playbooks", () => {
  it("accepts a user API key, not only a browser session", async () => {
    vi.mocked(getUserFromAuthOrApiKey).mockResolvedValue({ id: "user-1" });

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ id: "p1", guid: "office-skills" }]);
    expect(getUserFromAuthOrApiKey).toHaveBeenCalledWith(expect.anything(), "playbooks:read");
  });

  it("still refuses a credential that cannot read playbooks", async () => {
    vi.mocked(getUserFromAuthOrApiKey).mockResolvedValue(null);

    const response = await GET(request());

    expect(response.status).toBe(401);
  });
});

describe("POST /api/manage/playbooks", () => {
  it("requires the write permission, not the read one", async () => {
    vi.mocked(getUserFromAuthOrApiKey).mockResolvedValue({ id: "user-1" });

    await POST(request({ name: "New playbook" }));

    expect(getUserFromAuthOrApiKey).toHaveBeenCalledWith(expect.anything(), "playbooks:write");
  });
});
