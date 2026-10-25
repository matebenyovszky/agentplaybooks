import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "@/app/api/playbooks/[guid]/secrets/app";
import { getAuthenticatedUser, storedDisplayPrefix, validateApiKey } from "@/app/api/_shared/auth";
import { getPlaybookByGuid } from "@/app/api/_shared/guards";
import { getServiceSupabase } from "@/app/api/_shared/supabase";
import { federationAuditWriter } from "@/app/api/_shared/audit";
import {
  forwardAuditLog,
  rfc5424Syslog,
  SIEM_HMAC_KEY_MIN_BYTES,
} from "@/app/api/_shared/audit-forward";
import { formatAuditExport, type AuditChainEntry } from "@/lib/audit-chain";
import { getKeyPrefix } from "@/lib/utils";

vi.mock("@/app/api/_shared/auth", () => ({
  getAuthenticatedUser: vi.fn(),
  validateApiKey: vi.fn(),
  storedDisplayPrefix: vi.fn(),
}));
vi.mock("@/app/api/_shared/guards", () => ({
  getPlaybookByGuid: vi.fn(),
}));
vi.mock("@/app/api/_shared/supabase", () => ({
  getServiceSupabase: vi.fn(),
}));
vi.mock("@/lib/crypto", () => ({
  decryptSecret: vi.fn(),
  encryptSecret: vi.fn(),
}));

const RAW_API_KEY = "apb_live_LEAKCHECKRAWAPIKEY0000000000000000";
const KEY_PREFIX = getKeyPrefix(RAW_API_KEY);
const SECRET_PLAINTEXT = "vault-plaintext-MUST-NOT-APPEAR-in-audit-xyz";
const HMAC_KEY = "k".repeat(SIEM_HMAC_KEY_MIN_BYTES);
const PLAYBOOK = { id: "playbook1", guid: "guid1", user_id: "owner1" };

const stored: Record<string, unknown>[] = [];
const siemBodies: string[] = [];

function assertNoSecrets(payload: string, label: string) {
  expect(payload, label).not.toContain(RAW_API_KEY);
  expect(payload, label).not.toContain(SECRET_PLAINTEXT);
  expect(payload, label).not.toMatch(/Bearer\s+apb_live_LEAKCHECK/i);
}

function mockDb(secretRow: Record<string, unknown> | null) {
  vi.mocked(getServiceSupabase).mockReturnValue({
    from(table: string) {
      if (table === "audit_logs") {
        return {
          insert(row: Record<string, unknown>) {
            const saved = {
              id: `a0000000-0000-4000-8000-${String(stored.length + 1).padStart(12, "0")}`,
              created_at: "2026-08-19T09:12:44.000Z",
              prev_hash: "0".repeat(64),
              hash: "ab".repeat(32),
              ...row,
            };
            stored.push(saved);
            return {
              select: () => ({
                single: async () => ({ data: saved, error: null }),
              }),
            };
          },
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: secretRow,
          error: secretRow ? null : { message: "not found" },
        }),
        update: vi.fn().mockReturnValue({ eq: vi.fn() }),
      };
    },
  } as never);
}

describe("audit trail never stores API keys or secret plaintext", () => {
  beforeEach(async () => {
    stored.length = 0;
    siemBodies.length = 0;
    vi.clearAllMocks();
    const { decryptSecret } = await import("@/lib/crypto");
    vi.mocked(decryptSecret).mockResolvedValue(SECRET_PLAINTEXT);
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);
    vi.mocked(validateApiKey).mockResolvedValue({
      id: "key1",
      playbooks: { id: PLAYBOOK.id, guid: PLAYBOOK.guid },
      key_prefix: KEY_PREFIX,
    } as never);
    vi.mocked(storedDisplayPrefix).mockResolvedValue(KEY_PREFIX);
    vi.mocked(getPlaybookByGuid).mockResolvedValue(PLAYBOOK as never);
    mockDb({
      id: "sec1",
      name: "OPENAI_API_KEY",
      encrypted_value: "ciphertext",
      iv: "iv",
      auth_tag: "tag",
      allow_api_key_reveal: true,
      allowed_hosts: ["api.example.com"],
      use_count: 0,
      expires_at: null,
    });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("siem.example")) {
        return new Response(null, { status: 204 });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }));
  });

  afterEach(() => vi.unstubAllGlobals());

  it("keeps the raw API key and secret plaintext out of the row, exports, syslog, and SIEM body", async () => {
    const auth = { Authorization: `Bearer ${RAW_API_KEY}` };

    const reveal = await app.request("/api/playbooks/guid1/secrets/reveal/OPENAI_API_KEY", {
      method: "GET",
      headers: auth,
    });
    expect(reveal.status).toBe(200);
    expect((await reveal.json()).value).toBe(SECRET_PLAINTEXT);

    const use = await app.request("/api/playbooks/guid1/secrets/proxy", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        secret_name: "OPENAI_API_KEY",
        url: `https://api.example.com/v1/models?token=${SECRET_PLAINTEXT}`,
        method: "GET",
      }),
    });
    expect(use.status).toBe(200);

    await federationAuditWriter(PLAYBOOK.id, "ray-1")({
      serverId: "00000000-0000-4000-8000-0000000000aa",
      operation: "resources/read",
      target: `https://files.example.com/doc?token=${SECRET_PLAINTEXT}`,
      status: "success",
      latencyMs: 4,
    });

    expect(stored.length).toBeGreaterThanOrEqual(3);
    expect(stored.map((row) => row.operation)).toEqual(
      expect.arrayContaining(["secret.reveal", "secret.use", "resources/read"]),
    );
    expect(stored.find((row) => row.operation === "secret.use")?.target).toBe("api.example.com");
    expect(stored.find((row) => row.operation === "resources/read")?.target).toBe("files.example.com");
    expect(stored.find((row) => row.actor_type === "api_key")?.actor_id).toBe(KEY_PREFIX);

    const entries = stored as unknown as AuditChainEntry[];
    const dumps = [
      JSON.stringify(stored),
      formatAuditExport(entries, "json"),
      formatAuditExport(entries, "jsonl"),
      formatAuditExport(entries, "csv"),
    ];
    for (const [index, dump] of dumps.entries()) {
      assertNoSecrets(dump, `dump ${index}`);
    }

    for (const entry of entries) {
      const body = JSON.stringify((await import("@/lib/audit-chain")).auditLogToExportRow(entry));
      const syslog = rfc5424Syslog(body, "host.example");
      assertNoSecrets(syslog, "syslog");
      const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
        siemBodies.push(String(init?.body ?? ""));
        return new Response(null, { status: 204 });
      });
      await forwardAuditLog(entry, {
        webhookUrl: "https://siem.example/hooks/audit",
        webhookHmacKey: HMAC_KEY,
      }, fetchImpl as unknown as typeof fetch);
    }
    expect(siemBodies.length).toBe(entries.length);
    for (const body of siemBodies) {
      assertNoSecrets(body, "siem");
      expect(body).not.toContain(HMAC_KEY);
    }
  });
});
