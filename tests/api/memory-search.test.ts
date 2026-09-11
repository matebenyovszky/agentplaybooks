import { beforeEach, describe, expect, it, vi } from "vitest";
import { searchMemories } from "@/app/api/_shared/memory";
import { GET } from "@/app/api/playbooks/[guid]/memory/route";
import { PUT } from "@/app/api/playbooks/[guid]/memory/[key]/route";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  getAuthenticatedUser: vi.fn(),
  validateApiKey: vi.fn(),
  getPlaybookByGuid: vi.fn(),
}));
vi.mock("@/app/api/_shared/supabase", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient("https://memory-test.supabase.co", "test-service-role", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: mocks.fetch },
  });
  return { getServiceSupabase: () => client };
});
vi.mock("@/app/api/_shared/auth", () => ({ ...mocks, requireAuth: mocks.getAuthenticatedUser }));
vi.mock("@/app/api/_shared/guards", () => ({ getPlaybookByGuid: mocks.getPlaybookByGuid, checkPlaybookWriteAccess: vi.fn() }));

const playbook = { id: "00000000-0000-0000-0000-000000000001", guid: "test-memory" };
const entry = { id: "current-id", memory_id: "current-id", history_id: null, key: "coffee", memory_at: "2026-09-11T08:21:00Z", is_archived: false, value: { preference: "without sugar" }, search_text: "internal index" };
const jsonResponse = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
const queryAt = (index = 0) => new URL(String(mocks.fetch.mock.calls[index][0])).searchParams;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthenticatedUser.mockResolvedValue(null);
  mocks.validateApiKey.mockResolvedValue(null);
  mocks.getPlaybookByGuid.mockResolvedValue(playbook);
  mocks.fetch.mockImplementation(async () => jsonResponse([entry]));
});

describe("memory REST and PostgREST integration", () => {
  it("limits normal search to the authorized playbook and active entries", async () => {
    const response = await GET(new Request("http://localhost/api/playbooks/test-memory/memory"));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result[0].memory_at).toBe(entry.memory_at);
    expect(result[0]).not.toHaveProperty("search_text");
    expect(queryAt().get("playbook_id")).toBe(`eq.${playbook.id}`);
    expect(queryAt().get("is_archived")).toBe("eq.false");
    expect(queryAt().get("limit")).toBe("100");
  });

  it("searches archive content literally with inclusive dates and pagination", async () => {
    await searchMemories(playbook.id, { scope: "archived", search: "100%_ready (a,b)", after: "2026-09-01T00:00:00Z", before: "2026-09-11T00:00:00Z", limit: 25, offset: 50 });
    const query = queryAt();
    expect(query.get("is_archived")).toBe("eq.true");
    expect(query.get("search_text")).toBe("ilike.%100\\%\\_ready (a,b)%");
    expect(query.has("or")).toBe(false);
    expect(query.getAll("memory_at")).toEqual(["gte.2026-09-01T00:00:00.000Z", "lte.2026-09-11T00:00:00.000Z"]);
    expect(query.get("offset")).toBe("50");
    expect(query.get("limit")).toBe("25");
  });

  it("allows an explicit all-scope and a direct read of an archived key", async () => {
    await searchMemories(playbook.id, { scope: "all" });
    expect(queryAt().has("is_archived")).toBe(false);
    await searchMemories(playbook.id, { key: "coffee" });
    expect(queryAt(1).has("is_archived")).toBe(false);
    expect(queryAt(1).get("history_id")).toBe("is.null");
  });

  it("resolves history through the current entry in the same playbook", async () => {
    mocks.fetch.mockResolvedValueOnce(jsonResponse([{ id: "original-id" }]));
    await searchMemories(playbook.id, { history_key: "renamed-coffee" });
    expect(queryAt().get("playbook_id")).toBe(`eq.${playbook.id}`);
    expect(queryAt().get("key")).toBe("eq.renamed-coffee");
    expect(queryAt(1).get("playbook_id")).toBe(`eq.${playbook.id}`);
    expect(queryAt(1).get("memory_id")).toBe("eq.original-id");
    expect(queryAt(1).get("history_id")).toBe("not.is.null");
    expect(queryAt(1).has("key")).toBe(false);
    expect(queryAt(1).has("is_archived")).toBe(false);
  });

  it("refuses invalid search inputs before querying memory", async () => {
    for (const query of ["scope=typo", "history_key=", "key=coffee&history_key=coffee", "limit=201", "after=not-a-date"]) {
      const response = await GET(new Request(`http://localhost/api/playbooks/test-memory/memory?${query}`));
      expect(response.status).toBe(400);
    }
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("does not disclose private history without playbook access", async () => {
    mocks.getPlaybookByGuid.mockResolvedValue(null);
    mocks.validateApiKey.mockResolvedValue({ playbooks: { id: "other-id", guid: "other-guid" } });
    const response = await GET(new Request("http://localhost/api/playbooks/test-memory/memory?scope=all"));
    expect(response.status).toBe(404);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("honors a matching playbook read credential for private memory", async () => {
    mocks.getPlaybookByGuid.mockResolvedValue(null);
    mocks.validateApiKey.mockResolvedValue({ playbooks: playbook });
    const response = await GET(new Request("http://localhost/api/playbooks/test-memory/memory?history_key=coffee"));
    expect(response.status).toBe(200);
    expect(mocks.validateApiKey).toHaveBeenCalledWith(expect.any(Request), "memory:read");
  });

  it("writes an explicit time or defaults it to save time and rejects invalid archive flags", async () => {
    mocks.validateApiKey.mockResolvedValue({ playbooks: playbook });
    mocks.fetch.mockImplementation(async (url: string, init: RequestInit) => {
      if (new URL(String(url)).pathname.endsWith("/playbooks")) return jsonResponse(playbook);
      return jsonResponse({ ...entry, ...JSON.parse(String(init.body)) });
    });
    for (const explicit of [false, true]) {
      const now = Date.now();
      const response = await PUT(new Request("http://localhost/api/playbooks/test-memory/memory/coffee", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: "coffee", is_archived: false, ...(explicit ? { memory_at: "2020-01-02T03:00:00+02:00" } : {}) }),
      }));
      expect(response.status).toBe(200);
      const result = await response.json();
      if (explicit) expect(result.memory_at).toBe("2020-01-02T01:00:00.000Z");
      else expect(Date.parse(result.memory_at)).toBeGreaterThanOrEqual(now);
      expect(result.is_archived).toBe(false);
    }
    mocks.fetch.mockClear();
    const response = await PUT(new Request("http://localhost/api/playbooks/test-memory/memory/coffee", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: {}, is_archived: "false" }),
    }));
    expect(response.status).toBe(400);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
