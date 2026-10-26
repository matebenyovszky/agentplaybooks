import { beforeEach, describe, expect, it, vi } from "vitest";

const { authUser, forkPlaybookMock, serviceClient, accessRole } = vi.hoisted(() => ({
  authUser: vi.fn(),
  forkPlaybookMock: vi.fn(),
  serviceClient: vi.fn(),
  accessRole: vi.fn(),
}));

vi.mock("@/app/api/_shared/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/api/_shared/auth")>()),
  getUserFromAuthOrApiKey: authUser,
}));

vi.mock("@/app/api/_shared/supabase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/api/_shared/supabase")>()),
  getServiceSupabase: serviceClient,
}));

vi.mock("@/app/api/_shared/guards", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/api/_shared/guards")>()),
  getPlaybookAccessRole: accessRole,
}));

vi.mock("@/lib/repositories/playbooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/repositories/playbooks")>()),
  forkPlaybook: forkPlaybookMock,
}));

const { POST } = await import("@/app/api/[[...route]]/route");

beforeEach(() => {
  vi.clearAllMocks();
  authUser.mockResolvedValue({ id: "new-owner-id" });
  accessRole.mockResolvedValue(null);
  forkPlaybookMock.mockResolvedValue({
    id: "fork-id",
    user_id: "new-owner-id",
    publisher_id: "source-publisher-id",
  });

  const query = {} as Record<string, ReturnType<typeof vi.fn>>;
  Object.assign(query, {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn().mockResolvedValue({
      data: {
        id: "source-id",
        user_id: "source-owner-id",
        publisher_id: "source-publisher-id",
        name: "Original",
        description: "Source description",
        config: { mode: "careful" },
        tags: ["robotics"],
        persona_name: "Guide",
        persona_system_prompt: "Be helpful.",
        persona_metadata: { language: "en" },
        instructions: "Follow the source instructions.",
        visibility: "public",
      },
      error: null,
    }),
  });
  serviceClient.mockReturnValue({ from: vi.fn(() => query) });
});

describe("POST /api/manage/playbooks/:id/fork", () => {
  it("assigns ownership to the caller while keeping the source publisher", async () => {
    const response = await POST(new Request("https://apbks.test/api/manage/playbooks/source-id/fork", {
      method: "POST",
      headers: { Authorization: "Bearer apb_live_key" },
    }));

    expect(response.status).toBe(201);
    expect(forkPlaybookMock).toHaveBeenCalledWith("new-owner-id", "source-id");
    expect(await response.json()).toEqual({
      id: "fork-id",
      user_id: "new-owner-id",
      publisher_id: "source-publisher-id",
    });
  });

  it("does not fork a private playbook the caller cannot access", async () => {
    accessRole.mockResolvedValue(null);
    serviceClient.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { id: "source-id", visibility: "private" }, error: null }),
          }),
        }),
      }),
    });

    const response = await POST(new Request("https://apbks.test/api/manage/playbooks/source-id/fork", {
      method: "POST",
      headers: { Authorization: "Bearer apb_live_key" },
    }));

    expect(response.status).toBe(404);
    expect(forkPlaybookMock).not.toHaveBeenCalled();
  });
});
