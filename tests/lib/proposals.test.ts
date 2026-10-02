import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyProposal, parseProposalInput } from "@/lib/proposals";

type Op = { table: string; op: string; values?: Record<string, unknown>; filters: [string, unknown][] };

/** Records every write; `existingSkill` answers the skill lookup. */
function fakeClient(existingSkill: { id: string } | null) {
  const ops: Op[] = [];
  const client = {
    from(table: string) {
      const op: Op = { table, op: "select", filters: [] };
      ops.push(op);
      const chain = {
        select: () => chain,
        eq: (column: string, value: unknown) => { op.filters.push([column, value]); return chain; },
        ilike: (column: string, value: unknown) => { op.filters.push([column, value]); return chain; },
        order: () => chain,
        limit: () => chain,
        insert: (values: Record<string, unknown>) => { op.op = "insert"; op.values = values; return chain; },
        update: (values: Record<string, unknown>) => { op.op = "update"; op.values = values; return Object.assign(Promise.resolve({ error: null }), chain); },
        upsert: (values: Record<string, unknown>) => { op.op = "upsert"; op.values = values; return chain; },
        maybeSingle: async () => ({ data: existingSkill, error: null }),
        single: async () => ({ data: op.op === "insert" ? { id: "new-skill" } : { key: op.values?.key }, error: null }),
      };
      return chain;
    },
  };
  return { client: client as unknown as SupabaseClient, ops };
}

describe("parseProposalInput", () => {
  it("accepts a skill proposal and uses its name as the target", () => {
    expect(parseProposalInput({
      kind: "skill",
      payload: { name: "ekr-data-gathering", description: "Gather EKR data.", content: "# EKR\n" },
      rationale: "Natural key was missing",
    })).toEqual({
      kind: "skill",
      target: "ekr-data-gathering",
      payload: { name: "ekr-data-gathering", description: "Gather EKR data.", content: "# EKR\n" },
      rationale: "Natural key was missing",
    });
  });

  it("accepts a memory proposal with optional fields only when present", () => {
    expect(parseProposalInput({ kind: "memory", payload: { key: "lesson/ekr-key", value: { text: "x" }, tier: "longterm" } }))
      .toEqual({ kind: "memory", target: "lesson/ekr-key", payload: { key: "lesson/ekr-key", value: { text: "x" }, tier: "longterm" }, rationale: null });
  });

  it("rejects malformed proposals with a reason", () => {
    const cases: unknown[] = [
      null,
      { kind: "agent", payload: {} },
      { kind: "skill", payload: { name: "Bad Name", description: "x", content: "y" } },
      { kind: "skill", payload: { name: "ok", description: "", content: "y" } },
      { kind: "skill", payload: { name: "ok", description: "d", content: "" } },
      { kind: "memory", payload: { key: "../escape", value: 1 } },
      { kind: "memory", payload: { key: "k" } },
      { kind: "memory", payload: { key: "k", value: "x".repeat(70_000) } },
      { kind: "memory", payload: { key: "k", value: 1, tier: "forever" } },
      { kind: "memory", payload: { key: "k", value: 1, tags: "one" } },
      { kind: "memory", payload: { key: "k", value: 1 }, rationale: "x".repeat(4_001) },
    ];
    for (const body of cases) expect(parseProposalInput(body)).toHaveProperty("error");
  });
});

describe("applyProposal", () => {
  const skill = { name: "ekr-data-gathering", description: "Gather EKR data.", content: "# v2\n" };

  it("updates the skill of that name, so the version trigger keeps the old text", async () => {
    const { client, ops } = fakeClient({ id: "skill-1" });
    expect(await applyProposal(client, "pb-1", { id: "p1", kind: "skill", target: skill.name, payload: skill })).toBe("skill-1");
    const update = ops.find((op) => op.op === "update");
    expect(update?.table).toBe("skills");
    expect(update?.values).toEqual({ description: skill.description, content: skill.content });
    expect(update?.filters).toEqual([["id", "skill-1"], ["playbook_id", "pb-1"]]);
  });

  it("creates the skill when the playbook has none of that name", async () => {
    const { client, ops } = fakeClient(null);
    expect(await applyProposal(client, "pb-1", { id: "p1", kind: "skill", target: skill.name, payload: skill })).toBe("new-skill");
    expect(ops.find((op) => op.op === "insert")?.values).toEqual({ playbook_id: "pb-1", ...skill });
  });

  it("upserts a memory with its provenance", async () => {
    const { client, ops } = fakeClient(null);
    const ref = await applyProposal(client, "pb-1", {
      id: "p2", kind: "memory", target: "lesson/ekr-key",
      payload: { key: "lesson/ekr-key", value: { text: "x" }, summary: "EKR natural key", tags: ["ekr"] },
    });
    expect(ref).toBe("lesson/ekr-key");
    const upsert = ops.find((op) => op.op === "upsert");
    expect(upsert?.table).toBe("memories");
    expect(upsert?.values).toMatchObject({
      playbook_id: "pb-1", key: "lesson/ekr-key", value: { text: "x" }, summary: "EKR natural key", tags: ["ekr"],
      metadata: { source: "proposal", proposal_id: "p2" },
    });
    expect(typeof upsert?.values?.memory_at).toBe("string");
  });
});
