import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/lib/supabase/server", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient("https://list.test.supabase.co", "test-service", {
    auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: mocks.fetch },
  });
  return { getServerServiceSupabase: () => client };
});
const { listAccessiblePlaybooks } = await import("@/lib/repositories/playbooks");
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
beforeEach(() => vi.clearAllMocks());
describe("dashboard playbook list", () => {
  it("starts independent reads together, preserves shared roles/counts, and omits heavy content", async () => {
    let releaseOwned!: () => void;
    const membershipStarted = new Promise<void>(resolve => { releaseOwned = resolve; });
    const selections: string[] = [];
    mocks.fetch.mockImplementation(async (input: string) => {
      const url = new URL(input);
      if (url.pathname.endsWith("playbook_collaborators")) {
        releaseOwned();
        return json([{ playbook_id: "shared", role: "auditor" }]);
      }
      const select = url.searchParams.get("select")!;
      selections.push(select);
      await membershipStarted;
      const id = url.searchParams.has("user_id") ? "owned" : "shared";
      return json([{ id, guid: id, name: id, user_id: id === "owned" ? "user" : "someone-else", visibility: "private", updated_at: "2026-10-28", skills: [{ count: 2 }], memories: [{ count: 3 }], mcp_servers: [{ count: 1 }] }]);
    });
    const rows = await listAccessiblePlaybooks("user", true);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: "owned", current_user_role: "owner", skill_count: 2, memory_count: 3 });
    expect(rows[1]).toMatchObject({ id: "shared", current_user_role: "auditor", mcp_server_count: 1 });
    expect(selections).toHaveLength(2);
    for (const select of selections) {
      expect(select).not.toMatch(/\*|config|instructions|persona_system_prompt/);
      expect(select).toContain("memories(count)");
    }
  });
  it("keeps full content for existing API/CLI callers when collaboration is not installed", async () => {
    mocks.fetch.mockImplementation(async (input: string) => {
      const url = new URL(input);
      if (url.pathname.endsWith("playbook_collaborators")) return json({ code: "PGRST205", message: "missing table" }, 404);
      expect(url.searchParams.get("select")).toContain("*");
      return json([{ id: "owned", updated_at: "2026-10-28", instructions: "Existing CLI contract", config: { important: true } }]);
    });
    expect((await listAccessiblePlaybooks("user"))[0]).toMatchObject({ instructions: "Existing CLI contract", config: { important: true } });
  });
});
