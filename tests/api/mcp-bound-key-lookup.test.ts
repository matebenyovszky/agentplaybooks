import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolvePrivatePlaybookActor, actorMayRead } from "@/app/api/_shared/auth";
import { getServiceSupabase, getSupabase } from "@/app/api/_shared/supabase";

vi.mock("@/app/api/_shared/supabase", () => ({ getServiceSupabase: vi.fn(), getSupabase: vi.fn() }));

let keyRow: Record<string, unknown> | null;
const calls: { table: string; operation: string; filters: [string, unknown][] }[] = [];
function database() {
  return { from(table: string) {
    const call = { table, operation: "select", filters: [] as [string, unknown][] };
    calls.push(call);
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn((name: string, value: unknown) => { call.filters.push([name, value]); return builder; }),
      update: vi.fn(() => { call.operation = "update"; return builder; }),
      maybeSingle: vi.fn(async () => ({ data: table === "api_keys" ? keyRow : null, error: null })),
      then(resolve: (result: unknown) => unknown) { return Promise.resolve({ data: null, error: null }).then(resolve); },
    };
    return builder;
  } };
}
const request = () => new Request("https://example.com/api/mcp/private", {
  headers: { Authorization: "Bearer apb_test_private_key" },
});

beforeEach(() => {
  calls.length = 0;
  keyRow = { id: "key-1", playbook_id: "playbook-1", role: "editor", permissions: ["skills:read"],
    key_prefix: "apb_test", last_used_at: new Date().toISOString(), expires_at: null };
  vi.mocked(getServiceSupabase).mockReturnValue(database() as never);
  vi.mocked(getSupabase).mockReturnValue({ auth: { getUser: vi.fn() } } as never);
});

describe("fresh MCP key lookup for an already resolved playbook", () => {
  it("avoids a duplicate playbook query and preserves scoped permissions", async () => {
    const actor = await resolvePrivatePlaybookActor(request(), "playbook-1");
    expect(actor).toEqual({ kind: "playbook_key", role: "editor", permissions: ["skills:read"], keyPrefix: "apb_test" });
    expect(actorMayRead(actor, "skills:read")).toBe(true);
    expect(actorMayRead(actor, "memory:read")).toBe(false);
    expect(calls.map(call => call.table)).toEqual(["api_keys"]);
    expect(calls[0].filters).toContainEqual(["is_active", true]);
  });
  it("checks the key again on the next request so revocation takes effect", async () => {
    expect(await resolvePrivatePlaybookActor(request(), "playbook-1")).not.toBeNull();
    keyRow = null;
    expect(await resolvePrivatePlaybookActor(request(), "playbook-1")).toBeNull();
    expect(calls.filter(call => call.table === "api_keys")).toHaveLength(2);
  });
  it("refuses expired and cross-playbook keys without recording their use", async () => {
    keyRow!.expires_at = "2000-01-01T00:00:00Z";
    expect(await resolvePrivatePlaybookActor(request(), "playbook-1")).toBeNull();
    keyRow!.expires_at = null;
    expect(await resolvePrivatePlaybookActor(request(), "other-playbook")).toBeNull();
    expect(calls.filter(call => call.operation === "update")).toHaveLength(0);
  });
  it("retains last-used updates for an accepted key", async () => {
    keyRow!.last_used_at = null;
    expect(await resolvePrivatePlaybookActor(request(), "playbook-1")).not.toBeNull();
    expect(calls.filter(call => call.operation === "update")).toEqual([
      { table: "api_keys", operation: "update", filters: [["id", "key-1"]] },
    ]);
  });
});
