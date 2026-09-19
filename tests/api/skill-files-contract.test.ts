/**
 * The seam between the two halves of skill-file support.
 *
 * The API embeds a skill's files in the playbook it returns; the CLI reads that
 * shape and writes a skill directory from it. Each half has its own tests, and
 * each half's tests define the shape for themselves — the CLI's against a fake
 * API, the route's against a fake database. Nothing until now checked that the
 * two agree, which is exactly where a rename or a dropped field would hide.
 *
 * So this drives the real route handler and hands its real response to the real
 * `planPull`. Only the database underneath is a stub.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { applyPull, planPull } from "../../packages/cli/src/remote.js";

vi.mock("@/app/api/_shared/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/api/_shared/auth")>()),
  getUserFromAuthOrApiKey: vi.fn(async () => ({ id: "user-1" })),
}));
vi.mock("@/app/api/_shared/guards", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/api/_shared/guards")>()),
  getPlaybookAccessRole: vi.fn(async () => "owner"),
}));
vi.mock("@/app/api/_shared/supabase", () => ({ getServiceSupabase: vi.fn() }));

const { getServiceSupabase } = await import("@/app/api/_shared/supabase");
const { GET } = await import("@/app/api/[[...route]]/route");

const PLAYBOOK = {
  id: "11111111-2222-4333-8444-555555555555",
  guid: "abc123",
  name: "Office playbook",
  persona_name: "Assistant",
  persona_system_prompt: "You are a helpful AI assistant.",
  persona_metadata: {},
  created_at: "2026-09-01T00:00:00Z",
  visibility: "private",
  config: {},
  instructions: null,
};

const SKILLS = [{
  id: "skill-1",
  playbook_id: PLAYBOOK.id,
  name: "office-live",
  description: "Drive the open Office document.",
  content: "---\nname: office-live\ndescription: Drive the open Office document.\n---\n\nImport scripts/office.py.\n",
  licence: "MIT",
  skill_attachments: [
    { id: "file-1", filename: "scripts/office.py", content: "def attach():\n    return 1\n" },
    { id: "file-2", filename: "references/api.md", content: "# API\n" },
    // Stored under a name no client may write to disk.
    { id: "file-3", filename: "../../escape.py", content: "nope\n" },
  ],
}];

/**
 * Enough of the query builder for the three tables this route touches. The
 * shape of what it returns is the point: embedded `skill_attachments`, exactly
 * as PostgREST delivers the `skills(*, skill_attachments(...))` select.
 */
function stubSupabase() {
  const rowsFor = (table: string) => {
    if (table === "playbooks") return [PLAYBOOK];
    if (table === "skills") return SKILLS;
    return [];
  };
  return {
    from: vi.fn((table: string) => {
      const builder: Record<string, unknown> = {};
      const result = { data: rowsFor(table), error: null };
      builder.select = vi.fn(() => builder);
      builder.eq = vi.fn(() => builder);
      builder.single = vi.fn(async () => ({ data: rowsFor(table)[0] ?? null, error: null }));
      builder.then = (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve);
      return builder;
    }),
  } as unknown as ReturnType<typeof getServiceSupabase>;
}

/**
 * Route the CLI's HTTP calls into the route handler, with no server between.
 * `handle(app)` takes the request alone and reads the path off its URL, so the
 * catch-all segment needs no separate params argument.
 */
const fetchImpl = async (url: string, init: RequestInit = {}) => GET(new Request(url, init));

beforeEach(() => {
  vi.mocked(getServiceSupabase).mockReturnValue(stubSupabase());
});

describe("a skill's files survive the trip from the API to a working tree", () => {
  it("plans and writes every bundled file the API returned", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "apb-contract-"));

    const plan = await planPull(root, PLAYBOOK.id, {
      url: "https://apbks.test",
      apiKey: "apb_live_test",
      fetchImpl,
    });

    expect(plan.actions.filter((action: { kind: string }) => action.kind === "skill-file")
      .map((action: { path: string }) => action.path).sort()).toEqual([
      ".agents/skills/office-live/references/api.md",
      ".agents/skills/office-live/scripts/office.py",
    ]);

    await applyPull(root, plan);
    expect(await readFile(path.join(root, ".agents/skills/office-live/scripts/office.py"), "utf8"))
      .toBe("def attach():\n    return 1\n");
  });

  it("never offers a client a file name it could not safely write", async () => {
    const response = await fetchImpl(`https://apbks.test/api/manage/playbooks/${PLAYBOOK.id}`, {
      headers: { Authorization: "Bearer apb_live_test" },
    });
    const body = await response.json() as { skills: Array<{ attachments: Array<{ filename: string }> }> };

    expect(body.skills[0].attachments.map((file) => file.filename)).toEqual([
      "scripts/office.py",
      "references/api.md",
    ]);
    // The id has to come back too, or a push can only ever create a file and
    // never update the one that is already there.
    expect(body.skills[0].attachments.every((file) => "id" in file)).toBe(true);
  });
});
