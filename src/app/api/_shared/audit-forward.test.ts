import { describe, expect, it, vi } from "vitest";
import {
  rfc5424Syslog,
  siemSignature,
  forwardAuditLog,
  readAuditForwardConfig,
  SIEM_HMAC_KEY_MIN_BYTES,
} from "./audit-forward";
import { GENESIS_HASH, hashAuditEntry } from "@/lib/audit-chain";

const HMAC_KEY = "k".repeat(SIEM_HMAC_KEY_MIN_BYTES);

const entry = {
  id: "00000000-0000-4000-8000-000000000001",
  playbook_id: "11111111-1111-4111-8111-111111111111",
  operation: "secret.list",
  status: "success",
  created_at: "2026-08-19T09:12:44.000Z",
  prev_hash: GENESIS_HASH,
  hash: "",
  latency_ms: 0,
  actor_type: "owner",
  actor_id: "user-1",
};

entry.hash = hashAuditEntry(entry, GENESIS_HASH);

describe("audit forwarding", () => {
  it("builds RFC 5424 syslog with PRI 133 (local0 notice)", () => {
    const line = rfc5424Syslog("{}", "host.example", new Date("2026-08-19T09:12:44.000Z"));
    expect(line.startsWith("<133>1 2026-08-19T09:12:44.000Z host.example agentplaybooks - audit_log - {}")).toBe(true);
  });

  it("signs the webhook body with HMAC-SHA256", () => {
    expect(siemSignature('{"ok":true}', HMAC_KEY)).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it("refuses a short HMAC key (human passwords fail closed)", () => {
    expect(() => siemSignature("{}", "s3cret")).toThrow(/at least 32 bytes/);
    expect(() => readAuditForwardConfig({
      AUDIT_SIEM_WEBHOOK_SECRET: "x".repeat(SIEM_HMAC_KEY_MIN_BYTES - 1),
    })).toThrow(/at least 32 bytes/);
    expect(() => readAuditForwardConfig({
      AUDIT_SIEM_WEBHOOK_URL: "https://siem.example/hooks/audit",
    })).toThrow(/requires AUDIT_SIEM_WEBHOOK_SECRET/);
  });

  it("accepts a 32-byte random HMAC key from the env", () => {
    expect(readAuditForwardConfig({
      AUDIT_SIEM_WEBHOOK_URL: "https://siem.example/hooks/audit",
      AUDIT_SIEM_WEBHOOK_SECRET: HMAC_KEY,
    }).webhookHmacKey).toBe(HMAC_KEY);
  });

  it("posts to the SIEM webhook with the configured signature header and does not throw after retries", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, status: 204 });
    await forwardAuditLog(entry, {
      webhookUrl: "https://siem.example/hooks/audit",
      webhookHmacKey: HMAC_KEY,
      hmacHeader: "X-Custom-Sig",
    }, fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const first = fetchImpl.mock.calls[0][1] as { headers: Record<string, string>; body: string };
    expect(first.headers["X-Custom-Sig"]).toBe(siemSignature(first.body, HMAC_KEY));
    expect(JSON.parse(first.body).operation).toBe("secret.list");
  });

  it("is off when no destinations are configured", () => {
    expect(readAuditForwardConfig({})).toEqual({
      syslogUrl: undefined,
      syslogHostname: undefined,
      webhookUrl: undefined,
      webhookHmacKey: undefined,
      hmacHeader: "X-Audit-Signature",
    });
  });
});
