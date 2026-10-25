import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { canonicalAuditJson, GENESIS_HASH, hashAuditCanonical } from "@/lib/audit-chain";

const OWNER = "00000000-0000-4000-8000-0000000000aa";
const AUDITOR = "00000000-0000-4000-8000-0000000000bb";
const PLAYBOOK = "00000000-0000-4000-8000-000000000001";
const ID1 = "00000000-0000-4000-8000-000000000011";
const ID2 = "00000000-0000-4000-8000-000000000012";

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
      user_id uuid NOT NULL
    );
    INSERT INTO playbooks VALUES ('${PLAYBOOK}', '${OWNER}');
    CREATE TABLE mcp_servers (id uuid PRIMARY KEY);
    CREATE TABLE audit_logs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      playbook_id uuid NOT NULL REFERENCES playbooks(id) ON DELETE CASCADE,
      mcp_server_id uuid,
      operation text NOT NULL,
      target text,
      status text NOT NULL,
      latency_ms integer DEFAULT 0 NOT NULL,
      error_code text,
      request_id text,
      created_at timestamptz DEFAULT now() NOT NULL,
      actor_type text,
      actor_id text,
      secret_name text
    );
    CREATE TABLE playbook_collaborators (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      playbook_id uuid NOT NULL REFERENCES playbooks(id),
      user_id uuid,
      invited_by uuid NOT NULL,
      invite_token_hash text NOT NULL,
      invite_expires_at timestamptz NOT NULL,
      accepted_at timestamptz,
      created_at timestamptz DEFAULT now() NOT NULL
    );
    CREATE TABLE api_keys (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      playbook_id uuid,
      role text DEFAULT 'viewer' NOT NULL
    );
    ALTER TABLE api_keys ADD CONSTRAINT api_keys_role_check CHECK (role IN ('viewer', 'coworker', 'proposer', 'admin'));
    ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Owners can read audit logs" ON audit_logs FOR SELECT
      USING (EXISTS (SELECT 1 FROM playbooks WHERE playbooks.id = audit_logs.playbook_id AND playbooks.user_id = auth.uid()));
    GRANT SELECT ON audit_logs TO authenticated;
    GRANT SELECT ON playbooks TO authenticated;
    GRANT ALL ON playbook_collaborators TO authenticated;
  `);
  await db.exec(`INSERT INTO audit_logs (id, playbook_id, operation, status, created_at, actor_type, actor_id)
    VALUES
    ('${ID1}', '${PLAYBOOK}', 'secret.use', 'success', '2026-01-01T00:00:00.000Z', 'owner', '${OWNER}'),
    ('${ID2}', '${PLAYBOOK}', 'secret.list', 'success', '2026-01-02T00:00:00.000Z', 'owner', '${OWNER}');`);
  await db.exec(readFileSync("supabase/migrations/20261024120000_audit_logs_compliance.sql", "utf8"));
}, 30000);

afterAll(async () => {
  await db?.close();
});

describe("audit compliance migration", () => {
  it("backfills a per-playbook hash chain that matches the TypeScript canonical JSON", async () => {
    const rows = await db.query<{
      id: string;
      playbook_id: string;
      operation: string;
      status: string;
      created_at: string;
      actor_type: string;
      actor_id: string;
      prev_hash: string;
      hash: string;
      latency_ms: number;
      mcp_server_id: string | null;
      target: string | null;
      error_code: string | null;
      secret_name: string | null;
      request_id: string | null;
    }>("SELECT * FROM audit_logs ORDER BY created_at, id");
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows[0].prev_hash).toBe(GENESIS_HASH);
    const firstCanonical = canonicalAuditJson(rows.rows[0], GENESIS_HASH);
    expect(rows.rows[0].hash).toBe(hashAuditCanonical(firstCanonical));
    expect(rows.rows[1].prev_hash).toBe(rows.rows[0].hash);
    expect(createHash("sha256").update(canonicalAuditJson(rows.rows[1], rows.rows[0].hash), "utf8").digest("hex")).toBe(rows.rows[1].hash);
  });

  it("purges a prefix, stores a checkpoint, and writes an audit.retention_purge row", async () => {
    const result = await db.query<{ purged: number }>(
      "SELECT (purge_audit_logs('2026-01-01T12:00:00Z', $1, 'system', 'retention')->>'purged')::int AS purged",
      [PLAYBOOK],
    );
    expect(result.rows[0].purged).toBe(1);
    const remaining = await db.query<{ operation: string; prev_hash: string }>(
      "SELECT operation, prev_hash FROM audit_logs ORDER BY created_at, id",
    );
    expect(remaining.rows.map((row) => row.operation)).toEqual(["secret.list", "audit.retention_purge"]);
    const checkpoint = await db.query<{ anchor_hash: string; purged_count: number }>(
      "SELECT anchor_hash, purged_count FROM audit_chain_checkpoints",
    );
    expect(checkpoint.rows[0].purged_count).toBe(1);
    expect(remaining.rows[0].prev_hash).toBe(checkpoint.rows[0].anchor_hash);
  });

  it("lets an auditor SELECT via RLS and refuses writes", async () => {
    await db.query(
      `INSERT INTO playbook_collaborators (playbook_id, user_id, invited_by, invite_token_hash, invite_expires_at, accepted_at, role)
       VALUES ($1, $2, $3, 'hash', now() + interval '1 day', now(), 'auditor')`,
      [PLAYBOOK, AUDITOR, OWNER],
    );
    await db.exec(`SELECT set_config('test.uid', '${AUDITOR}', false); SET ROLE authenticated;`);
    try {
      const readable = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM audit_logs");
      expect(readable.rows[0].n).toBeGreaterThan(0);
      await expect(db.query("UPDATE audit_logs SET operation = 'tamper'")).rejects.toThrow();
      await expect(db.query("INSERT INTO audit_logs (id, playbook_id, operation, status) VALUES (gen_random_uuid(), $1, 'tamper', 'success')", [PLAYBOOK])).rejects.toThrow();
    } finally {
      await db.exec("RESET ROLE");
    }

    const stranger = "00000000-0000-4000-8000-0000000000cc";
    await db.exec(`SELECT set_config('test.uid', '${stranger}', false); SET ROLE authenticated;`);
    try {
      const hidden = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM audit_logs");
      expect(hidden.rows[0].n).toBe(0);
    } finally {
      await db.exec("RESET ROLE");
    }
  });

  it("chains sequential inserts that share a transaction timestamp", async () => {
    const pb = "00000000-0000-4000-8000-0000000000dd";
    await db.exec(`INSERT INTO playbooks VALUES ('${pb}', '${OWNER}')`);
    await db.exec("BEGIN");
    await db.exec(
      `INSERT INTO audit_logs (playbook_id, operation, status) VALUES ('${pb}', 'secret.create', 'success')`,
    );
    await db.exec(
      `INSERT INTO audit_logs (playbook_id, operation, status) VALUES ('${pb}', 'secret.use', 'success')`,
    );
    await db.exec(
      `INSERT INTO audit_logs (playbook_id, operation, status) VALUES ('${pb}', 'secret.reveal', 'denied')`,
    );
    await db.exec("COMMIT");
    const rows = await db.query<{ operation: string; prev_hash: string; hash: string }>(
      `SELECT operation, prev_hash, hash FROM audit_logs WHERE playbook_id = '${pb}' ORDER BY created_at, id`,
    );
    expect(rows.rows).toHaveLength(3);
    expect(rows.rows[0].prev_hash).toBe(GENESIS_HASH);
    expect(rows.rows[1].prev_hash).toBe(rows.rows[0].hash);
    expect(rows.rows[2].prev_hash).toBe(rows.rows[1].hash);
    expect(new Set(rows.rows.map((row) => row.hash)).size).toBe(3);
  });
});
