import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const OWNER = "00000000-0000-4000-8000-0000000000aa";
const PLAYBOOK = "00000000-0000-4000-8000-000000000001";
const RUN = "00000000-0000-4000-8000-0000000000cc";

let db: PGlite;

beforeAll(async () => {
  const { pgcrypto } = await import("@electric-sql/pglite/contrib/pgcrypto");
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS extensions;
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role BYPASSRLS;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT current_setting('test.uid', true)::uuid $$;
    CREATE TABLE playbooks (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL,
      guid text NOT NULL
    );
    INSERT INTO playbooks VALUES ('${PLAYBOOK}', '${OWNER}', 'content-audit');
    CREATE TABLE memories (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      playbook_id uuid NOT NULL REFERENCES playbooks(id) ON DELETE CASCADE,
      key text NOT NULL,
      value jsonb NOT NULL DEFAULT '{}'::jsonb,
      updated_at timestamptz DEFAULT now(),
      access_count integer DEFAULT 0,
      last_accessed_at timestamptz,
      search_text text
    );
    CREATE TABLE canvas (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      playbook_id uuid NOT NULL REFERENCES playbooks(id) ON DELETE CASCADE,
      name text NOT NULL,
      slug text NOT NULL,
      content text NOT NULL DEFAULT '',
      updated_at timestamptz DEFAULT now(),
      run_id uuid NOT NULL
    );
    CREATE TABLE audit_logs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      playbook_id uuid NOT NULL,
      operation text NOT NULL,
      target text,
      status text NOT NULL,
      actor_type text,
      actor_id text,
      request_id text,
      created_at timestamptz DEFAULT now() NOT NULL
    );
  `);
  await db.exec(readFileSync("supabase/migrations/20261025200000_audit_content_writes.sql", "utf8"));
}, 30000);

afterAll(async () => {
  await db?.close();
});

describe("memory and canvas audit triggers", () => {
  it("records create/update/delete of a memory key without copying the body", async () => {
    await db.exec(`INSERT INTO memories (playbook_id, key, value)
      VALUES ('${PLAYBOOK}', 'decision', '{"text":"secret-body"}')`);
    await db.exec(`UPDATE memories SET value = '{"text":"changed"}' WHERE key = 'decision'`);
    await db.exec(`UPDATE memories SET access_count = 3 WHERE key = 'decision'`);
    await db.exec(`DELETE FROM memories WHERE key = 'decision'`);

    const { rows } = await db.query<{ operation: string; target: string }>(
      `SELECT operation, target FROM audit_logs WHERE playbook_id = '${PLAYBOOK}' ORDER BY created_at, id`,
    );
    expect(rows.map((row) => row.operation)).toEqual([
      "memory.create",
      "memory.update",
      "memory.delete",
    ]);
    expect(rows[0].target).toContain("memory:decision");
    expect(rows.some((row) => /secret-body/.test(row.target))).toBe(false);
    expect(rows[1].target).toMatch(/changed=value/);
  });

  it("records canvas slug changes without copying document content", async () => {
    await db.exec(`INSERT INTO canvas (playbook_id, name, slug, content, run_id)
      VALUES ('${PLAYBOOK}', 'Notes', 'notes', 'private-canvas-body', '${RUN}')`);
    await db.exec(`UPDATE canvas SET content = 'rewritten' WHERE slug = 'notes'`);
    await db.exec(`UPDATE canvas SET updated_at = now() WHERE slug = 'notes'`);
    await db.exec(`DELETE FROM canvas WHERE slug = 'notes'`);

    const { rows } = await db.query<{ operation: string; target: string }>(
      `SELECT operation, target FROM audit_logs WHERE operation LIKE 'canvas.%' ORDER BY created_at, id`,
    );
    expect(rows.map((row) => row.operation)).toEqual([
      "canvas.create",
      "canvas.update",
      "canvas.delete",
    ]);
    expect(rows[0].target).toContain("canvas:notes");
    expect(rows.some((row) => /private-canvas-body|rewritten/.test(row.target))).toBe(false);
  });
});
