import { beforeEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/mcp/[guid]/route";
import { getServiceSupabase, getSupabase } from "@/app/api/_shared/supabase";
import { skillReferenceWindow } from "@/lib/repositories/skill-context";

vi.mock("@/app/api/_shared/supabase", () => ({ getServiceSupabase: vi.fn(), getSupabase: vi.fn() }));
const own = "11111111-1111-4111-8111-111111111111";
const foreign = "22222222-2222-4222-8222-222222222222";
const body = "# Instructions\nUse references only when needed.";
const fileBody = "# Operations\n## Cron\nRun the scheduler.\n### Check\nCheck status.\n```md\n## Example heading\n```\n## Backups\nDo not load this section for cron.\n";
const privateBody = "PRIVATE_OTHER_PLAYBOOK_FILE";
const attachments = [
  { id: "a1", skill_id: own, filename: "references/operations.md", content: fileBody, size_bytes: fileBody.length },
  { id: "a2", skill_id: foreign, filename: "private.md", content: privateBody },
];
const rows: Record<string, Record<string, unknown>[]> = {
  playbooks: [{ id: "pb", guid: "lean-context", name: "Demo", visibility: "public" }],
  skills: [{ id: own, playbook_id: "pb", name: "operations", content: body, priority: 50 },
    { id: foreign, playbook_id: "private-pb", name: "foreign", content: privateBody }],
  skill_attachments: attachments,
};
function database() {
  return { from(table: string) {
    let selected = "*";
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    const data = () => (rows[table] || []).filter(row => filters.every(test => test(row))).map(row => {
      const base = selected.startsWith("*") ? row : Object.fromEntries(selected.split(", skill_attachments(")[0].split(",").map(key => key.trim()).map(key => [key, row[key]]));
      if (!selected.includes("skill_attachments(")) return base;
      return { ...base, skill_attachments: attachments.filter(file => file.skill_id === row.id).map(file => {
        if (selected.includes("skill_attachments(*)")) return file;
        return Object.fromEntries(Object.entries(file).filter(([key]) => key !== "content"));
      }) };
    });
    const query = {
      select: (columns: string) => { selected = columns; return query; },
      eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
      ilike: (key: string, value: string) => { filters.push(row => String(row[key]).toLowerCase() === value.toLowerCase()); return query; },
      order: () => query, limit: () => query,
      single: async () => ({ data: data()[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: data()[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: data(), error: null }).then(resolve),
    };
    return query;
  } };
}
beforeEach(() => {
  vi.mocked(getServiceSupabase).mockReturnValue(database() as never);
  vi.mocked(getSupabase).mockReturnValue(database() as never);
});
async function rpc(method: string, params: object) {
  return (await POST(new Request("http://localhost/api/mcp/lean-context", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  }))).json();
}
const call = (name: string, args: object) => rpc("tools/call", { name, arguments: args });

it("keeps discovery small and full-content exports explicit", async () => {
  const small = await call("list_skills", {});
  expect(small.result.structuredContent.skills[0].content).toBeUndefined();
  expect((await call("list_skills", { include_content: true })).result.structuredContent.skills[0].content).toBe(body);
  const skill = (await call("get_skill", { skill_id: own })).result.structuredContent;
  expect(skill.content).toBe(body);
  expect(skill.skill_attachments[0]).toMatchObject({ filename: "references/operations.md", size_bytes: fileBody.length });
  expect(JSON.stringify(skill)).not.toContain("Run the scheduler");
  const manifest = (await call("get_skill", { skill_id: own, include_content: false })).result.structuredContent;
  expect(manifest.content).toBeUndefined();
  expect(manifest.skill_attachments[0].filename).toBe("references/operations.md");
  expect((await call("get_skill", { skill_id: own, include_attachments: true })).result.structuredContent.skill_attachments[0].content).toBe(fileBody);
});

it("reads one bounded section and does not treat code-fence headings as boundaries", async () => {
  const result = (await call("get_skill_reference", { skill_id: own, filename: "references/operations.md", section: "Cron" })).result.structuredContent;
  expect(result.content).toContain("### Check");
  expect(result.content).toContain("## Example heading");
  expect(result.content).not.toContain("Do not load this section");
  expect(result.truncated).toBe(false);
  const text = "hello 🌍 continued";
  const first = skillReferenceWindow(text, { max_chars: 7 });
  const second = skillReferenceWindow(text, { offset: first.next_offset });
  expect(first.content + second.content).toBe(text);
  expect(() => skillReferenceWindow(text, { max_chars: 32001 })).toThrow("max_chars");
  expect(() => skillReferenceWindow(text, { section: "missing" })).toThrow("Section not found");
});

it("refuses another playbook's files through both tools and legacy resource URIs", async () => {
  const result = await call("get_skill_reference", { skill_id: foreign, filename: "private.md" });
  expect(result.error).toBeDefined();
  expect(JSON.stringify(result)).not.toContain(privateBody);
  const resource = await rpc("resources/read", { uri: `playbook://lean-context/skills/${foreign}/attachments/a2` });
  expect(resource.error).toBeDefined();
  expect(JSON.stringify(resource)).not.toContain(privateBody);
});
