import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/app/api/_shared/auth";
import { getServiceSupabase } from "@/app/api/_shared/supabase";
import { hashToken } from "@/lib/utils";
import { GET, POST } from "@/app/api/collaboration-invites/[token]/route";

vi.mock("@/app/api/_shared/auth", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@/app/api/_shared/supabase", () => ({ getServiceSupabase: vi.fn() }));
vi.mock("@/lib/utils", () => ({ hashToken: vi.fn() }));

type Invite = {
  id: string;
  playbook_id: string;
  user_id: string | null;
  accepted_at: string | null;
  invite_expires_at: string;
  playbooks: { id: string; name: string; user_id: string };
};

type RouteResponse = {
  status: number;
  json: () => Promise<unknown>;
};

const validInvite = (): Invite => ({
  id: "invite-1",
  playbook_id: "playbook-1",
  user_id: null,
  accepted_at: null,
  invite_expires_at: "2099-01-01T00:00:00.000Z",
  playbooks: { id: "playbook-1", name: "Shared playbook", user_id: "owner-1" },
});

function findClient(invite: Invite | null) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn().mockResolvedValue({ data: invite, error: invite ? null : { message: "not found" } }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return {
    from: vi.fn().mockReturnValue(query),
  } as unknown as ReturnType<typeof getServiceSupabase>;
}

function acceptanceClient(options?: { existing?: boolean; updateSucceeds?: boolean }) {
  const existingQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    not: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: options?.existing ? { id: "existing-membership" } : null,
      error: null,
    }),
  };
  existingQuery.select.mockReturnValue(existingQuery);
  existingQuery.eq.mockReturnValue(existingQuery);
  existingQuery.not.mockReturnValue(existingQuery);

  const updateQuery = {
    update: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    gt: vi.fn(),
    select: vi.fn(),
    single: vi.fn().mockResolvedValue(options?.updateSucceeds === false
      ? { data: null, error: { message: "already used" } }
      : { data: { playbook_id: "playbook-1" }, error: null }),
  };
  updateQuery.update.mockReturnValue(updateQuery);
  updateQuery.eq.mockReturnValue(updateQuery);
  updateQuery.is.mockReturnValue(updateQuery);
  updateQuery.gt.mockReturnValue(updateQuery);
  updateQuery.select.mockReturnValue(updateQuery);

  const deleteQuery = {
    delete: vi.fn(),
    eq: vi.fn().mockResolvedValue({ error: null }),
  };
  deleteQuery.delete.mockReturnValue(deleteQuery);

  const from = vi.fn()
    .mockReturnValueOnce(existingQuery)
    .mockReturnValueOnce(options?.existing ? deleteQuery : updateQuery);

  return {
    client: { from } as unknown as ReturnType<typeof getServiceSupabase>,
    updateQuery,
  };
}

async function postInvite() {
  return POST(new Request("http://localhost/api/collaboration-invites/token") as NextRequest, {
    params: Promise.resolve({ token: "plain-token" }),
  }) as unknown as Promise<RouteResponse>;
}

describe("collaboration invite API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hashToken).mockResolvedValue("hashed-token");
  });

  it("requires an authenticated account before reading or consuming the token", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);

    const response = await postInvite();

    expect(response.status).toBe(401);
    expect(getServiceSupabase).not.toHaveBeenCalled();
    expect(hashToken).not.toHaveBeenCalled();
  });

  it("returns only safe preview fields", async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(findClient(validInvite()));

    const response = await GET(new Request("http://localhost") as NextRequest, {
      params: Promise.resolve({ token: "plain-token" }),
    }) as unknown as RouteResponse;

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      playbook_name: "Shared playbook",
      expires_at: "2099-01-01T00:00:00.000Z",
    });
  });

  it.each([
    ["expired", { invite_expires_at: "2000-01-01T00:00:00.000Z" }],
    ["already accepted", { accepted_at: "2026-01-01T00:00:00.000Z", user_id: "editor-1" }],
  ])("rejects an %s invite before any membership write", async (_label, overrides) => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: "editor-1" });
    vi.mocked(getServiceSupabase).mockReturnValue(findClient({ ...validInvite(), ...overrides }));

    const response = await postInvite();

    expect(response.status).toBe(404);
    expect(getServiceSupabase).toHaveBeenCalledTimes(1);
  });

  it("prevents the owner from accepting their own invite", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: "owner-1" });
    vi.mocked(getServiceSupabase).mockReturnValue(findClient(validInvite()));

    const response = await postInvite();

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "The owner cannot accept their own invite" });
  });

  it("binds a valid invite atomically to the authenticated user", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: "editor-1" });
    const acceptance = acceptanceClient();
    vi.mocked(getServiceSupabase)
      .mockReturnValueOnce(findClient(validInvite()))
      .mockReturnValueOnce(acceptance.client);

    const response = await postInvite();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ playbook_id: "playbook-1" });
    expect(acceptance.updateQuery.update).toHaveBeenCalledWith(expect.objectContaining({
      user_id: "editor-1",
      accepted_at: expect.any(String),
    }));
    expect(acceptance.updateQuery.is).toHaveBeenCalledWith("user_id", null);
    expect(acceptance.updateQuery.is).toHaveBeenCalledWith("accepted_at", null);
    expect(acceptance.updateQuery.gt).toHaveBeenCalledWith("invite_expires_at", expect.any(String));
  });

  it("returns conflict when another request consumes the invite first", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: "editor-1" });
    const acceptance = acceptanceClient({ updateSucceeds: false });
    vi.mocked(getServiceSupabase)
      .mockReturnValueOnce(findClient(validInvite()))
      .mockReturnValueOnce(acceptance.client);

    const response = await postInvite();

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Invite was already used" });
  });
});
