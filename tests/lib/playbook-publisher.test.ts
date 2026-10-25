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
    upsert: vi.fn().mockResolvedValue({ error: null }),
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

  it("creates a missing profile without overwriting existing publisher details", async () => {
    const { profileQuery, playbookQuery } = configureSupabase(null);
    profileQuery.maybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { id: USER_ID }, error: null });

    await createPlaybook(USER_ID, { name: "New playbook" });
    expect(profileQuery.upsert).toHaveBeenCalledWith(expect.objectContaining({
      id: USER_ID, auth_user_id: USER_ID, display_name: "User",
    }), { onConflict: "auth_user_id", ignoreDuplicates: true });
    expect(playbookQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      publisher_id: USER_ID,
    }));
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
