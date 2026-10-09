import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

const USER = "00000000-0000-4000-8000-0000000000a1";
const OTHER = "00000000-0000-4000-8000-0000000000b1";
const USER_PROFILE = "00000000-0000-4000-8000-0000000000a2";
const OTHER_PROFILE = "00000000-0000-4000-8000-0000000000b2";
const USER_PB = "00000000-0000-4000-8000-0000000000a3";
const OTHER_PB = "00000000-0000-4000-8000-0000000000b3";
const USER_RUN = "00000000-0000-4000-8000-0000000000a4";
const DIGEST = `sha256:${"0".repeat(64)}`;

// Account deletion has to remove everything an account owns — including the
// rows that reference it without a foreign key, which no cascade would reach —
// and must not take anything from the people it shared playbooks with.
describe("delete_account in PostgreSQL", () => {
  let db: PGlite;

  const count = async (sql: string) =>
    Number(((await db.query<{ n: number }>(`select count(*)::int as n from ${sql}`)).rows[0]).n);

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
    await db.exec(readFileSync("supabase/schema.sql", "utf8").replace(/^CREATE EXTENSION .*;\r?$/gm, ""));
    await db.exec(readFileSync("supabase/migrations/20260913173449_harden_public_functions.sql", "utf8"));
    await db.exec(readFileSync("supabase/migrations/20261002120000_review_proposals.sql", "utf8"));
    await db.exec(readFileSync("supabase/migrations/20261010115900_playbook_delete_trigger.sql", "utf8"));
    await db.exec(readFileSync("supabase/migrations/20261010120000_delete_account.sql", "utf8"));

    await db.exec(`
      insert into auth.users(id,email) values ('${USER}','user@example.invalid'), ('${OTHER}','other@example.invalid');
      insert into profiles(id,auth_user_id,display_name) values
        ('${USER_PROFILE}','${USER}','Leaving user'), ('${OTHER_PROFILE}','${OTHER}','Staying user');

      -- The leaving user's own playbook, with something in every child table.
      insert into playbooks(id,user_id,guid,name,publisher_id) values ('${USER_PB}','${USER}','leaving-pb','Mine','${USER_PROFILE}');
      insert into skills(playbook_id,name,content,publisher_id) values ('${USER_PB}','My skill','v1','${USER_PROFILE}');
      insert into memories(playbook_id,key,value) values ('${USER_PB}','rule','{"text":"v1"}');
      update memories set value = '{"text":"v2"}' where playbook_id = '${USER_PB}';
      insert into secrets(playbook_id,name,encrypted_value,iv,auth_tag) values ('${USER_PB}','MY_KEY','x','x','x');
      insert into api_keys(playbook_id,key_hash,key_prefix) values ('${USER_PB}','h1','apb_live_aaaa');
      insert into playbook_runs(id,playbook_id,name) values ('${USER_RUN}','${USER_PB}','Run');
      insert into canvas(playbook_id,run_id,name,slug,content) values ('${USER_PB}','${USER_RUN}','Doc','doc','text');
      insert into playbook_collaborators(playbook_id,user_id,invited_by,invite_token_hash,invite_expires_at,accepted_at)
        values ('${USER_PB}','${OTHER}','${USER}','t1', now() + interval '1 day', now());
      insert into playbook_stars(playbook_id,user_id) values ('${USER_PB}','${OTHER}');
      insert into memories_backup(id,playbook_id,key) values (gen_random_uuid(),'${USER_PB}','old-rule');

      -- Someone else's playbook the leaving user took part in.
      insert into playbooks(id,user_id,guid,name) values ('${OTHER_PB}','${OTHER}','staying-pb','Theirs');
      insert into skills(playbook_id,name,content,publisher_id) values ('${OTHER_PB}','Copied skill','v1','${USER_PROFILE}');
      insert into secrets(playbook_id,name,encrypted_value,iv,auth_tag,created_by) values ('${OTHER_PB}','THEIR_KEY','x','x','x','${USER}');
      insert into playbook_collaborators(playbook_id,user_id,invited_by,invite_token_hash,invite_expires_at,accepted_at)
        values ('${OTHER_PB}','${USER}','${OTHER}','t2', now() + interval '1 day', now());
      insert into playbook_collaborators(playbook_id,user_id,invited_by,invite_token_hash,invite_expires_at)
        values ('${OTHER_PB}',null,'${USER}','t3', now() + interval '1 day');
      insert into playbook_stars(playbook_id,user_id) values ('${OTHER_PB}','${USER}');

      insert into user_api_keys(user_id,key_hash,key_prefix) values ('${USER}','h2','apb_live_bbbb');
      insert into playbook_snapshots(playbook_id,playbook_guid,playbook_name,owner_user_id,created_by,digest,snapshot,file_count,size_bytes)
        values ('${USER_PB}','leaving-pb','Mine','${USER}','${USER}','${DIGEST}','{}',1,2),
               ('${OTHER_PB}','staying-pb','Theirs','${OTHER}','${USER}','${DIGEST}','{}',1,2);
    `);
  });

  afterAll(async () => {
    await db.close();
  });

  it("deletes a single playbook, and still versions persona edits", async () => {
    // The playbook delete trigger used to insert a version row for the playbook
    // it had just deleted, which violated the foreign key and rolled every
    // playbook delete back.
    const throwaway = "00000000-0000-4000-8000-0000000000c3";
    await db.exec(`insert into playbooks(id,user_id,guid,name,persona_name) values ('${throwaway}','${OTHER}','throwaway','Tmp','Before')`);
    await db.exec(`update playbooks set persona_name = 'After' where id = '${throwaway}'`);
    expect(await count(`playbook_versions where playbook_id = '${throwaway}' and change_type = 'UPDATE'`)).toBe(1);
    await db.exec(`delete from playbooks where id = '${throwaway}'`);
    expect(await count(`playbooks where id = '${throwaway}'`)).toBe(0);
    expect(await count(`playbook_versions where playbook_id = '${throwaway}'`)).toBe(0);
  });

  it("cannot be called from the browser roles", async () => {
    const { rows } = await db.query<{ anon: boolean; authenticated: boolean; service: boolean }>(`
      select has_function_privilege('anon', 'public.delete_account(uuid)', 'execute') as anon,
             has_function_privilege('authenticated', 'public.delete_account(uuid)', 'execute') as authenticated,
             has_function_privilege('service_role', 'public.delete_account(uuid)', 'execute') as service
    `);
    expect(rows[0]).toEqual({ anon: false, authenticated: false, service: true });
  });

  it("refuses an id that is not an account", async () => {
    await expect(db.query(`select delete_account('00000000-0000-4000-8000-0000000000ff')`)).rejects.toThrow(/no such user/);
  });

  it("deletes the account and reports how many playbooks went with it", async () => {
    const { rows } = await db.query<{ result: { playbooks_deleted: number } }>(`select delete_account('${USER}') as result`);
    expect(rows[0].result).toEqual({ playbooks_deleted: 1 });
    expect(await count(`auth.users where id = '${USER}'`)).toBe(0);
    expect(await count(`profiles where auth_user_id = '${USER}'`)).toBe(0);
    expect(await count(`user_api_keys where user_id = '${USER}'`)).toBe(0);
  });

  it("removes everything inside the account's own playbooks", async () => {
    expect(await count(`playbooks where user_id = '${USER}'`)).toBe(0);
    for (const table of ["skills", "memories", "memory_history", "secrets", "api_keys", "playbook_runs", "canvas", "playbook_collaborators", "playbook_stars"]) {
      expect(await count(`${table} where playbook_id = '${USER_PB}'`), table).toBe(0);
    }
  });

  it("removes the rows no foreign key would have reached", async () => {
    expect(await count(`playbook_snapshots where owner_user_id = '${USER}'`), "own backups").toBe(0);
    expect(await count(`memories_backup where playbook_id = '${USER_PB}'`), "memories_backup").toBe(0);
    expect(await count(`playbook_collaborators where user_id = '${USER}'`), "memberships").toBe(0);
    expect(await count(`playbook_collaborators where invited_by = '${USER}' and user_id is null`), "pending invites").toBe(0);
    expect(await count(`playbook_stars where user_id = '${USER}'`), "stars").toBe(0);
  });

  it("leaves other people's playbooks whole, without pointing at the deleted account", async () => {
    expect(await count(`auth.users where id = '${OTHER}'`)).toBe(1);
    expect(await count(`playbooks where id = '${OTHER_PB}'`)).toBe(1);
    expect(await count(`secrets where playbook_id = '${OTHER_PB}'`)).toBe(1);
    const skill = await db.query<{ publisher_id: string | null }>(`select publisher_id from skills where playbook_id = '${OTHER_PB}'`);
    expect(skill.rows).toEqual([{ publisher_id: null }]);
    const snapshot = await db.query<{ created_by: string | null }>(`select created_by from playbook_snapshots where owner_user_id = '${OTHER}'`);
    expect(snapshot.rows).toEqual([{ created_by: null }]);
  });
});
