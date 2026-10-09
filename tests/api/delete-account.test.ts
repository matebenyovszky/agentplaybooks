import { beforeEach, describe, expect, it, vi } from "vitest";

// Account deletion is irreversible, so the route's job is mostly refusing:
// no session, no deletion; wrong confirmation, no deletion. Only a matching
// typed email reaches the database function.

const auth = vi.hoisted(() => ({ user: { id: "user-1" } as { id: string } | null }));
const calls = vi.hoisted(() => ({
  rpc: [] as Array<{ name: string; args: unknown }>,
  rpcResult: { data: { playbooks_deleted: 3 } as unknown, error: null as null | { message: string } },
  email: "Owner@Example.invalid" as string | null,
}));

vi.mock("@/app/api/_shared/auth", () => ({
  getAuthenticatedUser: vi.fn(async () => auth.user),
  getUserFromAuthOrApiKey: vi.fn().mockResolvedValue(null),
  validateApiKey: vi.fn().mockResolvedValue(null),
  validateUserApiKey: vi.fn().mockResolvedValue(null),
  canAccessPrivatePlaybook: vi.fn().mockResolvedValue(false),
  validatePlaybookCredential: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/app/api/_shared/supabase", () => ({
  getSupabase: vi.fn(),
  getServiceSupabase: vi.fn(() => ({
    auth: {
      admin: {
        getUserById: vi.fn(async (id: string) => ({
          data: { user: calls.email === null ? null : { id, email: calls.email } },
          error: null,
        })),
      },
    },
    rpc: vi.fn(async (name: string, args: unknown) => {
      calls.rpc.push({ name, args });
      return calls.rpcResult;
    }),
    from: vi.fn(() => {
      throw new Error("account deletion must go through the delete_account function, not table writes");
    }),
  })),
}));

import { DELETE } from "@/app/api/[[...route]]/route";

function request(body?: unknown) {
  return new Request("http://localhost/api/user/account", {
    method: "DELETE",
    headers: { Authorization: "Bearer session-token", "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("DELETE /api/user/account", () => {
  beforeEach(() => {
    auth.user = { id: "user-1" };
    calls.rpc.length = 0;
    calls.rpcResult = { data: { playbooks_deleted: 3 }, error: null };
    calls.email = "Owner@Example.invalid";
  });

  it("refuses without a browser session, which is also what an API key amounts to here", async () => {
    auth.user = null;
    const response = await DELETE(request({ confirm_email: "owner@example.invalid" }));
    expect(response.status).toBe(401);
    expect(calls.rpc).toEqual([]);
  });

  it("refuses when the typed email does not match, and says nothing was deleted", async () => {
    const response = await DELETE(request({ confirm_email: "someone-else@example.invalid" }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringMatching(/Nothing was deleted/) });
    expect(calls.rpc).toEqual([]);
  });

  it("refuses an empty or missing confirmation", async () => {
    expect((await DELETE(request())).status).toBe(400);
    expect((await DELETE(request({ confirm_email: "" }))).status).toBe(400);
    expect(calls.rpc).toEqual([]);
  });

  it("deletes through the database function when the email matches, ignoring case and spaces", async () => {
    const response = await DELETE(request({ confirm_email: "  owner@EXAMPLE.invalid " }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ deleted: true, playbooks_deleted: 3 });
    expect(calls.rpc).toEqual([{ name: "delete_account", args: { p_user_id: "user-1" } }]);
  });

  it("reports a failed deletion as one that removed nothing", async () => {
    calls.rpcResult = { data: null, error: { message: "boom" } };
    const response = await DELETE(request({ confirm_email: "owner@example.invalid" }));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringMatching(/nothing was removed/) });
  });

  it("does not delete an account whose auth record has no email to confirm against", async () => {
    calls.email = null;
    const response = await DELETE(request({ confirm_email: "" }));
    expect(response.status).toBe(404);
    expect(calls.rpc).toEqual([]);
  });
});
