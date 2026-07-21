import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/app/api/_shared/auth";
import { checkPlaybookOwnership } from "@/app/api/_shared/guards";
import { getServiceSupabase } from "@/app/api/_shared/supabase";
import { generateInviteToken, hashToken } from "@/lib/utils";
import { POST } from "@/app/api/playbooks/[guid]/collaborators/route";

vi.mock("@/app/api/_shared/auth", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@/app/api/_shared/guards", () => ({ checkPlaybookOwnership: vi.fn() }));
vi.mock("@/app/api/_shared/supabase", () => ({ getServiceSupabase: vi.fn() }));
vi.mock("@/lib/utils", () => ({ generateInviteToken: vi.fn(), hashToken: vi.fn() }));

type RouteResponse = {
  status: number;
  json: () => Promise<unknown>;
};

function playbookClient() {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn().mockResolvedValue({
      data: { id: "playbook-1", name: "Shared playbook", user_id: "owner-1" },
      error: null,
    }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return { from: vi.fn().mockReturnValue(query) } as unknown as ReturnType<typeof getServiceSupabase>;
}

function mutationClient(count: number) {
  const cleanup = {
    delete: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    lt: vi.fn().mockResolvedValue({ error: null }),
  };
  cleanup.delete.mockReturnValue(cleanup);
  cleanup.eq.mockReturnValue(cleanup);
  cleanup.is.mockReturnValue(cleanup);

  const countQuery = {
    select: vi.fn(),
    eq: vi.fn().mockResolvedValue({ count, error: null }),
  };
  countQuery.select.mockReturnValue(countQuery);

  const insertQuery = {
    insert: vi.fn(),
    select: vi.fn(),
    single: vi.fn().mockResolvedValue({
      data: {
        id: "invite-1",
        invite_expires_at: "2026-07-24T10:00:00.000Z",
        created_at: "2026-07-21T10:00:00.000Z",
      },
      error: null,
    }),
  };
  insertQuery.insert.mockReturnValue(insertQuery);
  insertQuery.select.mockReturnValue(insertQuery);

  const from = vi.fn()
    .mockReturnValueOnce(cleanup)
    .mockReturnValueOnce(countQuery)
    .mockReturnValueOnce(insertQuery);

  return {
    client: { from } as unknown as ReturnType<typeof getServiceSupabase>,
    insertQuery,
  };
}

async function createInvite() {
  return POST(new Request("http://localhost/api/playbooks/playbook-1/collaborators") as NextRequest, {
    params: Promise.resolve({ guid: "playbook-1" }),
  }) as unknown as Promise<RouteResponse>;
}

describe("playbook collaborator management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(generateInviteToken).mockReturnValue("plain-invite-token");
    vi.mocked(hashToken).mockResolvedValue("hashed-invite-token");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not let an editor create further invitations", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: "editor-1" });
    vi.mocked(checkPlaybookOwnership).mockResolvedValue(false);
    vi.mocked(getServiceSupabase).mockReturnValue(playbookClient());

    const response = await createInvite();

    expect(response.status).toBe(403);
    expect(generateInviteToken).not.toHaveBeenCalled();
    expect(hashToken).not.toHaveBeenCalled();
  });

  it("stores only the invite hash and returns the plaintext token once", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T10:00:00.000Z"));
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: "owner-1" });
    vi.mocked(checkPlaybookOwnership).mockResolvedValue(true);
    const mutations = mutationClient(0);
    vi.mocked(getServiceSupabase)
      .mockReturnValueOnce(playbookClient())
      .mockReturnValueOnce(mutations.client);

    const response = await createInvite();

    expect(response.status).toBe(201);
    expect(mutations.insertQuery.insert).toHaveBeenCalledWith({
      playbook_id: "playbook-1",
      invited_by: "owner-1",
      invite_token_hash: "hashed-invite-token",
      invite_expires_at: "2026-07-24T10:00:00.000Z",
    });
    expect(JSON.stringify(mutations.insertQuery.insert.mock.calls)).not.toContain("plain-invite-token");
    expect(await response.json()).toEqual(expect.objectContaining({
      status: "pending",
      invite_path: "/invite/plain-invite-token",
    }));
  });

  it("enforces the collaboration row limit before generating a token", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: "owner-1" });
    vi.mocked(checkPlaybookOwnership).mockResolvedValue(true);
    const mutations = mutationClient(25);
    vi.mocked(getServiceSupabase)
      .mockReturnValueOnce(playbookClient())
      .mockReturnValueOnce(mutations.client);

    const response = await createInvite();

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Collaboration limit reached" });
    expect(generateInviteToken).not.toHaveBeenCalled();
    expect(mutations.insertQuery.insert).not.toHaveBeenCalled();
  });
});
