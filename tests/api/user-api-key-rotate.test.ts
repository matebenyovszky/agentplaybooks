import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/api/_shared/auth", () => ({
  getAuthenticatedUser: vi.fn().mockResolvedValue({ id: "user-1" }),
  validateApiKey: vi.fn().mockResolvedValue(null),
  validateUserApiKey: vi.fn().mockResolvedValue(null),
  canAccessPrivatePlaybook: vi.fn().mockResolvedValue(false),
  validatePlaybookCredential: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/utils")>()),
  generateApiKey: () => "apb_live_" + "b".repeat(40),
  hashApiKey: async () => "new-hash",
  getKeyPrefix: () => "apb_live_bbbb",
}));

const updates: Record<string, unknown>[] = [];

vi.mock("@/app/api/_shared/supabase", () => ({
  getSupabase: vi.fn(),
  getServiceSupabase: vi.fn(() => {
    let table = "";
    const chain: Record<string, unknown> = {};
    const pass = () => chain;
    for (const method of ["select", "eq", "order", "limit"]) chain[method] = vi.fn(pass);
    chain.update = vi.fn((values: Record<string, unknown>) => {
      updates.push(values);
      return chain;
    });
    chain.single = vi.fn(async () => table === "user_api_keys"
      ? { data: { id: "key-1", key_prefix: "apb_live_bbbb", name: "Hermes", permissions: ["full"], expires_at: null, is_active: true, created_at: "2026-01-01T00:00:00Z" }, error: null }
      : { data: null, error: null });
    chain.maybeSingle = chain.single;
    return { from: vi.fn((name: string) => { table = name; return chain; }) };
  }),
}));

import { PUT } from "@/app/api/[[...route]]/route";

describe("PUT /api/user/api-keys/:kid/rotate", () => {
  it("replaces the stored hash and returns the new value once", async () => {
    const response = await PUT(new Request("http://localhost/api/user/api-keys/key-1/rotate", {
      method: "PUT",
      headers: { Authorization: "Bearer session-token" },
    }));

    expect(response.status).toBe(200);
    expect(updates).toEqual([{ key_hash: "new-hash", key_prefix: "apb_live_bbbb" }]);
    await expect(response.json()).resolves.toMatchObject({
      key: "apb_live_" + "b".repeat(40),
      key_prefix: "apb_live_bbbb",
    });
  });
});
