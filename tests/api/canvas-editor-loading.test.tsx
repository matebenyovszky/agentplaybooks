import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CanvasEditor } from "@/components/playbook/CanvasEditor";
import { createSupabaseAdapter } from "@/lib/storage";
import type { Canvas, PlaybookRun } from "@/lib/supabase/types";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), authFetch: vi.fn() }));
vi.mock("@/lib/auth-fetch", () => ({ authFetch: mocks.authFetch }));
vi.mock("@/app/api/_shared/auth", () => ({
  getAuthenticatedUser: vi.fn(async () => ({ id: "owner-1" })),
  requireAuth: vi.fn(async () => ({ id: "owner-1" })),
  validateApiKey: vi.fn(async () => null),
}));
vi.mock("@/app/api/_shared/guards", () => ({
  getPlaybookByGuid: vi.fn(async () => ({ id: "playbook-1", guid: "canvas-test" })),
  checkPlaybookWriteAccess: vi.fn(async () => true),
}));
vi.mock("@/app/api/_shared/supabase", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient("https://canvas-test.supabase.co", "test-service-role", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: mocks.fetch },
  });
  return { getServiceSupabase: () => client };
});
const { GET } = await import("@/app/api/playbooks/[guid]/canvas/route");
const runs = [
  { id: "empty-run", name: "Migrated canvas", status: "active" },
  { id: "populated-run", name: "Research", status: "active" },
] as PlaybookRun[];
const documents: Canvas[] = [
  { id: "doc-1", playbook_id: "playbook-1", run_id: "populated-run", name: "First document", slug: "first", content: "# First\nSaved content", sections: [], version: 2 },
  { id: "doc-2", playbook_id: "playbook-1", run_id: "populated-run", name: "Second document", slug: "second", content: "# Second", sections: [], version: 1 },
].map(document => ({
  ...document,
  metadata: {},
  sort_order: 0,
  created_at: "2026-10-07T12:00:00Z",
  updated_at: "2026-10-07T12:00:00Z",
}));
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetch.mockImplementation(async (input: string) => {
    const url = new URL(input);
    if (url.pathname.endsWith("/playbook_runs")) return json({ id: "populated-run", created_by: "owner-1" });
    const select = url.searchParams.get("select");
    const rows = url.searchParams.get("run_id") === "eq.populated-run" ? documents : [];
    return json(rows.map(row => select === "*" ? row : Object.fromEntries((select || "").split(",").map(field => [field, row[field as keyof Canvas]]))));
  });
  mocks.authFetch.mockImplementation(async (url: string) => url.endsWith("/runs")
    ? json(runs)
    : GET(new Request(`https://apbks.test${url}`)));
});

describe("canvas dashboard loading", () => {
  it("returns run identity even for the metadata-only list", async () => {
    const response = await GET(new Request("https://apbks.test/api/playbooks/canvas-test/canvas?runId=populated-run"));
    const rows = await response.json();
    expect(rows[0]).toMatchObject({ playbook_id: "playbook-1", run_id: "populated-run" });
    expect(rows[0]).not.toHaveProperty("content");
  });

  it("loads full saved content and shows both documents when the first run is empty", async () => {
    const storage = createSupabaseAdapter("playbook-1", "canvas-test");
    const canvases = await storage.getCanvases();
    expect(canvases).toEqual(documents);
    const html = renderToStaticMarkup(<CanvasEditor storage={storage} canvases={canvases} runs={runs} onUpdate={vi.fn()} onRunsUpdate={vi.fn()} playbookGuid="canvas-test" />);
    expect(html).toContain("First document");
    expect(html).toContain("Second document");
    expect(html).toContain("All runs · 2 documents");
    expect(html).not.toContain("No canvas documents");
  });
});
