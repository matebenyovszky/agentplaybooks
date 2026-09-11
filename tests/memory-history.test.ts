import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { literalMemoryPattern, memoryTimestamp, memoryWriteFields, parseMemorySearch } from "@/lib/memory";

const A = "00000000-0000-4000-8000-000000000001";
const B = "00000000-0000-4000-8000-000000000002";
let db: PGlite;

beforeAll(async () => {
  db = new PGlite({ extensions: { pg_trgm } });
  const schema = readFileSync("supabase/schema.sql", "utf8");
  const memories = schema.match(/CREATE TABLE IF NOT EXISTS public\.memories \([\s\S]*?\n\);/)?.[0];
  if (!memories) throw new Error("Missing baseline memory schema");
  await db.exec(`
    CREATE SCHEMA extensions;
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE public.playbooks(id uuid PRIMARY KEY);
    ${memories.replace("extensions.uuid_generate_v4()", "gen_random_uuid()")}
    ALTER TABLE memories ADD PRIMARY KEY(id);
    ALTER TABLE memories ADD UNIQUE(playbook_id, key);
    ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
    GRANT SELECT, INSERT, UPDATE, DELETE ON memories TO service_role;
    INSERT INTO playbooks VALUES ('${A}'), ('${B}');
    INSERT INTO memories(playbook_id,key,value,updated_at) VALUES
      ('${A}', 'legacy', '{"text":"old"}', '2026-01-01T10:00:00Z');
  `);
  await db.exec(readFileSync("supabase/migrations/20260911042912_memory_time_and_history.sql", "utf8"));
}, 30000);
afterAll(async () => { await db?.close(); });

describe("memory time and history in PostgreSQL", () => {
  it("backfills old records and defaults new memory times", async () => {
    const legacy = await db.query<{ time: string }>("SELECT memory_at::text AS time FROM memories WHERE key='legacy'");
    expect(new Date(legacy.rows[0].time).toISOString()).toBe("2026-01-01T10:00:00.000Z");
    const created = await db.query<{ valid: boolean }>("INSERT INTO memories(playbook_id,key,value) VALUES ($1,'default','{}') RETURNING memory_at BETWEEN now()-interval '1 minute' AND now()+interval '1 minute' AS valid", [A]);
    expect(created.rows[0].valid).toBe(true);
  });

  it("retains the previous content and its explicit time atomically", async () => {
    await db.query("INSERT INTO memories(playbook_id,key,value,memory_at) VALUES ($1,'coffee',$2,'2020-01-01T12:00:00Z')", [A, { preference: "cukor nélkül" }]);
    await db.exec("SET ROLE service_role");
    try {
      await db.query("UPDATE memories SET value=$1, memory_at='2026-09-11T12:00:00Z' WHERE key='coffee'", [{ preference: "egy cukorral" }]);
      const entries = await db.query<{ value: { preference: string }; is_archived: boolean; history_id: string | null; memory_at: Date }>("SELECT * FROM memory_entries WHERE playbook_id=$1 AND key='coffee' ORDER BY memory_at", [A]);
      expect(entries.rows).toHaveLength(2);
      expect(entries.rows[0].value.preference).toBe("cukor nélkül");
      expect(entries.rows[0].is_archived).toBe(true);
      expect(entries.rows[0].history_id).not.toBeNull();
      expect(new Date(entries.rows[0].memory_at).getUTCFullYear()).toBe(2020);
      expect(entries.rows[1].history_id).toBeNull();
    } finally { await db.exec("RESET ROLE"); }
  });

  it("restores earlier contents and time while keeping the replaced current version", async () => {
    await db.query("INSERT INTO memories(playbook_id,key,value,memory_at) VALUES ($1,'restore-example','{\"version\":1}','2020-01-01T00:00:00Z')", [A]);
    await db.exec("UPDATE memories SET value='{\"version\":2}',memory_at='2026-09-11T00:00:00Z' WHERE key='restore-example'");
    const old = (await db.query<{ memory_id: string; value: unknown; memory_at: Date }>("SELECT memory_id,value,memory_at FROM memory_entries WHERE key='restore-example' AND history_id IS NOT NULL")).rows[0];
    await db.query("UPDATE memories SET value=$1,memory_at=$2,is_archived=false WHERE id=$3", [old.value, old.memory_at, old.memory_id]);
    const current = (await db.query<{ value: unknown; memory_at: Date }>("SELECT value,memory_at FROM memory_entries WHERE key='restore-example' AND NOT is_archived")).rows;
    expect(current).toHaveLength(1);
    expect(current[0].value).toEqual({ version: 1 });
    expect(new Date(current[0].memory_at).getUTCFullYear()).toBe(2020);
    const history = (await db.query<{ value: unknown }>("SELECT value FROM memory_entries WHERE key='restore-example' AND history_id IS NOT NULL")).rows;
    expect(history).toHaveLength(2);
    expect(history.map(row => row.value)).toContainEqual({ version: 2 });
  });

  it("does not manufacture revisions from reads or archive/priority changes", async () => {
    const before = await db.query("SELECT id FROM memory_history");
    await db.exec("UPDATE memories SET access_count=access_count+1,last_accessed_at=now(),priority=80,is_archived=true WHERE key='coffee'");
    expect((await db.query("SELECT id FROM memory_history")).rows).toHaveLength(before.rows.length);
    expect((await db.query("SELECT id FROM memory_entries WHERE key='coffee' AND NOT is_archived")).rows).toHaveLength(0);
    await db.exec("UPDATE memories SET is_archived=false WHERE key='coffee'");
    expect((await db.query("SELECT id FROM memory_entries WHERE key='coffee' AND NOT is_archived")).rows).toHaveLength(1);
  });

  it("searches JSON contents and archived versions separately with literal special characters", async () => {
    await db.query("INSERT INTO memories(playbook_id,key,value) VALUES ($1,'literal',$2)", [A, { text: "100%_ready (a,b)" }]);
    const pattern = literalMemoryPattern("100%_ready (a,b)");
    expect((await db.query("SELECT key FROM memory_entries WHERE playbook_id=$1 AND NOT is_archived AND search_text ILIKE $2", [A, pattern])).rows).toEqual([{ key: "literal" }]);
    expect((await db.query("SELECT key FROM memory_entries WHERE playbook_id=$1 AND NOT is_archived AND search_text ILIKE '%cukor nélkül%'", [A])).rows).toHaveLength(0);
    expect((await db.query("SELECT key FROM memory_entries WHERE playbook_id=$1 AND is_archived AND search_text ILIKE '%cukor nélkül%'", [A])).rows).toEqual([{ key: "coffee" }]);
  });

  it("retains a stable parent link across a key rename and cascades only explicit deletion", async () => {
    await db.exec("UPDATE memories SET key='coffee-new' WHERE key='coffee'");
    const history = await db.query("SELECT h.id FROM memory_history h JOIN memories m ON m.id=h.memory_id WHERE m.key='coffee-new'");
    expect(history.rows.length).toBeGreaterThan(0);
    await db.query("INSERT INTO memories(playbook_id,key,value) VALUES ($1,'coffee-new','{}')", [B]);
    await db.query("DELETE FROM memories WHERE playbook_id=$1 AND key='coffee-new'", [A]);
    expect((await db.query("SELECT * FROM memory_history WHERE snapshot->>'key' IN ('coffee','coffee-new')")).rows).toHaveLength(0);
    expect((await db.query("SELECT id FROM memories WHERE playbook_id=$1 AND key='coffee-new'", [B])).rows).toHaveLength(1);
  });

  it("does not expose history or the service view to public database roles", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`SET ROLE ${role}`);
      try {
        await expect(db.query("SELECT * FROM memory_history")).rejects.toThrow(/permission denied/);
        await expect(db.query("SELECT * FROM memory_entries")).rejects.toThrow(/permission denied/);
      } finally { await db.exec("RESET ROLE"); }
    }
  });

  it("rolls history back if the enclosing write transaction fails", async () => {
    const before = (await db.query("SELECT id FROM memory_history")).rows.length;
    await db.exec("BEGIN");
    await db.exec("UPDATE memories SET value='{\"changed\":true}' WHERE key='legacy'");
    await db.exec("ROLLBACK");
    expect((await db.query("SELECT id FROM memory_history")).rows).toHaveLength(before);
    expect((await db.query<{ value: unknown }>("SELECT value FROM memories WHERE key='legacy'")).rows[0].value).toEqual({ text: "old" });
  });
});

describe("memory inputs", () => {
  it("normalizes explicit timezones and rejects ambiguous or impossible dates", () => {
    expect(memoryTimestamp("2026-09-11T12:00:00+02:00")).toBe("2026-09-11T10:00:00.000Z");
    for (const value of [null, 1, "", "tomorrow", "2026-09-11T12:00", "2026-02-30T12:00:00Z"]) {
      expect(() => memoryTimestamp(value)).toThrow();
    }
  });
  it("defaults content writes to now and leaves maintenance-only timestamps alone", () => {
    expect(memoryWriteFields({ value: {} }).memory_at).toBeDefined();
    expect(memoryWriteFields({ is_archived: true })).toEqual({ is_archived: true });
    expect(() => memoryWriteFields({ is_archived: "false" })).toThrow();
  });
  it("bounds search and defaults to current, visible memories", () => {
    expect(parseMemorySearch({})).toEqual({ scope: "active" });
    expect(parseMemorySearch({ scope: "archived", tags: "one,two", offset: "100" })).toEqual({ scope: "archived", tags: ["one", "two"], offset: 100 });
    expect(() => parseMemorySearch({ limit: 201 })).toThrow();
    expect(() => parseMemorySearch({ scope: "unknown" })).toThrow();
    expect(() => parseMemorySearch({ after: "2026-09-12T00:00:00Z", before: "2026-09-11T00:00:00Z" })).toThrow();
  });
});
