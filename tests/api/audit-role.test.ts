import { beforeEach, describe, expect, it, vi } from "vitest";
import { app as secretsApp } from "@/app/api/playbooks/[guid]/secrets/app";
import { PUT as putPlaybook } from "@/app/api/playbooks/[guid]/route";
import { getAuthenticatedUser, validateApiKey } from "@/app/api/_shared/auth";
import { getPlaybookAccessRole, getPlaybookByGuid } from "@/app/api/_shared/guards";
import { getServiceSupabase } from "@/app/api/_shared/supabase";

vi.mock("@/app/api/_shared/auth", () => ({
  getAuthenticatedUser: vi.fn(),
  validateApiKey: vi.fn(),
}));

vi.mock("@/app/api/_shared/guards", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/api/_shared/guards")>();
  return {
    ...actual,
    getPlaybookAccessRole: vi.fn(),
    getPlaybookByGuid: vi.fn(),
    checkPlaybookOwnership: vi.fn(),
  };
});

vi.mock("@/app/api/_shared/supabase", () => ({
  getServiceSupabase: vi.fn(),
}));

describe("auditor role denials", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(validateApiKey).mockResolvedValue(null);
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: "auditor-1" });
    vi.mocked(getPlaybookAccessRole).mockResolvedValue("auditor");
  });

  it("cannot mutate playbook content", async () => {
    vi.mocked(getServiceSupabase).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: "playbook-1", user_id: "owner-1" }, error: null }),
      }),
    } as never);

    const res = await putPlaybook(
      new Request("http://localhost/api/playbooks/guid-1", {
        method: "PUT",
        headers: { Authorization: "Bearer session", "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Hijacked" }),
      }),
      { params: Promise.resolve({ guid: "guid-1" }) },
    );
    expect(res.status).toBe(403);
  });

  it("cannot reveal secret values even if the playbook lookup succeeded", async () => {
    vi.mocked(getPlaybookByGuid).mockResolvedValue({
      id: "playbook-1",
      user_id: "owner-1",
      visibility: "private",
      guid: "guid-1",
    } as never);
    vi.mocked(getServiceSupabase).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "audit_logs") {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: "audit-1" }, error: null }),
              }),
            }),
          };
        }
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn() };
      }),
    } as never);

    const res = await secretsApp.request("/api/playbooks/guid-1/secrets/reveal/OPENAI_API_KEY", {
      headers: { Authorization: "Bearer session" },
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("decrypted");
  });
});
