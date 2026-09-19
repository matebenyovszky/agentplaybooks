import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as siteGet } from "@/app/.well-known/skills/[[...path]]/route";
import { GET as playbookGet } from "@/app/playbooks/[guid]/.well-known/skills/[[...path]]/route";
import { createServerClient } from "@/lib/supabase/client";

/**
 * `/.well-known/skills/` is a publishing endpoint: it is reachable without any
 * credential, by design, so the tests pin the two things that would be quietly
 * catastrophic to change — that only `public` playbooks are readable, and that
 * the path cannot be talked into serving a file the skill does not bundle.
 */

vi.mock("@/lib/supabase/client", () => ({ createServerClient: vi.fn() }));

const skills = [
  {
    name: "release",
    description: "Prepare a release.",
    content: "---\nname: release\ndescription: Prepare a release.\nversion: 2\n---\nUse the checklist.\n",
    licence: "MIT",
    created_at: "2026-02-01T00:00:00Z",
    skill_attachments: [
      { filename: "references/CHECKLIST.md", content: "1. Tag it.\n" },
      { filename: "scripts/release.py", content: "def tag():\n    pass\n" },
      // Stored under a name the serving rules reject: it must not reach a
      // client, which would go on to write it to disk.
      { filename: "../../escape.py", content: "nope\n" },
    ],
    playbook: { guid: "team-guid", visibility: "public" },
  },
  {
    name: "triage",
    description: "Triage incoming bugs.",
    content: "Steps.\n",
    licence: null,
    created_at: "2026-01-01T00:00:00Z",
    skill_attachments: [],
    playbook: { guid: "other-guid", visibility: "public" },
  },
];

type Filter = { column: string; value: unknown };

function stubClient(rows: unknown[], capture?: { filters: Filter[]; select?: string }) {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn((columns: string) => {
    if (capture) capture.select = columns;
    return builder;
  });
  builder.eq = vi.fn((column: string, value: unknown) => {
    capture?.filters.push({ column, value });
    return builder;
  });
  builder.order = vi.fn(() => builder);
  builder.limit = vi.fn(() => Promise.resolve({ data: rows, error: null }));
  return { from: vi.fn(() => builder) };
}

function params(path?: string[], guid?: string) {
  return { params: Promise.resolve({ ...(guid ? { guid } : {}), path }) } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://db.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
});

describe("GET /.well-known/skills", () => {
  it("publishes an index of public skills with their bundled files", async () => {
    const capture = { filters: [] as Filter[] };
    vi.mocked(createServerClient).mockReturnValue(
      stubClient(skills, capture) as unknown as ReturnType<typeof createServerClient>,
    );

    const res = await siteGet(new Request("https://apbks.test/.well-known/skills/index.json"), params(["index.json"]));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(body.skills).toEqual([
      // The unsafe stored name is absent: the index lists only what can be served.
      { name: "release", description: "Prepare a release.", files: ["SKILL.md", "references/CHECKLIST.md", "scripts/release.py"] },
      { name: "triage", description: "Triage incoming bugs.", files: ["SKILL.md"] },
    ]);
    // The visibility filter is the whole access-control story on this path.
    expect(capture.filters).toEqual([{ column: "playbook.visibility", value: "public" }]);
  });

  it("reads through the anon key, never the service-role key", async () => {
    vi.mocked(createServerClient).mockReturnValue(
      stubClient(skills) as unknown as ReturnType<typeof createServerClient>,
    );

    await siteGet(new Request("https://apbks.test/.well-known/skills/index.json"), params(["index.json"]));

    expect(createServerClient).toHaveBeenCalledWith("https://db.test", "anon-key");
  });

  it("serves SKILL.md as markdown, keeping fields outside the spec", async () => {
    vi.mocked(createServerClient).mockReturnValue(
      stubClient(skills) as unknown as ReturnType<typeof createServerClient>,
    );

    const res = await siteGet(new Request("https://apbks.test/.well-known/skills/release/SKILL.md"), params(["release", "SKILL.md"]));
    const body = await res.text();

    expect(res.headers.get("Content-Type")).toContain("text/markdown");
    expect(body).toContain("name: release");
    expect(body).toContain("version: 2");
    expect(body).toContain("Use the checklist.");
  });

  it("serves a bundled reference file", async () => {
    vi.mocked(createServerClient).mockReturnValue(
      stubClient(skills) as unknown as ReturnType<typeof createServerClient>,
    );

    const res = await siteGet(
      new Request("https://apbks.test/.well-known/skills/release/references/CHECKLIST.md"),
      params(["release", "references", "CHECKLIST.md"]),
    );

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("1. Tag it.\n");
  });

  it("serves a bundled script as text, which is what a skill's instructions import", async () => {
    vi.mocked(createServerClient).mockReturnValue(
      stubClient(skills) as unknown as ReturnType<typeof createServerClient>,
    );

    const res = await siteGet(
      new Request("https://apbks.test/.well-known/skills/release/scripts/release.py"),
      params(["release", "scripts", "release.py"]),
    );

    // This is the whole point of a file under `scripts/`: a SKILL.md that tells
    // the agent to import a module is useless if fetching it 404s.
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/x-python");
    expect(await res.text()).toBe("def tag():\n    pass\n");
  });

  it("refuses traversal and files the skill does not bundle", async () => {
    vi.mocked(createServerClient).mockReturnValue(
      stubClient(skills) as unknown as ReturnType<typeof createServerClient>,
    );

    const traversal = await siteGet(
      new Request("https://apbks.test/.well-known/skills/release/../../secret"),
      params(["release", "..", "..", "secret"]),
    );
    const missing = await siteGet(
      new Request("https://apbks.test/.well-known/skills/release/scripts/nope.py"),
      params(["release", "scripts", "nope.py"]),
    );

    expect(traversal.status).toBe(404);
    expect(missing.status).toBe(404);
  });

  it("serves one skill per name, newest first", async () => {
    const duplicated = [
      { ...skills[0], description: "Newest.", created_at: "2026-03-01T00:00:00Z" },
      { ...skills[0], description: "Older.", created_at: "2026-01-01T00:00:00Z" },
    ];
    vi.mocked(createServerClient).mockReturnValue(
      stubClient(duplicated) as unknown as ReturnType<typeof createServerClient>,
    );

    const res = await siteGet(new Request("https://apbks.test/.well-known/skills/index.json"), params(["index.json"]));
    const body = await res.json();

    // A name is a directory name: publishing it twice would break every client.
    expect(body.skills).toHaveLength(1);
    expect(body.skills[0].description).toBe("Newest.");
  });
});

describe("GET /playbooks/:guid/.well-known/skills", () => {
  it("restricts the index to that playbook", async () => {
    const capture = { filters: [] as Filter[] };
    vi.mocked(createServerClient).mockReturnValue(
      stubClient([skills[0]], capture) as unknown as ReturnType<typeof createServerClient>,
    );

    const res = await playbookGet(
      new Request("https://apbks.test/playbooks/team-guid/.well-known/skills/index.json"),
      params(["index.json"], "team-guid"),
    );
    const body = await res.json();

    expect(body.skills.map((skill: { name: string }) => skill.name)).toEqual(["release"]);
    expect(capture.filters).toEqual([
      { column: "playbook.visibility", value: "public" },
      { column: "playbook.guid", value: "team-guid" },
    ]);
  });
});
