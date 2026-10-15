import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createServerClientMock } = vi.hoisted(() => ({
  createServerClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  getServerServiceSupabase: createServerClientMock,
}));

const { createPlaybook } = await import("@/lib/repositories/playbooks");

const USER_ID = "auth-user-id";
const PROFILE_ID = "publisher-profile-id";

function configureSupabase(profile: { id: string } | null) {
  const profileQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: profile, error: null }),
  };
  profileQuery.select.mockReturnValue(profileQuery);
  profileQuery.eq.mockReturnValue(profileQuery);

  const playbookQuery = {
    insert: vi.fn(),
    select: vi.fn(),
    single: vi.fn().mockResolvedValue({
      data: { id: "playbook-id", user_id: USER_ID, publisher_id: PROFILE_ID },
      error: null,
    }),
  };
  playbookQuery.insert.mockReturnValue(playbookQuery);
  playbookQuery.select.mockReturnValue(playbookQuery);

  createServerClientMock.mockReturnValue({
    from: vi.fn((table: string) => table === "profiles" ? profileQuery : playbookQuery),
  });

  return { profileQuery, playbookQuery };
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
  createServerClientMock.mockReset();
});

afterEach(() => vi.unstubAllEnvs());

describe("createPlaybook publisher association", () => {
  it("stores the profile ID as publisher_id while keeping the Auth ID as user_id", async () => {
    const { profileQuery, playbookQuery } = configureSupabase({ id: PROFILE_ID });

    await createPlaybook(USER_ID, { name: "New playbook" });

    expect(profileQuery.eq).toHaveBeenCalledWith("auth_user_id", USER_ID);
    expect(playbookQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: USER_ID,
      publisher_id: PROFILE_ID,
    }));
  });

  it("refuses to create a playbook when the user's publisher profile is missing", async () => {
    const { playbookQuery } = configureSupabase(null);

    await expect(createPlaybook(USER_ID, { name: "New playbook" }))
      .rejects.toThrow("Publisher profile not found for authenticated user.");
    expect(playbookQuery.insert).not.toHaveBeenCalled();
  });

  it("keeps the source publisher on a fork while assigning ownership to the new user", async () => {
    const { profileQuery, playbookQuery } = configureSupabase(null);

    await createPlaybook("forking-user-id", { name: "Source (Copy)" }, {
      publisherId: "source-publisher-profile-id",
    });

    expect(profileQuery.maybeSingle).not.toHaveBeenCalled();
    expect(playbookQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: "forking-user-id",
      publisher_id: "source-publisher-profile-id",
    }));
  });
});
