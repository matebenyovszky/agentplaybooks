import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findPlaybookSkill } from "@/lib/repositories/skills";

type Call = [string, ...unknown[]];

function fakeClient(row: { id: string } | null) {
  const calls: Call[] = [];
  const chain = {
    select: (...args: unknown[]) => { calls.push(["select", ...args]); return chain; },
    eq: (...args: unknown[]) => { calls.push(["eq", ...args]); return chain; },
    ilike: (...args: unknown[]) => { calls.push(["ilike", ...args]); return chain; },
    order: (...args: unknown[]) => { calls.push(["order", ...args]); return chain; },
    limit: (...args: unknown[]) => { calls.push(["limit", ...args]); return chain; },
    maybeSingle: async () => ({ data: row, error: null }),
  };
  const client = { from: (table: string) => { calls.push(["from", table]); return chain; } };
  return { client: client as unknown as SupabaseClient, calls };
}

describe("findPlaybookSkill", () => {
  it("queries the skills table of that playbook by id", async () => {
    const id = "11111111-2222-4333-8444-555555555555";
    const { client, calls } = fakeClient({ id });
    expect(await findPlaybookSkill(client, "pb-1", id)).toEqual({ id });
    // The MCP delete_skill tool used to narrow the outer playbooks query, so it
    // never touched the skills table at all.
    expect(calls[0]).toEqual(["from", "skills"]);
    expect(calls).toContainEqual(["eq", "playbook_id", "pb-1"]);
    expect(calls).toContainEqual(["eq", "id", id]);
  });

  it("resolves a name case-insensitively, newest first", async () => {
    const { client, calls } = fakeClient({ id: "s1" });
    await findPlaybookSkill(client, "pb-1", "Release-Notes");
    expect(calls).toContainEqual(["ilike", "name", "Release-Notes"]);
    expect(calls).toContainEqual(["order", "created_at", { ascending: false }]);
  });

  it("returns null when nothing matches", async () => {
    const { client } = fakeClient(null);
    expect(await findPlaybookSkill(client, "pb-1", "missing")).toBeNull();
  });
});
