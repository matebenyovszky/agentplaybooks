import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { orderByChainLinks, verifyAuditChain, type AuditChainEntry } from "@/lib/audit-chain";

const USER = "00000000-0000-4000-8000-0000000000a1";
const PROFILE = "00000000-0000-4000-8000-0000000000a2";
const PLAYBOOK = "00000000-0000-4000-8000-0000000000a3";
const SERVER = "00000000-0000-4000-8000-0000000000a4";

// Deleting what a trail describes must not delete the trail, and nothing but
// retention may remove a row: the chain is only evidence if its rows stay put.
describe("audit trail tamper resistance in PostgreSQL", () => {
  let db: PGlite;

  const count = async (sql: string) =>
    Number(((await db.query<{ n: number }>(`select count(*)::int as n from ${sql}`)).rows[0]).n);

  const chain = async () => {
    const { rows } = await db.query<AuditChainEntry & { created_at: Date | string }>(
      `select * from audit_logs where playbook_id = '${PLAYBOOK}'`,
    );
    const entries = rows.map((row) => ({ ...row, created_at: new Date(row.created_at).toISOString() }));
    const checkpoint = await db.query<{ anchor_hash: string }>(
      `select anchor_hash from audit_chain_checkpoints where playbook_id = '${PLAYBOOK}' order by checkpoint_seq desc limit 1`,
    );
    const start = checkpoint.rows[0]?.anchor_hash;
    return verifyAuditChain(orderByChainLinks(entries, start), start);
  };

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
    await db.exec(readFileSync("supabase/migrations/20260913173449_harden_public_functions.sql", "utf8"));
    await db.exec(readFileSync("supabase/migrations/20261002120000_review_proposals.sql", "utf8"));
    await db.exec(readFileSync("supabase/migrations/20261010115900_playbook_delete_trigger.sql", "utf8"));
    await db.exec(readFileSync("supabase/migrations/20261010120000_delete_account.sql", "utf8"));
    await db.exec(`grant all on all tables in schema public to service_role;`);
    // The airgap stack grants everything to service_role after schema.sql;
    // the revoke has to survive being run again after such a grant.
    await db.exec(readFileSync("deploy/airgap/grants.sql", "utf8"));

    await db.exec(`
      insert into auth.users(id,email) values ('${USER}','user@example.invalid');
      insert into profiles(id,auth_user_id,display_name) values ('${PROFILE}','${USER}','User');
      insert into playbooks(id,user_id,guid,name,publisher_id) values ('${PLAYBOOK}','${USER}','audited-pb','Audited','${PROFILE}');
      insert into mcp_servers(id,playbook_id,name) values ('${SERVER}','${PLAYBOOK}','Remote');
      insert into audit_logs(playbook_id,operation,status,actor_type,actor_id,secret_name)
        values ('${PLAYBOOK}','secret.create','success','owner','${USER}','API_KEY');
      insert into audit_logs(playbook_id,mcp_server_id,operation,status,target)
        values ('${PLAYBOOK}','${SERVER}','tools/call','success','example.org');
      insert into audit_logs(playbook_id,operation,status,actor_type,actor_id,secret_name)
        values ('${PLAYBOOK}','secret.use','denied','api_key','apb_live_abcd...','API_KEY');
    `);
  });

  afterAll(async () => {
    await db.close();
  });

  it("keeps a federated server's call rows when the server is deleted", async () => {
    await db.exec(`delete from mcp_servers where id = '${SERVER}'`);
    expect(await count(`audit_logs where mcp_server_id = '${SERVER}'`)).toBe(1);
    expect((await chain()).ok).toBe(true);
  });

  it("refuses DELETE and TRUNCATE outside retention, even for the table owner", async () => {
    await expect(db.exec(`delete from audit_logs where playbook_id = '${PLAYBOOK}'`)).rejects.toThrow(/outside retention/);
    await expect(db.exec(`truncate audit_logs`)).rejects.toThrow(/outside retention/);
    await expect(db.exec(`update audit_logs set status = 'success'`)).rejects.toThrow(/immutable/);
    // playbook.create, mcp_server.create, the three rows above, mcp_server.delete
    expect(await count(`audit_logs where playbook_id = '${PLAYBOOK}'`)).toBe(6);
  });

  it("gives the API roles no way to change or remove history", async () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      for (const table of ["audit_logs", "audit_chain_checkpoints"]) {
        for (const privilege of ["UPDATE", "DELETE", "TRUNCATE"]) {
          const { rows } = await db.query<{ ok: boolean }>(
            `select has_table_privilege('${role}', 'public.${table}', '${privilege}') as ok`,
          );
          expect(rows[0].ok, `${role} ${privilege} ${table}`).toBe(false);
        }
      }
    }
  });

  it("lets retention remove a prefix, with a checkpoint that cannot be edited", async () => {
    const { rows } = await db.query<{ result: { purged: number } }>(
      `select purge_audit_logs(now() + interval '1 day', '${PLAYBOOK}') as result`,
    );
    expect(rows[0].result.purged).toBe(6);
    expect(await count(`audit_logs where playbook_id = '${PLAYBOOK}' and operation = 'audit.retention_purge'`)).toBe(1);
    expect(await count(`audit_chain_checkpoints where playbook_id = '${PLAYBOOK}'`)).toBe(1);
    expect((await chain()).ok).toBe(true);

    await expect(db.exec(`delete from audit_chain_checkpoints`)).rejects.toThrow(/cannot be changed/);
    await expect(db.exec(`update audit_chain_checkpoints set purged_count = 0`)).rejects.toThrow(/cannot be changed/);
    await expect(db.exec(`truncate audit_chain_checkpoints`)).rejects.toThrow(/cannot be changed/);
  });

  it("keeps the trail, and its chain, when the account and its playbooks are deleted", async () => {
    await db.query(`select delete_account('${USER}')`);
    expect(await count(`playbooks where id = '${PLAYBOOK}'`)).toBe(0);
    expect(await count(`audit_logs where playbook_id = '${PLAYBOOK}'`)).toBe(2);
    expect(await count(`audit_logs where playbook_id = '${PLAYBOOK}' and operation = 'playbook.delete'`)).toBe(1);
    expect(await count(`audit_chain_checkpoints where playbook_id = '${PLAYBOOK}'`)).toBe(1);
    expect((await chain()).ok).toBe(true);
  });
});
