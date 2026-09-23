import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260922213700_portable_playbook_snapshots.sql", "utf8");

describe("private portable backup schema", () => {
  it("stores immutable revisions, denies anonymous reads, and survives playbook deletion", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        create role anon;
        create role authenticated;
        create role service_role bypassrls;
        create table public.playbooks (id uuid primary key);
      `);
      await db.exec(sql);
      await db.exec(sql); // Deploy retries must be harmless.
      const playbook = "11111111-2222-4333-8444-555555555555";
      await db.query("insert into public.playbooks(id) values ($1)", [playbook]);
      await db.query(`insert into public.playbook_snapshots
        (playbook_id,playbook_guid,playbook_name,owner_user_id,digest,snapshot,file_count,size_bytes)
        values ($1,'team-guide','Team guide',$2,$3,$4,1,2)`,
      [playbook, "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", `sha256:${"a".repeat(64)}`, { format: "agentplaybooks.portable-snapshot/v1", files: [] }]);
      const before = await db.query<{ playbook_id: string }>("select playbook_id from public.playbook_snapshots");
      expect(before.rows[0].playbook_id).toBe(playbook);
      await db.query("delete from public.playbooks where id=$1", [playbook]);
      const after = await db.query<{ playbook_id: string | null; playbook_guid: string }>("select playbook_id,playbook_guid from public.playbook_snapshots");
      expect(after.rows).toEqual([{ playbook_id: null, playbook_guid: "team-guide" }]);
      await db.exec("set role anon");
      await expect(db.query("select * from public.playbook_snapshots")).rejects.toThrow(/permission denied/);
      await db.exec("reset role");
    } finally {
      await db.close();
    }
  });
});
