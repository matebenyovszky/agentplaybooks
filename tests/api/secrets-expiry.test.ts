import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "@/app/api/playbooks/[guid]/secrets/app";
import { getAuthenticatedUser, validateApiKey } from "@/app/api/_shared/auth";
import { getPlaybookByGuid } from "@/app/api/_shared/guards";
import { getServiceSupabase } from "@/app/api/_shared/supabase";
import { recordSecretAudit } from "@/app/api/_shared/audit";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { isSecretExpired } from "@/lib/secret-expiry";

/**
 * An expired secret cannot be used: not proxied, not revealed to an API key.
 * Before this, `expires_at` was stored and shown as a badge in the dashboard,
 * but nothing on the server compared it to the clock.
 */

vi.mock("@/app/api/_shared/auth", () => ({ getAuthenticatedUser: vi.fn(), validateApiKey: vi.fn() }));
vi.mock("@/app/api/_shared/guards", () => ({ getPlaybookByGuid: vi.fn() }));
vi.mock("@/app/api/_shared/supabase", () => ({ getServiceSupabase: vi.fn() }));
vi.mock("@/lib/crypto", () => ({ encryptSecret: vi.fn(), decryptSecret: vi.fn() }));
vi.mock("@/app/api/_shared/audit", async (original) => ({
  ...await original<object>(), recordSecretAudit: vi.fn().mockResolvedValue(undefined),
}));

const PAST = "2020-01-01T00:00:00.000Z";
const FUTURE = "2999-01-01T00:00:00.000Z";

const fetchMock = vi.fn();
const update = vi.fn();
let secret: Record<string, unknown>;

function asApiKey() {
  vi.mocked(getAuthenticatedUser).mockResolvedValue(null);
  vi.mocked(validateApiKey).mockResolvedValue({ playbooks: { id: "pb1" }, key_prefix: "apb_live" } as never);
}

function asOwner() {
  vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: "owner1" } as never);
  vi.mocked(validateApiKey).mockResolvedValue(null);
}

function proxy() {
  return app.request("/api/playbooks/guid1/secrets/proxy", {
    method: "POST",
    headers: { Authorization: "Bearer apb_live_test", "Content-Type": "application/json" },
    body: JSON.stringify({ secret_name: "MODEL_KEY", url: "https://api.example.com/chat", method: "GET" }),
  });
}

function reveal() {
  return app.request("/api/playbooks/guid1/secrets/reveal/MODEL_KEY", {
    method: "GET",
    headers: { Authorization: "Bearer apb_live_test" },
  });
}

function rotate(body: Record<string, unknown>) {
  return app.request("/api/playbooks/guid1/secrets/MODEL_KEY", {
    method: "PUT",
    headers: { Authorization: "Bearer apb_live_test", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function lastAuditReason() {
  const calls = vi.mocked(recordSecretAudit).mock.calls;
  return (calls.at(-1)?.[1] as { reason?: string } | undefined)?.reason;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(new Response("ok", { status: 200 }));
  asApiKey();
  vi.mocked(getPlaybookByGuid).mockResolvedValue({ id: "pb1", user_id: "owner1" } as never);
  vi.mocked(decryptSecret).mockResolvedValue("vault-provider-key");
  vi.mocked(encryptSecret).mockResolvedValue({ encrypted_value: "e", iv: "i", auth_tag: "t" } as never);
  secret = {
    id: "sec1",
    name: "MODEL_KEY",
    allowed_hosts: ["api.example.com"],
    allow_api_key_reveal: true,
    use_count: 0,
    expires_at: null,
  };
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(async () => ({ data: secret, error: null })),
    update: update.mockReturnThis(),
  };
  vi.mocked(getServiceSupabase).mockReturnValue({ from: vi.fn(() => query) } as never);
});
afterEach(() => vi.unstubAllGlobals());

describe("the expiry comparison", () => {
  it("treats a past date as expired and a future one or none as live", () => {
    expect(isSecretExpired(PAST)).toBe(true);
    expect(isSecretExpired(FUTURE)).toBe(false);
    expect(isSecretExpired(null)).toBe(false);
    expect(isSecretExpired(undefined)).toBe(false);
  });

  it("expires at the instant itself, not a moment after", () => {
    const at = Date.parse("2026-10-10T12:00:00.000Z");
    expect(isSecretExpired("2026-10-10T12:00:00.000Z", at)).toBe(true);
    expect(isSecretExpired("2026-10-10T12:00:00.000Z", at - 1)).toBe(false);
  });

});

describe("using an expired secret", () => {
  it("refuses to proxy it, before the value is ever decrypted", async () => {
    secret.expires_at = PAST;
    const response = await proxy();

    expect(response.status).toBe(403);
    expect((await response.json()).error).toContain("expired");
    expect(decryptSecret).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(lastAuditReason()).toBe("expired");
  });

  it("still proxies a secret whose expiry is in the future", async () => {
    secret.expires_at = FUTURE;
    const response = await proxy();

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("refuses to reveal it to an API key, even one allowed to reveal", async () => {
    secret.expires_at = PAST;
    const response = await reveal();

    expect(response.status).toBe(403);
    expect(decryptSecret).not.toHaveBeenCalled();
    expect(lastAuditReason()).toBe("expired");
  });

  it("lets the owner read it, which is how it gets replaced", async () => {
    asOwner();
    secret.expires_at = PAST;
    const response = await reveal();

    expect(response.status).toBe(200);
    expect((await response.json()).value).toBe("vault-provider-key");
  });
});

// The expiry is the owner's rule, not part of the value: `apb secrets push`
// rotates with `{ value }` alone and documents that the expiry survives.
describe("rotating and the expiry", () => {
  it("keeps the expiry when a rotation does not mention it", async () => {
    const response = await rotate({ value: "new-value" });

    expect(response.status).toBe(200);
    expect(update.mock.calls[0]?.[0]).not.toHaveProperty("expires_at");
  });

  it("sets a later expiry, which brings an expired secret back", async () => {
    const response = await rotate({ value: "new-value", expires_at: FUTURE });

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ expires_at: FUTURE }));
  });

  it("clears the expiry when given null", async () => {
    const response = await rotate({ expires_at: null });

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ expires_at: null }));
  });
});
