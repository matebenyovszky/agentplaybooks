import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/app/api/_shared/auth", () => ({ getAuthenticatedUser: vi.fn(async () => null) }));
vi.mock("@/app/api/_shared/guards", () => ({ getPlaybookAccessRole: vi.fn(async () => null) }));
vi.mock("@/app/api/_shared/supabase", () => ({ getServiceSupabase: vi.fn() }));
const { getServiceSupabase } = await import("@/app/api/_shared/supabase");
const { GET } = await import("@/app/api/playbooks/[guid]/route");

const select = vi.fn();
let visibility = "public";
beforeEach(() => {
  vi.clearAllMocks();
  visibility = "public";
  vi.mocked(getServiceSupabase).mockReturnValue({
    from(table: string) {
      const playbook = { id: "pb", guid: "guid", name: "Test", visibility, persona_name: "Assistant", persona_system_prompt: "Help", persona_metadata: {}, created_at: "2026-01-01", config: {}, instructions: null };
      const rows = table === "skills" ? [{ id: "skill", name: "review", description: "Review code", content: "Review", skill_attachments: [{ id: "file", filename: "scripts/review.py", content: "pass" }] }] : [];
      const builder = {
        select(columns: string) { select(table, columns); return builder; },
        eq() { return builder; },
        single: async () => ({ data: playbook, error: null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
      };
      return builder;
    },
  } as unknown as ReturnType<typeof getServiceSupabase>);
});

describe("native playbook exports", () => {
  it("keeps JSON skill attachments while omitting their database payload for tool exports", async () => {
    const context = { params: Promise.resolve({ guid: "guid" }) };
    const json = await GET(new Request("https://example.com/api/playbooks/guid"), context);
    expect((await json.json()).skills[0].attachments[0].filename).toBe("scripts/review.py");
    expect(select).toHaveBeenCalledWith("skills", "*, skill_attachments(id, filename, content)");
    select.mockClear();
    for (const format of ["openapi", "mcp", "anthropic", "markdown"]) {
      const result = await GET(new Request(`https://example.com/api/playbooks/guid?format=${format}`), context);
      expect(result.status).toBe(200);
      expect(await result.text()).not.toContain("scripts/review.py");
    }
    expect(select.mock.calls.filter(call => call[0] === "skills").every(call => call[1] === "*")).toBe(true);
  });

  it("checks private visibility before fetching skill or server content", async () => {
    visibility = "private";
    const response = await GET(new Request("https://example.com/api/playbooks/guid"), { params: Promise.resolve({ guid: "guid" }) });
    expect(response.status).toBe(404);
    expect(select.mock.calls.every(call => call[0] === "playbooks")).toBe(true);
  });
});
