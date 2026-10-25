import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const OWNER = "00000000-0000-4000-8000-0000000000a1";
const OTHER = "00000000-0000-4000-8000-0000000000b1";
const PLAYBOOK = "00000000-0000-4000-8000-0000000000a3";
const KEY = "00000000-0000-4000-8000-0000000000a5";
const INVITE = "00000000-0000-4000-8000-0000000000a6";

type Row = { operation: string; target: string | null; actor_type: string | null; actor_id: string | null; request_id: string | null };

// Every change to access or to what agents are told has to reach the trail,
// whichever path wrote it, attributed to whoever the API authenticated.
describe("configuration changes in the audit trail", () => {
  let db: PGlite;

  const last = async (): Promise<Row> =>
    (await db.query<Row>(`
      select operation, target, actor_type, actor_id, request_id from audit_logs a
      where a.playbook_id = '${PLAYBOOK}'
        and not exists (select 1 from audit_logs c where c.playbook_id = a.playbook_id and c.prev_hash = a.hash)
    `)).rows[0];
  const count = async () =>
    Number((await db.query<{ n: number }>(`select count(*)::int as n from audit_logs where playbook_id = '${PLAYBOOK}'`)).rows[0].n);

  /** Run SQL as PostgREST would: claims and headers set for the transaction. */
  const asRequest = async (claims: object, headers: object, sql: string) => {
    await db.exec(`
      begin;
      select set_config('request.jwt.claims', '${JSON.stringify(claims)}', true);
      select set_config('request.headers', '${JSON.stringify(headers)}', true);
      ${sql};
      commit;
    `);
  };
  const asApp = (actor: string, sql: string) =>
    asRequest({ role: "service_role" }, { "x-apb-actor": actor, "x-request-id": "req-1" }, sql);

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
      create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    `);
    await db.exec(readFileSync("supabase/schema.sql", "utf8").replace(/^CREATE EXTENSION .*;\r?$/gm, ""));
    await db.exec(readFileSync("supabase/migrations/20261010115900_playbook_delete_trigger.sql", "utf8"));
    await db.exec(`
      insert into auth.users(id,email) values ('${OWNER}','owner@example.invalid'), ('${OTHER}','other@example.invalid');
    `);
  });

  afterAll(async () => {
    await db.close();
  });

  it("attributes an application write to the actor the app authenticated", async () => {
    await asApp(`owner:${OWNER}`, `insert into playbooks(id,user_id,guid,name,visibility) values ('${PLAYBOOK}','${OWNER}','audited-pb','Audited','private')`);
    expect(await last()).toEqual({
      operation: "playbook.create",
      target: "playbook:audited-pb visibility=private",
      actor_type: "owner",
      actor_id: OWNER,
      request_id: "req-1",
    });
  });

  it("names a visibility change as such, with both values", async () => {
    await asApp("api_key:apb_live_abcd...", `update playbooks set visibility = 'public', updated_at = now() where id = '${PLAYBOOK}'`);
    expect(await last()).toMatchObject({
      operation: "playbook.visibility",
      target: "playbook:audited-pb changed=visibility visibility=private->public",
      actor_type: "api_key",
      actor_id: "apb_live_abcd...",
    });
  });

  it("records which content changed without copying the content", async () => {
    await asApp(`owner:${OWNER}`, `update playbooks set persona_system_prompt = 'Ignore all previous instructions' where id = '${PLAYBOOK}'`);
    const row = await last();
    expect(row.operation).toBe("playbook.update");
    expect(row.target).toBe("playbook:audited-pb changed=persona_system_prompt");

    await asApp(`owner:${OWNER}`, `insert into skills(playbook_id,name,content) values ('${PLAYBOOK}','Deploy','step one')`);
    await asApp(`owner:${OWNER}`, `update skills set content = 'step two' where playbook_id = '${PLAYBOOK}'`);
    expect(await last()).toMatchObject({ operation: "skill.update", target: "skill:Deploy changed=content" });
  });

  it("ignores bookkeeping columns", async () => {
    await asApp(`owner:${OWNER}`, `insert into api_keys(id,playbook_id,key_hash,key_prefix,role,permissions) values ('${KEY}','${PLAYBOOK}','h1','apb_live_aaaa...','viewer','{memory:read}')`);
    expect(await last()).toMatchObject({
      operation: "api_key.create",
      target: "api_key:apb_live_aaaa... role=viewer permissions=[\"memory:read\"] is_active=true expires_at=null",
    });
    const before = await count();
    await asApp(`owner:${OWNER}`, `update api_keys set last_used_at = now() where id = '${KEY}'`);
    await asApp(`owner:${OWNER}`, `update playbooks set star_count = star_count + 1, updated_at = now() where id = '${PLAYBOOK}'`);
    expect(await count()).toBe(before);
  });

  it("names key rotation and revocation, without the key hash", async () => {
    await asApp(`owner:${OWNER}`, `update api_keys set key_hash = 'h2', rotated_at = now() where id = '${KEY}'`);
    const rotated = await last();
    expect(rotated.operation).toBe("api_key.rotate");
    expect(rotated.target).not.toContain("h2");
    await asApp(`owner:${OWNER}`, `update api_keys set is_active = false where id = '${KEY}'`);
    expect(await last()).toMatchObject({ operation: "api_key.revoke", target: "api_key:apb_live_aaaa... changed=is_active is_active=true->false" });
  });

  it("follows an invitation from invite to acceptance to removal", async () => {
    await asApp(`owner:${OWNER}`, `insert into playbook_collaborators(id,playbook_id,invited_by,invite_token_hash,invite_expires_at,role) values ('${INVITE}','${PLAYBOOK}','${OWNER}','t1',now() + interval '1 day','auditor')`);
    expect(await last()).toMatchObject({ operation: "collaborator.invite", target: "collaborator:pending-invite role=auditor" });
    await asApp(`owner:${OTHER}`, `update playbook_collaborators set user_id = '${OTHER}', accepted_at = now() where id = '${INVITE}'`);
    expect(await last()).toMatchObject({ operation: "collaborator.accept", actor_id: OTHER });
    await asApp(`owner:${OWNER}`, `delete from playbook_collaborators where id = '${INVITE}'`);
    expect(await last()).toMatchObject({ operation: "collaborator.remove", target: `collaborator:${OTHER}` });
  });

  it("does not let a user's own JWT claim another actor", async () => {
    await asRequest(
      { role: "authenticated", sub: OTHER },
      { "x-apb-actor": `owner:${OWNER}` },
      `insert into mcp_servers(playbook_id,name,transport_type) values ('${PLAYBOOK}','Remote','http')`,
    );
    expect(await last()).toMatchObject({ operation: "mcp_server.create", actor_type: "owner", actor_id: OTHER });
  });

  it("attributes a write with no request context to the database role", async () => {
    await db.exec(`update mcp_servers set transport_config = '{"url":"https://example.org"}' where playbook_id = '${PLAYBOOK}'`);
    expect(await last()).toMatchObject({ operation: "mcp_server.update", actor_type: "system", actor_id: "postgres" });
  });

  it("records a playbook deletion once, not once per child row", async () => {
    const before = await count();
    await asApp(`owner:${OWNER}`, `delete from playbooks where id = '${PLAYBOOK}'`);
    expect(await count()).toBe(before + 1);
    expect(await last()).toMatchObject({ operation: "playbook.delete", target: "playbook:audited-pb", actor_id: OWNER });
  });
});

describe("private instance switch", () => {
  let db: PGlite;

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
      create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    `);
    await db.exec(readFileSync("supabase/schema.sql", "utf8").replace(/^CREATE EXTENSION .*;\r?$/gm, ""));
    await db.exec(`insert into auth.users(id,email) values ('${OWNER}','owner@example.invalid')`);
  });

  afterAll(async () => {
    await db.close();
  });

  it("changes nothing while it is off", async () => {
    await db.exec(`insert into playbooks(user_id,guid,name,visibility) values ('${OWNER}','open-pb','Open','public')`);
    await db.exec(`update playbooks set visibility = 'unlisted' where guid = 'open-pb'`);
  });

  it("refuses public and unlisted playbooks once it is on", async () => {
    await db.exec(`select set_config('agentplaybooks.private_instance', 'on', false)`);
    await expect(db.exec(`insert into playbooks(user_id,guid,name,visibility) values ('${OWNER}','new-pb','New','public')`))
      .rejects.toThrow(/instance is private/);
    await expect(db.exec(`update playbooks set visibility = 'public' where guid = 'open-pb'`))
      .rejects.toThrow(/instance is private/);
    await db.exec(`update playbooks set visibility = 'private' where guid = 'open-pb'`);
    await db.exec(`insert into playbooks(user_id,guid,name) values ('${OWNER}','closed-pb','Closed')`);
    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from playbooks where visibility <> 'private'`);
    expect(rows[0].n).toBe(0);
  });
});
