import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

const OWNER = "00000000-0000-4000-8000-000000000001";
const PB = "00000000-0000-4000-8000-000000000003";
const SKILL = "00000000-0000-4000-8000-000000000004";

// Proposals share memory_history and skill_versions with real history, so the
// one thing that must never happen is a pending (or decided) proposal showing
// up where memory and skill history are read as data.
describe("review proposals in PostgreSQL", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite({ extensions: { pg_trgm } });
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create role supabase_auth_admin;
      create schema auth;
      create schema extensions;
      create function extensions.uuid_generate_v4() returns uuid language sql as 'select gen_random_uuid()';
      create function auth.uid() returns uuid language sql as
        'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
      create function auth.role() returns text language sql as 'select current_user::text';
      create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    `);
    // The snapshot already folds in the memory-time migration (memory_at,
    // memory_history), so replaying it here would fail on existing columns.
    await db.exec(readFileSync("supabase/schema.sql", "utf8").replace(/^CREATE EXTENSION .*;\r?$/gm, ""));
    await db.exec(readFileSync("supabase/migrations/20260913173449_harden_public_functions.sql", "utf8"));
    await db.exec(readFileSync("supabase/migrations/20261002120000_review_proposals.sql", "utf8"));
    await db.exec(`
      insert into auth.users(id,email) values ('${OWNER}','owner@example.invalid');
      insert into playbooks(id,user_id,guid,name) values ('${PB}','${OWNER}','proposals-test','Test');
      insert into skills(id,playbook_id,name,content) values ('${SKILL}','${PB}','Test skill','v1');
      insert into memories(playbook_id,key,value) values ('${PB}','rule','{"text":"v1"}');
    `);
  }, 30000);
  afterAll(async () => { await db?.close(); });

  it("keeps memory proposals out of recall, search and history, whatever their decision", async () => {
    const { rows: [memory] } = await db.query<{ id: string }>("select id from memories where key='rule'");
    await db.query("update memories set value='{\"text\":\"v2\"}' where key='rule'");
    await db.query(`insert into memory_history(memory_id,playbook_id,snapshot,memory_at,review_status,proposed_by)
      values ($1,$2,'{"key":"rule","value":{"text":"proposed change"}}',now(),'pending','proposer key')`, [memory.id, PB]);
    await db.query(`insert into memory_history(memory_id,playbook_id,snapshot,memory_at,review_status)
      values (null,$1,'{"key":"lesson","value":{"text":"proposed new"}}',now(),'pending')`, [PB]);
    await db.query(`insert into memory_history(memory_id,playbook_id,snapshot,memory_at,review_status)
      values ($1,$2,'{"key":"rule","value":{"text":"rejected change"}}',now(),'rejected')`, [memory.id, PB]);

    const entries = (await db.query<{ key: string; value: { text: string }; history_id: string | null }>(
      "select key, value, history_id from memory_entries where playbook_id=$1 order by history_id nulls first", [PB])).rows;
    expect(entries.map((e) => e.value.text)).toEqual(["v2", "v1"]);
    expect(entries.some((e) => e.key === "lesson")).toBe(false);
  });

  it("requires a decision state on a memory proposal without a memory", async () => {
    await expect(db.query(`insert into memory_history(memory_id,playbook_id,snapshot,memory_at)
      values (null,$1,'{"key":"x","value":{}}',now())`, [PB])).rejects.toThrow(/memory_or_proposal/);
    await expect(db.query(`insert into memory_history(memory_id,playbook_id,snapshot,memory_at,review_status)
      values (null,$1,'{"key":"x","value":{}}',now(),'maybe')`, [PB])).rejects.toThrow(/review_status_check/);
  });

  it("stores skill proposals beside versions, and only as proposals", async () => {
    await db.query("update skills set content='v2' where id=$1", [SKILL]);
    await db.query(`insert into skill_versions(skill_id,playbook_id,name,content,change_type,review_status)
      values (null,$1,'New skill','proposed','PROPOSAL','pending')`, [PB]);
    await db.query(`insert into skill_versions(skill_id,playbook_id,name,content,change_type,review_status)
      values ($1,$2,'Test skill','proposed v3','PROPOSAL','pending')`, [SKILL, PB]);

    const versions = (await db.query<{ content: string }>(
      "select content from skill_versions where skill_id=$1 and review_status is null", [SKILL])).rows;
    expect(versions).toEqual([{ content: "v1" }]);

    await expect(db.query(`insert into skill_versions(skill_id,playbook_id,name,change_type)
      values (null,$1,'x','UPDATE')`, [PB])).rejects.toThrow(/skill_or_proposal/);
    await expect(db.query(`insert into skill_versions(skill_id,playbook_id,name,change_type)
      values ($1,$2,'x','PROPOSAL')`, [SKILL, PB])).rejects.toThrow(/proposal_check/);
    await expect(db.query(`insert into skill_versions(skill_id,playbook_id,name,change_type,review_status)
      values ($1,$2,'x','UPDATE','pending')`, [SKILL, PB])).rejects.toThrow(/proposal_check/);
  });

  it("accepts the proposer key role", async () => {
    await db.query(`insert into api_keys(playbook_id,key_hash,key_prefix,role,permissions)
      values ($1,'hash','apb_live_test','proposer','{memory:read,memory:propose}')`, [PB]);
    await expect(db.query(`insert into api_keys(playbook_id,key_hash,key_prefix,role)
      values ($1,'hash2','apb_live_tst2','owner')`, [PB])).rejects.toThrow(/api_keys_role_check/);
  });
});
