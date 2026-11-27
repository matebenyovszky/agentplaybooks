/**
 * Reading a skill's attachments on a private playbook used to accept only a
 * browser session. A user API key that could already read the same files
 * inline through GET /api/manage/playbooks/:id got 403 on
 * GET /api/manage/skills/:skillId/attachments, so a client syncing a private
 * playbook with a key had to fall back to the playbook payload.
 *
 * These pin both directions: a key with skills:read and owner or editor
 * access is accepted, and everyone else is still refused.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/[[...route]]/route";
import { getUserFromAuthOrApiKey } from "@/app/api/_shared/auth";
import { checkPlaybookWriteAccess } from "@/app/api/_shared/guards";

vi.mock("@/app/api/_shared/auth", () => ({
  getAuthenticatedUser: vi.fn(async () => null),
  getUserFromAuthOrApiKey: vi.fn(),
}));
vi.mock("@/app/api/_shared/guards", () => ({
  checkPlaybookWriteAccess: vi.fn(),
  resolvePlaybookId: vi.fn(async (identifier: string) => identifier),
  checkPlaybookOwnership: vi.fn().mockResolvedValue(false),
  getPlaybookAccessRole: vi.fn(),
}));

const attachment = { id: "file-1", skill_id: "skill-1", filename: "references/guide.md", content: "# Guide" };
let visibility: "public" | "private" | "unlisted" = "private";
const from = vi.fn();
vi.mock("@/app/api/_shared/supabase", () => ({
  getServiceSupabase: () => ({ from }),
  getSupabase: () => ({ from }),
}));

function table(name: string) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn(async () => ({ data: [attachment], error: null })),
    single: vi.fn(async () => name === "skills"
      ? { data: { id: "skill-1", playbook_id: "playbook-1", playbooks: { visibility, user_id: "owner" } }, error: null }
      : { data: attachment, error: null }),
  };
  return chain;
}

const listRequest = () => new Request("http://localhost/api/manage/skills/skill-1/attachments", {
  headers: { Authorization: "Bearer apb_live_key" },
});
const fileRequest = () => new Request("http://localhost/api/manage/skills/skill-1/attachments/file-1", {
  headers: { Authorization: "Bearer apb_live_key" },
});

beforeEach(() => {
  vi.clearAllMocks();
  visibility = "private";
  from.mockImplementation(table);
  vi.mocked(getUserFromAuthOrApiKey).mockResolvedValue({ id: "editor" });
  vi.mocked(checkPlaybookWriteAccess).mockResolvedValue(true);
});

describe("GET /api/manage/skills/:skillId/attachments on a private playbook", () => {
  it("accepts a user API key with skills:read from an owner or editor", async () => {
    const response = await GET(listRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([attachment]);
    expect(getUserFromAuthOrApiKey).toHaveBeenCalledWith(expect.anything(), "skills:read");
    expect(checkPlaybookWriteAccess).toHaveBeenCalledWith("editor", "playbook-1");
  });

  it("serves one attachment to the same credential", async () => {
    const response = await GET(fileRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(attachment);
    expect(getUserFromAuthOrApiKey).toHaveBeenCalledWith(expect.anything(), "skills:read");
  });

  it.each([["list", listRequest], ["file", fileRequest]] as const)(
    "refuses a %s read without a credential that can read skills",
    async (_kind, request) => {
      vi.mocked(getUserFromAuthOrApiKey).mockResolvedValue(null);

      const response = await GET(request());

      expect(response.status).toBe(403);
      expect(from).not.toHaveBeenCalledWith("skill_attachments");
    },
  );

  it.each([["list", listRequest], ["file", fileRequest]] as const)(
    "refuses a %s read from an account without owner or editor access",
    async (_kind, request) => {
      vi.mocked(checkPlaybookWriteAccess).mockResolvedValue(false);

      const response = await GET(request());

      expect(response.status).toBe(403);
      expect(from).not.toHaveBeenCalledWith("skill_attachments");
    },
  );
});

describe("GET /api/manage/skills/:skillId/attachments on a shared playbook", () => {
  it.each(["public", "unlisted"] as const)("serves a %s skill without looking up a credential", async (shared) => {
    visibility = shared;

    const response = await GET(listRequest());

    expect(response.status).toBe(200);
    expect(getUserFromAuthOrApiKey).not.toHaveBeenCalled();
  });
});
