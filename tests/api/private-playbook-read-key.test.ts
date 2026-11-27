/**
 * GET /api/playbooks/:guid served a private playbook only to a browser
 * session, so an agent could sync a playbook only after it was shared by link
 * (unlisted). On an instance that keeps every playbook private, that made the
 * sync impossible. A key that the MCP endpoint already lets read the same data
 * is now accepted here too.
 *
 * These pin who gets the payload, who does not, and that a private payload is
 * never cached.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/api/_shared/auth", async () => {
  const actual = await vi.importActual<typeof import("@/app/api/_shared/auth")>("@/app/api/_shared/auth");
  return {
    getAuthenticatedUser: vi.fn(async () => null),
    resolvePrivatePlaybookActor: vi.fn(async () => null),
    actorMayRead: actual.actorMayRead,
  };
});
vi.mock("@/app/api/_shared/guards", () => ({ getPlaybookAccessRole: vi.fn(async () => null) }));
vi.mock("@/app/api/_shared/supabase", () => ({ getServiceSupabase: vi.fn() }));

const { getAuthenticatedUser, resolvePrivatePlaybookActor } = await import("@/app/api/_shared/auth");
const { getPlaybookAccessRole } = await import("@/app/api/_shared/guards");
const { getServiceSupabase } = await import("@/app/api/_shared/supabase");
const { GET } = await import("@/app/api/playbooks/[guid]/route");

let visibility = "private";
let visibilityFilter: string[] | undefined;
const tables: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  visibility = "private";
  visibilityFilter = undefined;
  tables.length = 0;
  vi.mocked(getAuthenticatedUser).mockResolvedValue(null);
  vi.mocked(resolvePrivatePlaybookActor).mockResolvedValue(null);
  vi.mocked(getPlaybookAccessRole).mockResolvedValue(null);
  vi.mocked(getServiceSupabase).mockReturnValue({
    from(table: string) {
      tables.push(table);
      const playbook = {
        id: "pb", guid: "guid", name: "Research bot", visibility, user_id: "owner",
        persona_name: "Assistant", persona_system_prompt: "Help", persona_metadata: {},
        created_at: "2026-01-01", config: { hermes: { profile_name: "research" } }, instructions: null,
      };
      const rows = table === "skills"
        ? [{ id: "skill", name: "review", description: "Review", content: "Review", skill_attachments: [{ id: "file", filename: "references/guide.md", content: "# Guide" }] }]
        : [];
      const builder = {
        select() { return builder; },
        eq() { return builder; },
        in(column: string, values: string[]) {
          if (column === "visibility") visibilityFilter = values;
          return builder;
        },
        single: async () => ({
          data: visibilityFilter && !visibilityFilter.includes(playbook.visibility) ? null : playbook,
          error: null,
        }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
      };
      return builder;
    },
  } as unknown as ReturnType<typeof getServiceSupabase>);
});

const context = { params: Promise.resolve({ guid: "guid" }) };
const withKey = (key = "apb_live_reader") => new Request("https://example.com/api/playbooks/guid?format=json", {
  headers: { Authorization: `Bearer ${key}` },
});
const playbookKey = (permissions: string[], role = "viewer") =>
  ({ kind: "playbook_key", role, permissions, keyPrefix: "apb_live_rea" }) as const;

describe("GET /api/playbooks/:guid on a private playbook", () => {
  it("serves the whole playbook to a key of this playbook that can read every part", async () => {
    vi.mocked(resolvePrivatePlaybookActor).mockResolvedValue(
      playbookKey(["playbooks:read", "personas:read", "skills:read"]),
    );

    const response = await GET(withKey(), context);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.config.hermes.profile_name).toBe("research");
    expect(body.skills[0].attachments[0].filename).toBe("references/guide.md");
    expect(body.current_user_role).toBe("viewer");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(resolvePrivatePlaybookActor).toHaveBeenCalledWith(expect.any(Request), "pb");
  });

  it("serves an admin key of this playbook", async () => {
    vi.mocked(resolvePrivatePlaybookActor).mockResolvedValue(playbookKey([], "admin"));

    const response = await GET(withKey(), context);

    expect(response.status).toBe(200);
  });

  it.each([
    ["skills only", ["skills:read"]],
    ["no skills", ["playbooks:read", "personas:read"]],
    ["write a proposal only", ["memory:propose"]],
  ])("refuses a key of this playbook that can read %s", async (_label, permissions) => {
    vi.mocked(resolvePrivatePlaybookActor).mockResolvedValue(playbookKey(permissions));

    const response = await GET(withKey(), context);

    expect(response.status).toBe(404);
    expect(tables).not.toContain("skills");
  });

  it("refuses an auditor key", async () => {
    vi.mocked(resolvePrivatePlaybookActor).mockResolvedValue(playbookKey(["full"], "auditor"));

    const response = await GET(withKey(), context);

    expect(response.status).toBe(404);
    expect(tables).not.toContain("skills");
  });

  it("refuses a key that does not belong to this playbook or its collaborators", async () => {
    const response = await GET(withKey("apb_live_other"), context);

    expect(response.status).toBe(404);
    expect(tables).not.toContain("skills");
  });

  it("serves a collaborator's user key with the collaborator's role", async () => {
    vi.mocked(resolvePrivatePlaybookActor).mockResolvedValue({ kind: "member", role: "editor" });

    const response = await GET(withKey(), context);

    expect(response.status).toBe(200);
    expect((await response.json()).current_user_role).toBe("editor");
  });

  it("gives an auditor's user key the auditor view only", async () => {
    vi.mocked(resolvePrivatePlaybookActor).mockResolvedValue({ kind: "member", role: "auditor" });

    const response = await GET(withKey(), context);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.current_user_role).toBe("auditor");
    expect(body.skills).toBeUndefined();
    expect(tables).not.toContain("skills");
  });

  it("still filters by visibility before loading the row when no credential is sent", async () => {
    const response = await GET(new Request("https://example.com/api/playbooks/guid"), context);

    expect(response.status).toBe(404);
    expect(visibilityFilter).toEqual(["public", "unlisted"]);
    expect(resolvePrivatePlaybookActor).not.toHaveBeenCalled();
  });
});

describe("GET /api/playbooks/:guid on a shared playbook", () => {
  it.each(["public", "unlisted"])("serves a %s playbook to a key without resolving it", async (shared) => {
    visibility = shared;

    const response = await GET(withKey(), context);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBeNull();
    expect(resolvePrivatePlaybookActor).not.toHaveBeenCalled();
  });
});
