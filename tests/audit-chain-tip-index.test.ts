import { readFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create table audit_logs(id uuid primary key, playbook_id uuid, created_at timestamptz, hash text, prev_hash text);
    create index audit_logs_playbook_created_idx on audit_logs(playbook_id, created_at desc);
    create unique index audit_logs_playbook_prev_hash_idx on audit_logs(playbook_id,prev_hash) where prev_hash is not null;
    insert into audit_logs select md5(n::text)::uuid, '00000000-0000-0000-0000-000000000001',
      '2026-01-01'::timestamptz + n * interval '1 second', md5(n::text), md5((n-1)::text)
      from generate_series(1,10000) n;
    -- Match production's skew: one long chain and many small playbooks.
    insert into audit_logs select md5(('other-' || n)::text)::uuid, md5(n::text)::uuid,
      '2026-01-01', md5(n::text), md5('root') from generate_series(1,36) n;`);
  await db.exec(readFileSync("supabase/migrations/20261028101338_audit_chain_tip_order_index.sql", "utf8"));
  await db.exec("analyze audit_logs");
});
afterAll(async () => { await db.close(); });
const query = `select a.hash from audit_logs a
  where a.playbook_id=(select '00000000-0000-0000-0000-000000000001'::uuid) and a.hash is not null
  and not exists(select 1 from audit_logs child where child.playbook_id=a.playbook_id and child.prev_hash=a.hash)
  order by a.created_at desc,a.id desc limit 1`;
it("finds the same chain tip without scanning every historical child", async () => {
  const result = await db.query<{ hash: string }>(query);
  const expected = await db.query<{ hash: string }>("select md5('10000') hash");
  expect(result.rows).toEqual(expected.rows);
  const plan = await db.query(`explain(analyze,format json) ${query}`);
  const text = JSON.stringify(plan.rows);
  expect(text).toContain("audit_logs_chain_tip_order_idx");
  expect(text).not.toContain('"Node Type":"Incremental Sort"');
  const nodes: Record<string, unknown>[] = [];
  function visit(value: unknown) {
    if (!value || typeof value !== "object") return;
    if ("Node Type" in value) nodes.push(value as Record<string, unknown>);
    for (const child of Object.values(value)) visit(child);
  }
  visit(plan.rows);
  const childProbe = nodes.find(node => node["Index Name"] === "audit_logs_playbook_prev_hash_idx");
  expect(childProbe?.["Actual Loops"]).toBe(1);
});
it("keeps chain-link correctness when several events share a transaction timestamp", async () => {
  await db.exec(`insert into audit_logs values
    ('ffffffff-ffff-ffff-ffff-ffffffffffff','00000000-0000-0000-0000-000000000001','2026-01-02','next',md5('10000')),
    ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','2026-01-02','tip','next');`);
  expect((await db.query(query)).rows).toEqual([{ hash: "tip" }]);
});
