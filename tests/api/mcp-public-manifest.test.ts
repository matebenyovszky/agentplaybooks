import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/mcp/[guid]/route";
import { getSupabase, getServiceSupabase } from "@/app/api/_shared/supabase";
import { canAccessPrivatePlaybook, validatePlaybookCredential } from "@/app/api/_shared/auth";

/**
 * The public MCP manifest is the endpoint every MCP client hits first, and it
 * is deliberately reachable without credentials for a `public` playbook. It
 * reaches the database through the *anon* Supabase client, which means it also
 * depends on the anon SELECT policies in
 * `supabase/migrations/20260107_permissions_refactor.sql`.
 *
 * That makes it easy to break in two ways that nothing else would catch:
 *  - "tidying up" the route to use the service-role client, silently dropping
 *    the row-level safety net behind the visibility filter; or
 *  - removing the anon policies as apparently-dead code.
 *
 * These tests pin the first. The second is a database-level concern that a
 * mocked unit test cannot observe — it needs an integration test against a real
 * Postgres, which this suite does not yet have.
 */

vi.mock("@/app/api/_shared/supabase", () => ({
  getSupabase: vi.fn(),
  getServiceSupabase: vi.fn(),
}));

vi.mock("@/app/api/_shared/auth", () => ({
  canAccessPrivatePlaybook: vi.fn(),
  validatePlaybookCredential: vi.fn(),
}));

vi.mock("@/lib/mcp/federation", () => ({
  federatedTools: vi.fn().mockResolvedValue([]),
  federatedResources: vi.fn().mockResolvedValue([]),
  callFederatedTool: vi.fn(),
  readFederatedResource: vi.fn(),
}));

vi.mock("@/lib/mcp/secrets", () => ({
  decryptMcpSecrets: vi.fn().mockResolvedValue({}),
}));

const publicPlaybook = {
  id: "playbook-1",
  guid: "public-guid",
  user_id: "owner-1",
  name: "Public Playbook",
  description: "Shared with everyone",
  visibility: "public",
  config: {},
  persona_name: "Helper",
  persona_system_prompt: "You are helpful.",
  persona_metadata: null,
  star_count: 0,
  tags: [],
  publisher_id: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

/** Minimal chainable Supabase stub that records the columns requested. */
function stubClient(playbook: unknown, capture?: { select?: string }) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;

  builder.select = vi.fn((columns: string) => {
    if (capture) capture.select = columns;
    return builder;
  });
  builder.eq = vi.fn(chain);
  builder.in = vi.fn(chain);
  builder.order = vi.fn(chain);
  builder.limit = vi.fn(chain);
  builder.single = vi.fn().mockResolvedValue({ data: playbook, error: null });
  builder.maybeSingle = vi.fn().mockResolvedValue({ data: playbook, error: null });
  builder.then = undefined;

  return { from: vi.fn(() => builder) };
}

describe("GET /api/mcp/:guid — public manifest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(canAccessPrivatePlaybook).mockResolvedValue(false);
    vi.mocked(validatePlaybookCredential).mockResolvedValue(null);
  });

  it("serves a public playbook to an unauthenticated caller", async () => {
    vi.mocked(getSupabase).mockReturnValue(
      stubClient(publicPlaybook) as unknown as ReturnType<typeof getSupabase>,
    );
    vi.mocked(getServiceSupabase).mockReturnValue(
      stubClient([]) as unknown as ReturnType<typeof getServiceSupabase>,
    );

    const res = await GET(new Request("http://localhost/api/mcp/public-guid"));

    expect(res.status).toBe(200);
    // No credential was presented, so the anon path must have served this.
    expect(canAccessPrivatePlaybook).not.toHaveBeenCalled();
  });

  it("reads the playbook through the anon client, not the service-role client", async () => {
    const anon = stubClient(publicPlaybook);
    vi.mocked(getSupabase).mockReturnValue(anon as unknown as ReturnType<typeof getSupabase>);
    vi.mocked(getServiceSupabase).mockReturnValue(
      stubClient([]) as unknown as ReturnType<typeof getServiceSupabase>,
    );

    await GET(new Request("http://localhost/api/mcp/public-guid"));

    expect(anon.from).toHaveBeenCalledWith("playbooks");
  });

  it("requests an explicit column list rather than '*'", async () => {
    const capture: { select?: string } = {};
    vi.mocked(getSupabase).mockReturnValue(
      stubClient(publicPlaybook, capture) as unknown as ReturnType<typeof getSupabase>,
    );
    vi.mocked(getServiceSupabase).mockReturnValue(
      stubClient([]) as unknown as ReturnType<typeof getServiceSupabase>,
    );

    await GET(new Request("http://localhost/api/mcp/public-guid"));

    expect(capture.select).toBeDefined();
    expect(capture.select).not.toBe("*");
    expect(capture.select).toContain("persona_system_prompt");
    // Project instructions are documentation, not a secret, and MCP clients
    // need them — so the explicit projection has to publish them.
    expect(capture.select).toContain("instructions");
  });

  it("leaves the persona prompt untouched when the playbook has no instructions", async () => {
    vi.mocked(getSupabase).mockReturnValue(
      stubClient({ ...publicPlaybook, instructions: null }) as unknown as ReturnType<typeof getSupabase>,
    );
    vi.mocked(getServiceSupabase).mockReturnValue(
      stubClient([]) as unknown as ReturnType<typeof getServiceSupabase>,
    );

    const res = await GET(new Request("http://localhost/api/mcp/public-guid"));
    const manifest = await res.json();

    expect(manifest._playbook.persona.systemPrompt).toBe("You are helpful.");
    // Omitted rather than sent as null, so the manifest of a playbook that
    // never set instructions is unchanged.
    expect(manifest._playbook).not.toHaveProperty("instructions");
  });

  it("publishes instructions and appends them after the persona prompt", async () => {
    vi.mocked(getSupabase).mockReturnValue(
      stubClient({
        ...publicPlaybook,
        instructions: "# Project rules\n\nAlways run the tests.",
      }) as unknown as ReturnType<typeof getSupabase>,
    );
    vi.mocked(getServiceSupabase).mockReturnValue(
      stubClient([]) as unknown as ReturnType<typeof getServiceSupabase>,
    );

    const res = await GET(new Request("http://localhost/api/mcp/public-guid"));
    const manifest = await res.json();

    // Persona first (who the agent is), then this project's operating rules.
    expect(manifest._playbook.persona.systemPrompt).toBe(
      "You are helpful.\n\n# Project rules\n\nAlways run the tests.",
    );
    // Still available as its own field, unmerged.
    expect(manifest._playbook.instructions).toBe("# Project rules\n\nAlways run the tests.");
  });
  it("challenges an unauthenticated caller when the playbook exists but is private", async () => {
    vi.mocked(getSupabase).mockReturnValue(
      stubClient(null) as unknown as ReturnType<typeof getSupabase>,
    );
    vi.mocked(getServiceSupabase).mockReturnValue(
      stubClient({ ...publicPlaybook, guid: "private-guid", visibility: "private" }) as unknown as ReturnType<typeof getServiceSupabase>,
    );

    const res = await GET(new Request("http://localhost/api/mcp/private-guid"));

    expect(canAccessPrivatePlaybook).toHaveBeenCalledWith(expect.any(Request), "playbook-1");
    // This used to be 404, which told a client the server did not exist and
    // made a private playbook impossible to add as a connector.
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toContain("Bearer");
  });

  it("still answers 404 when there is no such playbook at all", async () => {
    vi.mocked(getSupabase).mockReturnValue(
      stubClient(null) as unknown as ReturnType<typeof getSupabase>,
    );
    vi.mocked(getServiceSupabase).mockReturnValue(
      stubClient(null) as unknown as ReturnType<typeof getServiceSupabase>,
    );

    const res = await GET(new Request("http://localhost/api/mcp/absent-guid"));

    expect(res.status).toBe(404);
  });
});
