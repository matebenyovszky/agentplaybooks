import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));

vi.mock("./supabase", () => ({ getDb: getDbMock }));

import {
  checkPlaybookWriteAccess,
  getPlaybookAccessRole,
  getPlaybookByGuid,
} from "./guards";

type QueryResult = Array<Record<string, unknown>>;

function mockDbResults(...results: QueryResult[]) {
  const limit = vi.fn();
  for (const result of results) limit.mockResolvedValueOnce(result);

  const chain = {
    select: vi.fn(),
    from: vi.fn(),
    where: vi.fn(),
    limit,
  };
  chain.select.mockReturnValue(chain);
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  getDbMock.mockReturnValue(chain);
  return chain;
}

describe("playbook access guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns owner without querying collaborator membership", async () => {
    const db = mockDbResults([{ id: "playbook-1" }]);

    await expect(getPlaybookAccessRole("owner-1", "playbook-1")).resolves.toBe("owner");
    expect(db.limit).toHaveBeenCalledTimes(1);
  });

  it("grants write access to an accepted editor membership", async () => {
    mockDbResults([], [{ id: "collaborator-1" }]);

    await expect(checkPlaybookWriteAccess("editor-1", "playbook-1")).resolves.toBe(true);
  });

  it("denies users who are neither owner nor editor", async () => {
    mockDbResults([], []);

    await expect(getPlaybookAccessRole("viewer-1", "playbook-1")).resolves.toBeNull();
  });

  it("does not query membership for a public playbook", async () => {
    const db = mockDbResults([{
      id: "playbook-1",
      user_id: "owner-1",
      visibility: "public",
      guid: "public-guid",
    }]);

    await expect(getPlaybookByGuid("public-guid", "viewer-1")).resolves.toMatchObject({
      id: "playbook-1",
      visibility: "public",
    });
    expect(db.limit).toHaveBeenCalledTimes(1);
  });

  it("hides private playbooks from users without membership", async () => {
    mockDbResults([{
      id: "playbook-1",
      user_id: "owner-1",
      visibility: "private",
      guid: "private-guid",
    }], [], []);

    await expect(getPlaybookByGuid("private-guid", "viewer-1")).resolves.toBeNull();
  });
});
