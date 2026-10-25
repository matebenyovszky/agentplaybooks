import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const LEAVER = "00000000-0000-4000-8000-0000000000a1";
const STAYER = "00000000-0000-4000-8000-0000000000b1";
const LEAVER_PB = "00000000-0000-4000-8000-0000000000a3";
const STAYER_PB = "00000000-0000-4000-8000-0000000000b3";

// Offboarding has to stop every credential an account stands behind, and only
// those: the colleague's keys and certificates keep working.
describe("account offboarding in PostgreSQL", () => {
  let db: PGlite;
  const one = async <T>(sql: string) => (await db.query<{ v: T }>(sql)).rows[0].v;

  beforeAll(async () => {
    db = new PGlite({ extensions: { pg_trgm, pgcrypto } });
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create role supabase_auth_admin;
      create schema auth;
      create schema extensions;
      create extension pgcrypto with schema extensions;
      create function extensions.uuid_generate_v4() returns uuid language sql as 'select gen_random_uuid()';
      create function auth.uid() returns uuid language sql as
        'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
      create function auth.role() returns text language sql as 'select current_user::text';
      create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}',
        banned_until timestamptz, deleted_at timestamptz);
    `);
    await db.exec(readFileSync("supabase/schema.sql", "utf8").replace(/^CREATE EXTENSION .*;\r?$/gm, ""));
    await db.exec(readFileSync("supabase/migrations/20261010081252_secret_clients.sql", "utf8"));
    await db.exec(`
      insert into auth.users(id,email) values ('${LEAVER}','leaver@example.invalid'), ('${STAYER}','stayer@example.invalid');
      insert into playbooks(id,user_id,guid,name) values ('${LEAVER_PB}','${LEAVER}','leaver-pb','Leaver'), ('${STAYER_PB}','${STAYER}','stayer-pb','Stayer');
      insert into api_keys(playbook_id,key_hash,key_prefix) values ('${LEAVER_PB}','h1','apb_live_aaaa...'), ('${STAYER_PB}','h2','apb_live_bbbb...');
      insert into user_api_keys(user_id,key_hash,key_prefix) values ('${LEAVER}','h3','apb_live_cccc...'), ('${STAYER}','h4','apb_live_dddd...');
      insert into secret_clients(playbook_id,name,certificate_sha256,secret_names) values
        ('${LEAVER_PB}','laptop','${"a".repeat(64)}','{TOKEN}'), ('${STAYER_PB}','server','${"b".repeat(64)}','{TOKEN}');
    `);
  });

  afterAll(async () => {
    await db.close();
  });

  it("treats only a present, unbanned, undeleted account as active", async () => {
    expect(await one<boolean>(`select account_is_active('${LEAVER}') as v`)).toBe(true);
    await db.exec(`update auth.users set banned_until = now() + interval '100 years' where id = '${LEAVER}'`);
    expect(await one<boolean>(`select account_is_active('${LEAVER}') as v`)).toBe(false);
    await db.exec(`update auth.users set banned_until = now() - interval '1 day' where id = '${LEAVER}'`);
    expect(await one<boolean>(`select account_is_active('${LEAVER}') as v`)).toBe(true);
    await db.exec(`update auth.users set deleted_at = now() where id = '${STAYER}'`);
    expect(await one<boolean>(`select account_is_active('${STAYER}') as v`)).toBe(false);
    await db.exec(`update auth.users set deleted_at = null where id = '${STAYER}'`);
    expect(await one<boolean>(`select account_is_active('00000000-0000-4000-8000-0000000000ff') as v`)).toBe(false);
  });

  it("revokes every credential of the account and nobody else's", async () => {
    const result = await one<Record<string, number>>(`select revoke_account_credentials('${LEAVER}') as v`);
    expect(result).toEqual({ user_api_keys: 1, playbook_api_keys: 1, secret_clients: 1 });
    const active = async (table: string, column: string, id: string) =>
      one<number>(`select count(*)::int as v from ${table} where ${column} = '${id}' and is_active`);
    expect(await active("api_keys", "playbook_id", LEAVER_PB)).toBe(0);
    expect(await active("user_api_keys", "user_id", LEAVER)).toBe(0);
    expect(await active("secret_clients", "playbook_id", LEAVER_PB)).toBe(0);
    expect(await active("api_keys", "playbook_id", STAYER_PB)).toBe(1);
    expect(await active("user_api_keys", "user_id", STAYER)).toBe(1);
    expect(await active("secret_clients", "playbook_id", STAYER_PB)).toBe(1);
  });

  it("records the playbook key revocation in the audit trail", async () => {
    expect(await one<number>(`select count(*)::int as v from audit_logs where playbook_id = '${LEAVER_PB}' and operation = 'api_key.revoke'`)).toBe(1);
  });

  it("is idempotent", async () => {
    expect(await one<Record<string, number>>(`select revoke_account_credentials('${LEAVER}') as v`))
      .toEqual({ user_api_keys: 0, playbook_api_keys: 0, secret_clients: 0 });
  });

  it("cannot be called by the browser roles", async () => {
    for (const fn of ["account_is_active(uuid)", "revoke_account_credentials(uuid)"]) {
      const { rows } = await db.query<{ anon: boolean; authenticated: boolean; service: boolean }>(`
        select has_function_privilege('anon', 'public.${fn}', 'execute') as anon,
               has_function_privilege('authenticated', 'public.${fn}', 'execute') as authenticated,
               has_function_privilege('service_role', 'public.${fn}', 'execute') as service`);
      expect(rows[0], fn).toEqual({ anon: false, authenticated: false, service: true });
    }
  });
});
