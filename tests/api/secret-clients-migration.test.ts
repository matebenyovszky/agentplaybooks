import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const A = "00000000-0000-4000-8000-000000000001";
const B = "00000000-0000-4000-8000-000000000002";
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE playbooks (id uuid PRIMARY KEY); INSERT INTO playbooks VALUES ('${A}'), ('${B}');`);
  await db.exec(readFileSync("supabase/migrations/20261010081252_secret_clients.sql", "utf8"));
  const verification = readFileSync("scripts/verify-production-schema.sql", "utf8").split("DO $verify_secret_clients$")[1];
  await db.exec(`DO $verify_secret_clients$${verification}`);
}, 30000);
afterAll(async () => { await db?.close(); });

describe("certificate client schema and access", () => {
  it("enforces fingerprint, scope, uniqueness and tenant relationships", async () => {
    const insert = "INSERT INTO secret_clients(playbook_id,name,certificate_sha256,secret_names) VALUES ($1,'test',$2,$3)";
    await db.query(insert, [A, "ab".repeat(32), ["TOKEN"]]);
    await expect(db.query(insert, [A, "ab".repeat(32), ["TOKEN"]])).rejects.toThrow();
    await db.query(insert, [B, "ab".repeat(32), ["OTHER"]]);
    await expect(db.query(insert, [A, "bad", ["TOKEN"]])).rejects.toThrow();
    await expect(db.query(insert, [A, "cd".repeat(32), []])).rejects.toThrow();
    const result = await db.query<{ relrowsecurity: boolean }>("SELECT relrowsecurity FROM pg_class WHERE oid='secret_clients'::regclass");
    expect(result.rows[0].relrowsecurity).toBe(true);
  });
  it("refuses direct public and authenticated database reads and writes", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`SET ROLE ${role}`);
      try {
        await expect(db.query("SELECT * FROM secret_clients")).rejects.toThrow(/permission denied/);
        await expect(db.query("UPDATE secret_clients SET is_active=true")).rejects.toThrow(/permission denied/);
      } finally { await db.exec("RESET ROLE"); }
    }
  });
  it("allows service-role revocation and cascades playbook deletion", async () => {
    await db.exec("SET ROLE service_role");
    try {
      await db.query("UPDATE secret_clients SET is_active=false WHERE playbook_id=$1", [A]);
      const rows = await db.query<{ is_active: boolean }>("SELECT is_active FROM secret_clients WHERE playbook_id=$1", [A]);
      expect(rows.rows[0].is_active).toBe(false);
    } finally { await db.exec("RESET ROLE"); }
    await db.query("DELETE FROM playbooks WHERE id=$1", [A]);
    expect((await db.query("SELECT id FROM secret_clients WHERE playbook_id=$1", [A])).rows).toHaveLength(0);
    expect((await db.query("SELECT id FROM secret_clients WHERE playbook_id=$1", [B])).rows).toHaveLength(1);
  });
});
