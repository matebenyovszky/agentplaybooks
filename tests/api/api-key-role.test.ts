import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/[[...route]]/route";

/**
 * Creating a playbook API key used to drop the requested role. The handler
 * destructured only name/permissions/expires_at, so the column fell back to its
 * default and anyone who picked "coworker" or "admin" in the dashboard got a
 * viewer — silently, with the UI then showing "Viewer" back at them.
 *
 * The role is what gates a key, so these tests pin that it is both persisted
 * and validated.
 */

vi.mock("@/app/api/_shared/auth", () => ({
  getAuthenticatedUser: vi.fn().mockResolvedValue({ id: "owner-1" }),
  validateApiKey: vi.fn().mockResolvedValue(null),
  validateUserApiKey: vi.fn().mockResolvedValue(null),
  canAccessPrivatePlaybook: vi.fn().mockResolvedValue(false),
  validatePlaybookCredential: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/app/api/_shared/guards", () => ({
  checkPlaybookOwnership: vi.fn().mockResolvedValue(true),
  checkPlaybookWriteAccess: vi.fn().mockResolvedValue(true),
  getPlaybookAccessRole: vi.fn().mockResolvedValue("owner"),
  getPlaybookByGuid: vi.fn(),
  resolvePlaybookId: vi.fn(async (id: string) => id),
}));

vi.mock("@/lib/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/utils")>()),
  generateApiKey: () => "apb_live_" + "a".repeat(40),
  hashApiKey: async () => "hashed",
  getKeyPrefix: () => "apb_live_aaaa",
}));

/** Captures what the handler tries to insert into api_keys. */
const inserted: Record<string, unknown>[] = [];

/**
 * The route file carries its own copy of checkPlaybookOwnership, so mocking
 * _shared/guards is not enough — the ownership lookup has to succeed against
 * this stub too. Every builder method chains; the terminals answer according to
 * which table was addressed.
 */
function serviceClient() {
  let table = "";
  const chain: Record<string, unknown> = {};
  const pass = () => chain;

  for (const method of ["select", "eq", "neq", "is", "not", "in", "order", "limit", "update", "delete"]) {
    chain[method] = vi.fn(pass);
  }
  chain.insert = vi.fn((values: Record<string, unknown>) => {
    if (table === "api_keys") inserted.push(values);
    return chain;
  });

  const result = async () => {
    if (table === "playbooks") {
      return { data: { id: "playbook-1", user_id: "owner-1" }, error: null };
    }
    return {
      data: { id: "key-1", key_prefix: "apb_live_aaaa", ...inserted.at(-1) },
      error: null,
    };
  };
  chain.single = vi.fn(result);
  chain.maybeSingle = vi.fn(result);

  return {
    from: vi.fn((name: string) => {
      table = name;
      return chain;
    }),
  };
}

vi.mock("@/app/api/_shared/supabase", () => ({
  getSupabase: vi.fn(() => serviceClient()),
  getServiceSupabase: vi.fn(() => serviceClient()),
}));

function createKeyRequest(body: unknown) {
  return new Request("http://localhost/api/playbooks/playbook-1/api-keys", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer session-token" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/playbooks/:id/api-keys — role handling", () => {
  beforeEach(() => {
    inserted.length = 0;
  });

  it("persists the requested coworker role", async () => {
    const res = await POST(createKeyRequest({ name: "Dev coworker", role: "coworker" }));

    expect(res.status).toBe(201);
    expect(inserted.at(-1)?.role).toBe("coworker");
    // The response has to carry it too, or the dashboard renders its fallback.
    await expect(res.json()).resolves.toMatchObject({ role: "coworker" });
  });

  it("persists the admin role", async () => {
    await POST(createKeyRequest({ role: "admin" }));
    expect(inserted.at(-1)?.role).toBe("admin");
  });

  it("defaults to viewer when no role is asked for", async () => {
    await POST(createKeyRequest({ name: "unspecified" }));
    expect(inserted.at(-1)?.role).toBe("viewer");
  });

  it("refuses an unknown role instead of quietly downgrading it", async () => {
    const res = await POST(createKeyRequest({ role: "superuser" }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringContaining("superuser"),
    });
    // Nothing was written.
    expect(inserted).toHaveLength(0);
  });
});
