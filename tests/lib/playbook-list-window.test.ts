import { beforeEach, expect, it, vi } from "vitest";
import { listAccessiblePlaybooks } from "@/lib/repositories/playbooks";
import { getServerServiceSupabase } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({ getServerServiceSupabase: vi.fn() }));

type Row = Record<string, unknown>;
const selectionLog: string[] = [];
const filtersLog: unknown[][] = [];
let tables: Record<string, Row[]>;
function database() {
  return { from(table: string) {
    let columns = "*";
    let window: [number, number] | undefined;
    const filters: Array<(row: Row) => boolean> = [];
    const orders: Array<[string, boolean]> = [];
    const query = {
      select(value: string) { columns = value; selectionLog.push(value); return query; },
      eq(key: string, value: unknown) { filters.push(row => row[key] === value); return query; },
      neq(key: string, value: unknown) { filters.push(row => row[key] !== value); return query; },
      in(key: string, values: unknown[]) { filters.push(row => values.includes(row[key])); return query; },
      not(key: string, op: string, value: unknown) { filters.push(row => row[key] !== value); return query; },
      ilike(key: string, pattern: string) {
        filtersLog.push([key, pattern]);
        const literal = pattern.slice(1, -1).replace(/\\(.)/g, "$1").toLowerCase();
        filters.push(row => String(row[key]).toLowerCase().includes(literal));
        return query;
      },
      order(key: string, { ascending }: { ascending: boolean }) { orders.push([key, ascending]); return query; },
      range(from: number, to: number) { window = [from, to]; return query; },
      then(resolve: (value: unknown) => unknown) {
        const data = tables[table].filter(row => filters.every(test => test(row))).sort((a, b) => {
          for (const [key, asc] of orders) {
            const delta = String(a[key]).localeCompare(String(b[key]));
            if (delta) return asc ? delta : -delta;
          }
          return 0;
        }).slice(window?.[0] ?? 0, window ? window[1] + 1 : undefined).map(row => {
          if (columns.trim().startsWith("*")) return row;
          const keys = columns.split(",").map(key => key.trim().split(":")[0]);
          return Object.fromEntries(Object.entries(row).filter(([key]) => keys.includes(key)));
        });
        return Promise.resolve({ data, error: null }).then(resolve);
      },
    };
    return query;
  } };
}
beforeEach(() => {
  selectionLog.length = 0;
  filtersLog.length = 0;
  const playbook = (id: string, user: string, time: string) => ({
    id, guid: id, name: `Robot ${id}`, user_id: user, updated_at: time,
    persona_name: "Robot", persona_system_prompt: "PRIVATE_PERSONA", instructions: "PRIVATE_INSTRUCTIONS",
    config: { private: "PRIVATE_CONFIG" }, skills: [{ count: 2 }], memories: [{ count: 3 }], mcp_servers: [{ count: 1 }],
  });
  tables = {
    playbooks: [playbook("a", "user", "2026-10-28"), playbook("b", "other", "2026-10-27"),
      playbook("c", "user", "2026-10-26"), playbook("d", "other", "2026-10-25"), playbook("hidden", "stranger", "2026-10-29")],
    playbook_collaborators: [
      { user_id: "user", playbook_id: "b", role: "editor", accepted_at: "yes" },
      { user_id: "user", playbook_id: "a", role: "editor", accepted_at: "yes" },
      { user_id: "user", playbook_id: "d", role: "auditor", accepted_at: "yes" },
      { user_id: "user", playbook_id: "hidden", role: "editor", accepted_at: null },
    ],
  };
  vi.mocked(getServerServiceSupabase).mockReturnValue(database() as never);
});

it("merges owned and accepted shared playbooks before paging, without duplicates or content", async () => {
  const first = await listAccessiblePlaybooks("user", { compact: true, limit: 2, offset: 0 });
  const second = await listAccessiblePlaybooks("user", { compact: true, limit: 2, offset: 2 });
  expect(first.map(row => row.id)).toEqual(["a", "b"]);
  expect(second.map(row => row.id)).toEqual(["c", "d"]);
  expect(first[0]).toMatchObject({ current_user_role: "owner", skill_count: 2 });
  expect(first[1].current_user_role).toBe("editor");
  expect(second[1].current_user_role).toBe("auditor");
  expect(second[1]).not.toHaveProperty("persona_name");
  expect(JSON.stringify([...first, ...second])).not.toContain("PRIVATE_");
  expect(selectionLog.every(columns => !columns.trim().startsWith("*"))).toBe(true);
});

it("treats query metacharacters literally and filters before the page window", async () => {
  tables.playbooks[2].name = "Robot 100%_done\\now";
  const result = await listAccessiblePlaybooks("user", { compact: true, query: "100%_done\\now", limit: 1, offset: 0 });
  expect(result.map(row => row.id)).toEqual(["c"]);
  expect(filtersLog).toContainEqual(["name", "%100\\%\\_done\\\\now%"]);
});

it("preserves full records for existing REST and backup callers that omit options", async () => {
  const result = await listAccessiblePlaybooks("user");
  expect(result).toHaveLength(4);
  expect(result[0].instructions).toBe("PRIVATE_INSTRUCTIONS");
  expect(result.find(row => row.id === "d")).not.toHaveProperty("instructions");
});

it("refuses invalid window options", async () => {
  await expect(listAccessiblePlaybooks("user", { compact: true, limit: 1000, offset: 0 })).rejects.toThrow("Invalid playbook list options");
  await expect(listAccessiblePlaybooks("user", { compact: true, limit: 10, offset: 1000 })).rejects.toThrow("Invalid playbook list options");
});

it("supports the last ordinary page and clamps it at the documented 1000-match boundary", async () => {
  tables.playbooks = Array.from({ length: 1005 }, (_, index) => ({
    id: `p${String(index).padStart(4, "0")}`, user_id: "user", name: "Robot",
    updated_at: "2026-10-28", skills: [], mcp_servers: [], memories: [],
  }));
  expect(await listAccessiblePlaybooks("user", { compact: true, limit: 50, offset: 950 })).toHaveLength(50);
  const last = await listAccessiblePlaybooks("user", { compact: true, limit: 50, offset: 999 });
  expect(last.map(row => row.id)).toEqual(["p0999"]);
});
