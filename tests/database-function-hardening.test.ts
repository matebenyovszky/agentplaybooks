import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

const OWNER = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const PB = "00000000-0000-4000-8000-000000000003";
const SKILL = "00000000-0000-4000-8000-000000000004";
const migration = readFileSync("supabase/migrations/20260913173449_harden_public_functions.sql", "utf8");

// Execute the same user workflows before and after the migration, using the
// repository's real tables, constraints, RLS policies and function bodies.
describe.each([false, true])("database workflows (hardened=%s)", (hardened) => {
  let db: PGlite;
  async function asRole(role: string, sql: string, user = OWNER) {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
    await db.exec(`set role ${role}`);
    try { return await db.query(sql); }
    finally { await db.exec("reset role; reset search_path"); }
  }
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
      grant usage on schema auth, extensions to anon, authenticated, service_role, supabase_auth_admin;
      grant insert, select on auth.users to supabase_auth_admin;
    `);
    // PGlite supplies core gen_random_uuid; Supabase extension installation is
    // environment setup, not part of the migration being tested.
    await db.exec(readFileSync("supabase/schema.sql", "utf8").replace(/^CREATE EXTENSION .*;\r?$/gm, ""));
    await db.exec(`
      grant usage on schema public to anon, authenticated, service_role, supabase_auth_admin;
      revoke create on schema public from public;
      grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
      grant execute on all functions in schema public to anon, authenticated, service_role;
      create trigger on_auth_user_created after insert on auth.users
        for each row execute function public.handle_new_user();
    `);
    await db.exec(readFileSync("supabase/migrations/20260911042912_memory_time_and_history.sql", "utf8"));
    if (hardened) {
      await db.exec(migration);
      await db.exec(migration); // Retrying an applied migration is safe.
    }
    await db.exec(`
      insert into auth.users(id,email) values ('${OWNER}','owner@example.invalid'), ('${OTHER}','other@example.invalid');
      insert into playbooks(id,user_id,guid,name) values ('${PB}','${OWNER}','hardening-test','Test');
      insert into skills(id,playbook_id,name,content) values ('${SKILL}','${PB}','Test skill','old');
    `);
  }, 30000);
  afterAll(async () => { await db?.close(); });

  it("allows Auth to create profiles with provider metadata and email fallback", async () => {
    await asRole("supabase_auth_admin", `insert into auth.users values
      ('00000000-0000-4000-8000-000000000005','new@example.invalid','{"full_name":"New User"}'),
      ('00000000-0000-4000-8000-000000000006','fallback@example.invalid','{}')`);
    const rows = (await db.query("select display_name,is_verified,is_virtual from profiles where display_name in ('New User','fallback') order by display_name")).rows;
    expect(rows).toEqual([
      { display_name: "New User", is_verified: false, is_virtual: false },
      { display_name: "fallback", is_verified: false, is_virtual: false },
    ]);
  });

  it("preserves dashboard visibility and blocks another user's private playbook", async () => {
    expect((await asRole("authenticated", `select id from playbooks where id='${PB}'`)).rows).toHaveLength(1);
    expect((await asRole("authenticated", `select id from playbooks where id='${PB}'`, OTHER)).rows).toHaveLength(0);
    expect((await asRole("anon", `select id from playbooks where id='${PB}'`)).rows).toHaveLength(0);
  });

  it("keeps authenticated persona/skill edits and version recording working", async () => {
    await asRole("authenticated", `update playbooks set persona_name='Changed' where id='${PB}'`);
    await asRole("authenticated", `update skills set content='new' where id='${SKILL}'`);
    expect((await db.query("select change_type from playbook_versions")).rows).toEqual([{ change_type: "UPDATE" }]);
    expect((await db.query("select content from skill_versions")).rows).toEqual([{ content: "old" }]);
  });

  it("keeps star/unstar triggers and nested playbook timestamp triggers working", async () => {
    await asRole("authenticated", `insert into playbook_stars(playbook_id,user_id) values ('${PB}','${OWNER}')`);
    expect((await db.query("select star_count from playbooks")).rows).toEqual([{ star_count: 1 }]);
    await asRole("authenticated", "delete from playbook_stars");
    expect((await db.query("select star_count from playbooks")).rows).toEqual([{ star_count: 0 }]);
  });

  it("preserves direct attachment CRUD and the ten-file limit", async () => {
    for (let i = 0; i < 10; i++) {
      await asRole("authenticated", `insert into skill_attachments(skill_id,filename,file_type,content,size_bytes)
        values ('${SKILL}','file-${i}','text','a',1)`);
    }
    await expect(asRole("authenticated", `insert into skill_attachments(skill_id,filename,file_type,content,size_bytes)
      values ('${SKILL}','overflow','text','a',1)`)).rejects.toThrow(/Maximum 10/);
    await asRole("authenticated", "update skill_attachments set description='changed', updated_at='2000-01-01'");
    expect((await db.query("select count(*)::int as n from skill_attachments where updated_at > '2020-01-01'")).rows).toEqual([{ n: 10 }]);
    await asRole("authenticated", "delete from skill_attachments");
  });

  it("preserves profile, secret and memory timestamps", async () => {
    await asRole("authenticated", "update profiles set display_name='Updated', updated_at='2000-01-01'");
    await asRole("service_role", `insert into memories(playbook_id,key,value) values ('${PB}','key','{}')`);
    await asRole("service_role", "update memories set updated_at='2000-01-01'");
    await asRole("service_role", `insert into secrets(playbook_id,name,encrypted_value,iv,auth_tag)
      values ('${PB}','test','test','test','test')`);
    await asRole("service_role", "update secrets set updated_at='2000-01-01'");
    for (const table of ["profiles", "memories", "secrets"]) {
      expect((await db.query(`select count(*)::int as n from ${table} where updated_at < '2020-01-01'`)).rows).toEqual([{ n: 0 }]);
    }
  });

  it("allows the server attachment helper even with a hostile caller search path", async () => {
    await asRole("service_role", `select public.add_skill_attachment('${SKILL}','server','text','árvíz')`);
    expect((await db.query("select size_bytes from skill_attachments where filename='server'")).rows).toEqual([{ size_bytes: 7 }]);
    if (hardened) {
      await db.exec("create temp table skill_attachments (like public.skill_attachments including all)");
      await db.exec("set search_path=pg_temp,public");
      await asRole("service_role", `select public.add_skill_attachment('${SKILL}','safe','text','x')`);
      expect((await db.query("select filename from public.skill_attachments where filename='safe'")).rows).toHaveLength(1);
      expect((await db.query("select * from pg_temp.skill_attachments")).rows).toHaveLength(0);
    }
  });

  it("restricts direct RPC calls while preserving trusted callers", async () => {
    // The newer memory-history trigger was already restricted separately.
    const legacyAcl = await db.query<{ anon: boolean; authenticated: boolean; service: boolean }>(`
      select has_function_privilege('anon',oid,'execute') as anon,
        has_function_privilege('authenticated',oid,'execute') as authenticated,
        has_function_privilege('service_role',oid,'execute') as service
      from pg_proc where pronamespace='public'::regnamespace and proname <> 'track_memory_history'`);
    expect(legacyAcl.rows).toHaveLength(10);
    for (const row of legacyAcl.rows) expect(row).toEqual({ anon: !hardened, authenticated: !hardened, service: true });
    if (hardened) {
      for (const role of ["anon", "authenticated"]) {
        await expect(asRole(role, `select public.add_skill_attachment('${SKILL}','denied','text','x')`)).rejects.toThrow(/permission denied for function/);
        await expect(asRole(role, `select public.increment_usage_count('unused','${SKILL}')`)).rejects.toThrow(/permission denied for function/);
      }
    }
    await asRole("service_role", `select public.increment_usage_count('unused','${SKILL}')`);
  });

  it("retains memory-history recording under the server role", async () => {
    await asRole("service_role", "update memories set value='{\"changed\":true}' where key='key'");
    expect((await db.query("select snapshot->'value' as value from memory_history")).rows).toEqual([{ value: {} }]);
  });

  it("rejects an unsafe schema before altering any function", async () => {
    await db.exec("begin; grant create on schema public to authenticated");
    try { await expect(db.exec(migration)).rejects.toThrow(/public schema is writable/); }
    finally { await db.exec("rollback"); }
  });
});
