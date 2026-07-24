import { beforeEach, describe, expect, it, vi } from "vitest";

const { getServiceSupabaseMock } = vi.hoisted(() => ({
  getServiceSupabaseMock: vi.fn(),
}));

vi.mock("./supabase", () => ({ getServiceSupabase: getServiceSupabaseMock }));

import {
  checkPlaybookWriteAccess,
  getPlaybookAccessRole,
  getPlaybookByGuid,
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

  it("fails closed when the collaboration lookup fails", async () => {
    mockSupabaseResults(
      { data: null, error: null },
      { data: null, error: { message: "database unavailable" } },
    );

    await expect(getPlaybookAccessRole("editor-1", "playbook-1"))
      .rejects.toThrow("Failed to check playbook collaboration");
  });
});
