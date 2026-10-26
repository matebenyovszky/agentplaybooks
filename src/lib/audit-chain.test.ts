import { describe, expect, it } from "vitest";
import {
  AUDIT_CHAIN_FIELDS,
  GENESIS_HASH,
  buildAuditChain,
  canonicalAuditJson,
  formatAuditCsv,
  formatAuditJsonl,
  hashAuditEntry,
  parseAuditExportFormat,
  orderByChainLinks,
  verifyAuditChain,
} from "./audit-chain";
import { auditRetentionDays, roleMayPerform, roleMayReadAudit, roleMayReadSecrets, roleMayWrite } from "./audit-access";

const base = {
  playbook_id: "11111111-1111-4111-8111-111111111111",
  operation: "secret.use",
  status: "success" as const,
  created_at: "2026-08-19T09:12:44.000Z",
  latency_ms: 12,
  actor_type: "owner",
  actor_id: "user-1",
  secret_name: "OPENAI_API_KEY",
  target: "api.openai.com",
  mcp_server_id: null,
  error_code: null,
  request_id: "ray-1",
};

describe("canonical audit JSON", () => {
  it("keeps nulls, alphabetical keys, and millisecond UTC timestamps", () => {
    const json = canonicalAuditJson({
      ...base,
      id: "22222222-2222-4222-8222-222222222222",
      created_at: "2026-08-19T09:12:44+00:00",
    }, GENESIS_HASH);
    expect(JSON.parse(json)).toEqual({
      actor_id: "user-1",
      actor_type: "owner",
      created_at: "2026-08-19T09:12:44.000Z",
      error_code: null,
      id: "22222222-2222-4222-8222-222222222222",
      latency_ms: 12,
      mcp_server_id: null,
      operation: "secret.use",
      playbook_id: base.playbook_id,
      prev_hash: GENESIS_HASH,
      request_id: "ray-1",
      secret_name: "OPENAI_API_KEY",
      status: "success",
      target: "api.openai.com",
    });
    expect(Object.keys(JSON.parse(json))).toEqual([...AUDIT_CHAIN_FIELDS]);
    expect(json).not.toContain(" ");
  });
});

describe("hash chain build and verify", () => {
  it("links each row to the previous hash and verifies", () => {
    const chained = buildAuditChain([
      { ...base, id: "a0000000-0000-4000-8000-000000000001", created_at: "2026-08-19T09:12:44.000Z" },
      { ...base, id: "a0000000-0000-4000-8000-000000000002", created_at: "2026-08-19T09:12:45.000Z", operation: "secret.reveal" },
    ]);
    expect(chained[0].prev_hash).toBe(GENESIS_HASH);
    expect(chained[1].prev_hash).toBe(chained[0].hash);
    expect(chained[0].hash).toBe(hashAuditEntry(chained[0], GENESIS_HASH));
    expect(verifyAuditChain(chained).ok).toBe(true);
    expect(verifyAuditChain(chained).checked).toBe(2);
  });

  it("orders by prev_hash links when created_at ties would shuffle UUID ids", () => {
    const chained = buildAuditChain([
      { ...base, id: "f0000000-0000-4000-8000-000000000002", created_at: "2026-08-19T09:12:44.000Z" },
      { ...base, id: "f0000000-0000-4000-8000-000000000001", created_at: "2026-08-19T09:12:44.000Z", operation: "secret.reveal" },
    ]);
    const shuffled = [chained[1], chained[0]];
    expect(orderByChainLinks(shuffled).map((row) => row.id)).toEqual([chained[0].id, chained[1].id]);
    expect(verifyAuditChain(orderByChainLinks(shuffled)).ok).toBe(true);
    expect(verifyAuditChain(shuffled).ok).toBe(false);
  });

  it("reports the first broken prev_hash link", () => {
    const chained = buildAuditChain([
      { ...base, id: "b0000000-0000-4000-8000-000000000001", created_at: "2026-08-19T09:12:44.000Z" },
      { ...base, id: "b0000000-0000-4000-8000-000000000002", created_at: "2026-08-19T09:12:45.000Z" },
    ]);
    chained[1].prev_hash = GENESIS_HASH;
    const report = verifyAuditChain(chained);
    expect(report.ok).toBe(false);
    expect(report.broken).toMatchObject({
      index: 1,
      id: chained[1].id,
      reason: "prev_hash",
      expected: chained[0].hash,
      actual: GENESIS_HASH,
    });
  });

  it("detects a tampered field that does not match the stored hash", () => {
    const chained = buildAuditChain([
      { ...base, id: "c0000000-0000-4000-8000-000000000001", created_at: "2026-08-19T09:12:44.000Z" },
    ]);
    chained[0].target = "evil.example";
    const report = verifyAuditChain(chained);
    expect(report.ok).toBe(false);
    expect(report.broken).toMatchObject({ index: 0, reason: "hash", actual: chained[0].hash });
    expect(report.broken?.expected).not.toBe(chained[0].hash);
  });

  it("verifies a remaining suffix against a retention checkpoint", () => {
    const chained = buildAuditChain([
      { ...base, id: "d0000000-0000-4000-8000-000000000001", created_at: "2026-08-19T09:12:44.000Z" },
      { ...base, id: "d0000000-0000-4000-8000-000000000002", created_at: "2026-08-19T09:12:45.000Z" },
      { ...base, id: "d0000000-0000-4000-8000-000000000003", created_at: "2026-08-19T09:12:46.000Z" },
    ]);
    const remaining = chained.slice(1);
    expect(verifyAuditChain(remaining, chained[0].hash).ok).toBe(true);
    expect(verifyAuditChain(remaining).ok).toBe(false);
  });
});

describe("export formats", () => {
  it("writes JSONL one object per line and CSV with a header", () => {
    const chained = buildAuditChain([
      { ...base, id: "e0000000-0000-4000-8000-000000000001", created_at: "2026-08-19T09:12:44.000Z" },
    ]);
    const jsonl = formatAuditJsonl(chained);
    expect(jsonl.split("\n").filter(Boolean)).toHaveLength(1);
    expect(JSON.parse(jsonl).operation).toBe("secret.use");
    expect(JSON.parse(jsonl).hash).toBe(chained[0].hash);

    const csv = formatAuditCsv(chained);
    const [header, row] = csv.trim().split("\n");
    expect(header).toContain("prev_hash");
    expect(row).toContain(chained[0].hash);
    expect(row).toContain("secret.use");
  });

  it("quotes CSV cells that contain commas", () => {
    const chained = buildAuditChain([
      { ...base, id: "f0000000-0000-4000-8000-000000000001", target: "host,with,commas" },
    ]);
    expect(formatAuditCsv(chained)).toContain('"host,with,commas"');
  });

  it("exports untrusted formula-like text as a literal spreadsheet cell", () => {
    for (const target of ["=1+1", "+cmd", "-1+2", "@SUM(1)", "\t=1+1"]) {
      const entry = { ...base, id: "f0000000-0000-4000-8000-000000000002", target };
      const csv = formatAuditCsv([entry]);
      expect(csv).toContain(`'${target}`);
      expect(JSON.parse(formatAuditJsonl([entry])).target).toBe(target);
    }
  });

  it("accepts ndjson as an alias of jsonl", () => {
    expect(parseAuditExportFormat("ndjson")).toBe("jsonl");
    expect(parseAuditExportFormat("CSV")).toBe("csv");
    expect(parseAuditExportFormat("nope")).toBeNull();
  });
});

describe("auditor role capabilities", () => {
  it("lets auditors read audit and metadata, nothing else", () => {
    expect(roleMayReadAudit("auditor")).toBe(true);
    expect(roleMayWrite("auditor")).toBe(false);
    expect(roleMayReadSecrets("auditor")).toBe(false);
    expect(roleMayPerform("auditor", "audit:read")).toBe(true);
    expect(roleMayPerform("auditor", "playbooks:read")).toBe(true);
    expect(roleMayPerform("auditor", "playbooks:write")).toBe(false);
    expect(roleMayPerform("auditor", "secrets:read")).toBe(false);
    expect(roleMayPerform("editor", "playbooks:write")).toBe(true);
    expect(roleMayPerform("editor", "secrets:read")).toBe(true);
    expect(roleMayWrite("editor")).toBe(true);
  });
});

describe("retention env", () => {
  it("keeps forever when unset, zero, or non-numeric", () => {
    expect(auditRetentionDays({})).toBeNull();
    expect(auditRetentionDays({ AUDIT_RETENTION_DAYS: "0" })).toBeNull();
    expect(auditRetentionDays({ AUDIT_RETENTION_DAYS: "forever" })).toBeNull();
    expect(auditRetentionDays({ AUDIT_RETENTION_DAYS: "nope" })).toBeNull();
    expect(auditRetentionDays({ AUDIT_RETENTION_DAYS: "365" })).toBe(365);
  });
});
