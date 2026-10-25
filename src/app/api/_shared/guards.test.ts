import { beforeEach, describe, expect, it, vi } from "vitest";

const { getServiceSupabaseMock } = vi.hoisted(() => ({
  getServiceSupabaseMock: vi.fn(),
}));

vi.mock("./supabase", () => ({ getServiceSupabase: getServiceSupabaseMock }));

import {
  checkPlaybookWriteAccess,
  getPlaybookAccessRole,
  getPlaybookByGuid,
  resolvePlaybookId,
} from "./guards";

type QueryResult = {
  data: Record<string, unknown> | null;
  error: { message: string } | null;
};

function mockSupabaseResults(...results: QueryResult[]) {
  const maybeSingle = vi.fn();
  for (const result of results) maybeSingle.mockResolvedValueOnce(result);

  const chain = {
    from: vi.fn(),
    select: vi.fn(),
    eq: vi.fn(),
    not: vi.fn(),
    maybeSingle,
  };
  chain.from.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.not.mockReturnValue(chain);
  getServiceSupabaseMock.mockReturnValue(chain);
  return chain;
}

describe("playbook access guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns owner without querying collaborator membership", async () => {
    const supabase = mockSupabaseResults({
      data: { id: "playbook-1" },
      error: null,
    });

    await expect(getPlaybookAccessRole("owner-1", "playbook-1")).resolves.toBe("owner");
    expect(supabase.maybeSingle).toHaveBeenCalledTimes(1);
  });

  it("grants write access to an accepted editor membership", async () => {
    mockSupabaseResults(
      { data: null, error: null },
      { data: { id: "collaborator-1" }, error: null },
    );

    await expect(checkPlaybookWriteAccess("editor-1", "playbook-1")).resolves.toBe(true);
  });

  it("does not grant write access to an auditor", async () => {
    mockSupabaseResults(
      { data: null, error: null },
      { data: { id: "collaborator-1", role: "auditor" }, error: null },
    );

    await expect(getPlaybookAccessRole("auditor-1", "playbook-1")).resolves.toBe("auditor");
  });

  it("refuses writes from an auditor membership", async () => {
    mockSupabaseResults(
      { data: null, error: null },
      { data: { id: "collaborator-1", role: "auditor" }, error: null },
    );

    await expect(checkPlaybookWriteAccess("auditor-1", "playbook-1")).resolves.toBe(false);
  });

  it("denies users who are neither owner nor editor", async () => {
    mockSupabaseResults(
      { data: null, error: null },
      { data: null, error: null },
    );

    await expect(getPlaybookAccessRole("viewer-1", "playbook-1")).resolves.toBeNull();
  });

  it("does not query membership for a public playbook", async () => {
    const supabase = mockSupabaseResults({
      data: {
        id: "playbook-1",
        user_id: "owner-1",
        visibility: "public",
        guid: "public-guid",
      },
      error: null,
    });

    await expect(getPlaybookByGuid("public-guid", "viewer-1")).resolves.toMatchObject({
      id: "playbook-1",
      visibility: "public",
    });
    expect(supabase.maybeSingle).toHaveBeenCalledTimes(1);
  });

  it("hides private playbooks from users without membership", async () => {
    mockSupabaseResults(
      {
        data: {
          id: "playbook-1",
          user_id: "owner-1",
          visibility: "private",
          guid: "private-guid",
        },
        error: null,
      },
      { data: null, error: null },
      { data: null, error: null },
    );

    await expect(getPlaybookByGuid("private-guid", "viewer-1")).resolves.toBeNull();
  });

  it("lets a playbook API key reach its own private playbook", async () => {
    // A playbook-scoped key has no session, so the visibility gate used to
    // reject it and every secrets endpoint answered 404 on a private playbook.
    const supabase = mockSupabaseResults({
      data: {
        id: "playbook-1",
        user_id: "owner-1",
        visibility: "private",
        guid: "private-guid",
      },
      error: null,
    });

    await expect(getPlaybookByGuid("private-guid", null, "playbook-1"))
      .resolves.toMatchObject({ id: "playbook-1", visibility: "private" });
    // The key is its own proof of access — no membership lookup is needed.
    expect(supabase.maybeSingle).toHaveBeenCalledTimes(1);
  });

  it("rejects a key issued for a different playbook", async () => {
    mockSupabaseResults(
      {
        data: {
          id: "playbook-1",
          user_id: "owner-1",
          visibility: "private",
          guid: "private-guid",
        },
        error: null,
      },
      { data: null, error: null },
      { data: null, error: null },
    );

    await expect(getPlaybookByGuid("private-guid", null, "other-playbook"))
      .resolves.toBeNull();
  });

  it("still hides a private playbook when no key is presented", async () => {
    mockSupabaseResults(
      {
        data: {
          id: "playbook-1",
          user_id: "owner-1",
          visibility: "private",
          guid: "private-guid",
        },
        error: null,
      },
      { data: null, error: null },
      { data: null, error: null },
    );

    await expect(getPlaybookByGuid("private-guid", null)).resolves.toBeNull();
  });

  it("fails closed when the collaboration lookup fails", async () => {
    mockSupabaseResults(
      { data: null, error: null },
      { data: null, error: { message: "database unavailable" } },
    );

    await expect(getPlaybookAccessRole("editor-1", "playbook-1"))
      .rejects.toThrow("Failed to check playbook collaboration");
  });
});

describe("either playbook identifier", () => {
  const UUID = "3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("looks a playbook up by UUID as well as by GUID", async () => {
    const byUuid = mockSupabaseResults({
      data: { id: UUID, user_id: "owner-1", visibility: "public", guid: "a1b2c3d4e5f60718" },
      error: null,
    });
    await expect(getPlaybookByGuid(UUID, null)).resolves.toMatchObject({ id: UUID });
    expect(byUuid.eq).toHaveBeenCalledWith("id", UUID);

    const byGuid = mockSupabaseResults({
      data: { id: UUID, user_id: "owner-1", visibility: "public", guid: "a1b2c3d4e5f60718" },
      error: null,
    });
    await expect(getPlaybookByGuid("a1b2c3d4e5f60718", null)).resolves.toMatchObject({ id: UUID });
    expect(byGuid.eq).toHaveBeenCalledWith("guid", "a1b2c3d4e5f60718");
  });

  it("resolves a GUID to the UUID that UUID-keyed routes use", async () => {
    mockSupabaseResults({ data: { id: UUID }, error: null });
    await expect(resolvePlaybookId("a1b2c3d4e5f60718")).resolves.toBe(UUID);
  });

  it("passes a UUID through without a query", async () => {
    await expect(resolvePlaybookId(UUID)).resolves.toBe(UUID);
    expect(getServiceSupabaseMock).not.toHaveBeenCalled();
  });

  it("leaves an unknown GUID for the route's own lookup to refuse", async () => {
    mockSupabaseResults({ data: null, error: null });
    await expect(resolvePlaybookId("does-not-exist")).resolves.toBe("does-not-exist");
  });
});
