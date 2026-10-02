import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * The proposals endpoints: who may submit, who may read and decide, and that
 * an approval is applied exactly once. Supabase is an in-memory table store;
 * auth and access roles are stubbed per test.
 */

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
let failSkillWrites = false;

function query(table: string) {
  const filters: Array<(row: Row) => boolean> = [];
  let mode: "select" | "insert" | "update" | "upsert" = "select";
  let values: Row = {};
  let limit = Infinity;
  let columns: string[] | null = null;
  // Like PostgREST: a column list returns those columns only.
  const project = (row: Row) => columns ? Object.fromEntries(columns.map((column) => [column, row[column]])) : row;
  const rows = () => (tables[table] ??= []);
  const matching = () => rows().filter((row) => filters.every((filter) => filter(row)));
  const run = (): { data: unknown; error: { message: string } | null } => {
    if (failSkillWrites && table === "skills" && mode !== "select") return { data: null, error: { message: "write failed" } };
    if (mode === "insert") {
      const row = { id: `${table}-${rows().length + 1}`, status: "pending", created_at: new Date().toISOString(), ...values };
      rows().push(row);
      return { data: [row], error: null };
    }
    if (mode === "update") {
      const hit = matching();
      for (const row of hit) Object.assign(row, values);
      return { data: hit, error: null };
    }
    if (mode === "upsert") {
      const existing = rows().find((row) => row.playbook_id === values.playbook_id && row.key === values.key);
      if (existing) Object.assign(existing, values); else rows().push({ ...values });
      return { data: [values], error: null };
    }
    return { data: matching().slice(0, limit), error: null };
  };
  const chain = {
    select: (list?: string) => { columns = list && list !== "*" ? list.split(",").map((c) => c.trim()) : null; return chain; },
    eq: (column: string, value: unknown) => { filters.push((row) => row[column] === value); return chain; },
    ilike: (column: string, value: string) => { filters.push((row) => String(row[column]).toLowerCase() === value.toLowerCase()); return chain; },
    order: () => chain,
    limit: (n: number) => { limit = n; return chain; },
    insert: (row: Row) => { mode = "insert"; values = row; return chain; },
    update: (row: Row) => { mode = "update"; values = row; return chain; },
    upsert: (row: Row) => { mode = "upsert"; values = row; return chain; },
    single: async () => { const { data, error } = run(); const row = (data as Row[] | null)?.[0]; return { data: row ? project(row) : null, error }; },
    maybeSingle: async () => { const { data, error } = run(); const row = (data as Row[] | null)?.[0]; return { data: row ? project(row) : null, error }; },
    then: (resolve: (value: unknown) => void, reject: (reason: unknown) => void) =>
      Promise.resolve(run()).then(({ data, error }) => ({ data: Array.isArray(data) ? data.map(project) : data, error })).then(resolve, reject),
  };
  return chain;
}

vi.mock("@/app/api/_shared/supabase", () => ({
  getSupabase: () => ({ from: query }),
  getServiceSupabase: () => ({ from: query }),
}));

const auth = vi.hoisted(() => ({
  authorizePlaybookRequest: vi.fn(),
  getAuthenticatedUser: vi.fn(),
  validateUserApiKey: vi.fn(),
}));
vi.mock("@/app/api/_shared/auth", () => auth);

const guards = vi.hoisted(() => ({ getPlaybookAccessRole: vi.fn() }));
vi.mock("@/app/api/_shared/guards", () => guards);

const audit = vi.hoisted(() => ({ recordProposalAudit: vi.fn() }));
vi.mock("@/app/api/_shared/audit", () => audit);

const { GET: list, POST: submit } = await import("@/app/api/playbooks/[guid]/proposals/route");
const { GET: show, PATCH: decide } = await import("@/app/api/playbooks/[guid]/proposals/[proposalId]/route");

const PLAYBOOK = { id: "11111111-2222-4333-8444-555555555555", guid: "team-lessons" };
const params = () => ({ params: Promise.resolve({ guid: PLAYBOOK.guid }) });
const item = (proposalId: string) => ({ params: Promise.resolve({ guid: PLAYBOOK.guid, proposalId }) });
const request = (method: string, body?: unknown, path = "") =>
  new NextRequest(`http://localhost/api/playbooks/${PLAYBOOK.guid}/proposals${path}`, {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } } : {}),
  });

const lesson = { kind: "memory", payload: { key: "lesson/ekr-key", value: { text: "Join EKR lots on (eljarasAzonosito, reszSzama)." } } };
const skill = { kind: "skill", payload: { name: "ekr-data-gathering", description: "Gather EKR data.", content: "# v2\n" } };

function asProposerKey() {
  auth.authorizePlaybookRequest.mockResolvedValue({ kind: "playbook_key", playbookId: PLAYBOOK.id, userId: null, keyPrefix: "apb_prop" });
  auth.getAuthenticatedUser.mockResolvedValue(null);
  auth.validateUserApiKey.mockResolvedValue(null);
}

function asOwner() {
  auth.getAuthenticatedUser.mockResolvedValue({ id: "owner-1" });
  guards.getPlaybookAccessRole.mockResolvedValue("owner");
}

beforeEach(() => {
  for (const name of Object.keys(tables)) delete tables[name];
  tables.playbooks = [{ ...PLAYBOOK }];
  failSkillWrites = false;
  vi.clearAllMocks();
  guards.getPlaybookAccessRole.mockResolvedValue(null);
  auth.authorizePlaybookRequest.mockResolvedValue(null);
  auth.getAuthenticatedUser.mockResolvedValue(null);
  auth.validateUserApiKey.mockResolvedValue(null);
});

describe("submitting", () => {
  it("lets a proposer key submit and answers with the id only", async () => {
    asProposerKey();
    const response = await submit(request("POST", lesson), params());
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(["created_at", "id", "status"]);
    expect(tables.playbook_proposals[0]).toMatchObject({
      playbook_id: PLAYBOOK.id, kind: "memory", target: "lesson/ekr-key",
      submitted_via: "playbook_key", submitter_key_prefix: "apb_prop", submitted_by: null,
    });
    expect(auth.authorizePlaybookRequest).toHaveBeenCalledWith(expect.anything(), PLAYBOOK.id, "proposals:write");
    expect(audit.recordProposalAudit).toHaveBeenCalledWith(
      { playbookId: PLAYBOOK.id, actor: { type: "api_key", id: "apb_prop" } },
      { operation: "proposal.submit", status: "success", target: "memory:lesson/ekr-key" },
    );
  });

  it("refuses a caller without proposals:write, and a malformed proposal", async () => {
    expect((await submit(request("POST", lesson), params())).status).toBe(401);
    asProposerKey();
    expect((await submit(request("POST", { kind: "memory", payload: { key: "../x", value: 1 } }), params())).status).toBe(400);
    expect(tables.playbook_proposals ?? []).toEqual([]);
  });

  it("caps the pending queue", async () => {
    asProposerKey();
    tables.playbook_proposals = Array.from({ length: 500 }, (_, i) => ({ id: `p${i}`, playbook_id: PLAYBOOK.id, status: "pending" }));
    expect((await submit(request("POST", lesson), params())).status).toBe(429);
  });
});

describe("reading", () => {
  it("does not let a proposer key read proposals, its own included", async () => {
    asProposerKey();
    await submit(request("POST", lesson), params());
    expect((await list(request("GET"), params())).status).toBe(403);
    expect((await show(request("GET", undefined, "/proposals-1"), item("playbook_proposals-1"))).status).toBe(403);
  });

  it("lists pending proposals for the owner and shows what one would replace", async () => {
    asProposerKey();
    await submit(request("POST", skill), params());
    tables.skills = [{ id: "skill-1", playbook_id: PLAYBOOK.id, name: "ekr-data-gathering", description: "Old.", content: "# v1\n" }];
    asOwner();
    const listed = await (await list(request("GET"), params())).json();
    expect(listed.map((row: Row) => row.target)).toEqual(["ekr-data-gathering"]);
    const detail = await (await show(request("GET"), item(listed[0].id))).json();
    expect(detail.current).toMatchObject({ content: "# v1\n" });
  });
});

describe("deciding", () => {
  async function pendingSkill() {
    asProposerKey();
    const { id } = await (await submit(request("POST", skill), params())).json();
    asOwner();
    return id as string;
  }

  it("applies an approved skill once and records who decided", async () => {
    const id = await pendingSkill();
    tables.skills = [{ id: "skill-1", playbook_id: PLAYBOOK.id, name: "ekr-data-gathering", description: "Old.", content: "# v1\n" }];
    const approved = await decide(request("PATCH", { decision: "approve", note: "Good catch" }), item(id));
    expect(approved.status).toBe(200);
    expect(await approved.json()).toMatchObject({ status: "approved", applied_ref: "skill-1", reviewed_by: "owner-1", review_note: "Good catch" });
    expect(tables.skills[0]).toMatchObject({ content: "# v2\n", description: "Gather EKR data." });
    expect((await decide(request("PATCH", { decision: "approve" }), item(id))).status).toBe(409);
    expect(audit.recordProposalAudit).toHaveBeenLastCalledWith(
      { playbookId: PLAYBOOK.id, actor: { type: "owner", id: "owner-1" } },
      { operation: "proposal.approve", status: "success", target: "skill:ekr-data-gathering" },
    );
  });

  it("writes an approved memory into the playbook", async () => {
    asProposerKey();
    const { id } = await (await submit(request("POST", lesson), params())).json();
    asOwner();
    expect((await decide(request("PATCH", { decision: "approve" }), item(id))).status).toBe(200);
    expect(tables.memories[0]).toMatchObject({ playbook_id: PLAYBOOK.id, key: "lesson/ekr-key", metadata: { source: "proposal", proposal_id: id } });
  });

  it("rejects without writing anything", async () => {
    const id = await pendingSkill();
    const rejected = await decide(request("PATCH", { decision: "reject", note: "Case-specific" }), item(id));
    expect(await rejected.json()).toMatchObject({ status: "rejected", review_note: "Case-specific" });
    expect(tables.skills ?? []).toEqual([]);
  });

  it("puts the proposal back to pending when applying fails", async () => {
    const id = await pendingSkill();
    failSkillWrites = true;
    expect((await decide(request("PATCH", { decision: "approve" }), item(id))).status).toBe(500);
    expect(tables.playbook_proposals[0]).toMatchObject({ status: "pending", reviewed_at: null, reviewed_by: null });
  });

  it("refuses a decision from anyone but the owner or an editor, and an unknown decision", async () => {
    const id = await pendingSkill();
    auth.getAuthenticatedUser.mockResolvedValue({ id: "stranger" });
    guards.getPlaybookAccessRole.mockResolvedValue(null);
    expect((await decide(request("PATCH", { decision: "approve" }), item(id))).status).toBe(403);
    asOwner();
    expect((await decide(request("PATCH", { decision: "maybe" }), item(id))).status).toBe(400);
    expect(tables.playbook_proposals[0].status).toBe("pending");
  });
});
