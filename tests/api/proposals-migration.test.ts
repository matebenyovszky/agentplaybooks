import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261002070000_playbook_proposals.sql", "utf8");
const PLAYBOOK = "11111111-2222-4333-8444-555555555555";

async function database() {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create table public.playbooks (id uuid primary key);
    create table public.api_keys (id serial primary key, role text not null default 'viewer',
      constraint api_keys_role_check check (role = any (array['viewer'::text, 'coworker'::text, 'admin'::text])));
  `);
  await db.exec(sql);
  await db.exec(sql); // Deploy retries must be harmless.
  await db.query("insert into public.playbooks(id) values ($1)", [PLAYBOOK]);
  return db;
}

describe("playbook proposals schema", () => {
  it("keeps a review state that matches the status, and denies client roles", async () => {
    const db = await database();
    try {
      await db.query(`insert into public.playbook_proposals (playbook_id, kind, target, payload, submitted_via)
        values ($1, 'memory', 'lesson-1', '{"key":"lesson-1","value":"x"}', 'playbook_key')`, [PLAYBOOK]);
      // An approved proposal must say when it was reviewed, and a pending one must not.
      await expect(db.query("update public.playbook_proposals set status = 'approved'")).rejects.toThrow(/review_state/);
      await db.query("update public.playbook_proposals set status = 'approved', reviewed_at = now()");
      await expect(db.query(`insert into public.playbook_proposals (playbook_id, kind, target, payload, submitted_via)
        values ($1, 'agent', 'x', '{}', 'session')`, [PLAYBOOK])).rejects.toThrow(/check/);

      await db.query("delete from public.playbooks where id = $1", [PLAYBOOK]);
      expect((await db.query("select count(*)::int as n from public.playbook_proposals")).rows).toEqual([{ n: 0 }]);

      for (const role of ["anon", "authenticated"]) {
        await db.exec(`set role ${role}`);
        await expect(db.query("select * from public.playbook_proposals")).rejects.toThrow(/permission denied/);
        await db.exec("reset role");
      }
    } finally {
      await db.close();
    }
  });

  it("lets a playbook key take the proposer role", async () => {
    const db = await database();
    try {
      await db.query("insert into public.api_keys(role) values ('proposer')");
      await expect(db.query("insert into public.api_keys(role) values ('owner')")).rejects.toThrow(/api_keys_role_check/);
    } finally {
      await db.close();
    }
  });
});
