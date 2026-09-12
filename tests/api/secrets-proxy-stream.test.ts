import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "@/app/api/playbooks/[guid]/secrets/app";
import { getAuthenticatedUser, validateApiKey } from "@/app/api/_shared/auth";
import { getPlaybookByGuid } from "@/app/api/_shared/guards";
import { getServiceSupabase } from "@/app/api/_shared/supabase";
import { recordSecretAudit } from "@/app/api/_shared/audit";
import { decryptSecret } from "@/lib/crypto";

vi.mock("@/app/api/_shared/auth", () => ({ getAuthenticatedUser: vi.fn(), validateApiKey: vi.fn() }));
vi.mock("@/app/api/_shared/guards", () => ({ getPlaybookByGuid: vi.fn() }));
vi.mock("@/app/api/_shared/supabase", () => ({ getServiceSupabase: vi.fn() }));
vi.mock("@/lib/crypto", () => ({ encryptSecret: vi.fn(), decryptSecret: vi.fn() }));
vi.mock("@/app/api/_shared/audit", async (original) => ({
  ...await original<object>(), recordSecretAudit: vi.fn().mockResolvedValue(undefined),
}));

const path = "/api/playbooks/guid1/secrets/proxy";
const encoder = new TextEncoder();
const fetchMock = vi.fn();
const update = vi.fn();
let secret: Record<string, unknown>;

function request(overrides: Record<string, unknown> = {}, signal?: AbortSignal) {
  return app.request(path, {
    method: "POST", signal,
    headers: { Authorization: "Bearer apb_live_test", "Content-Type": "application/json" },
    body: JSON.stringify({
      secret_name: "MODEL_KEY", url: "https://api.example.com/chat", method: "POST",
      response_mode: "stream", body: { stream: true, messages: [] }, ...overrides,
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(getAuthenticatedUser).mockResolvedValue(null);
  vi.mocked(validateApiKey).mockResolvedValue({ playbooks: { id: "pb1" }, key_prefix: "apb_live" } as never);
  vi.mocked(getPlaybookByGuid).mockResolvedValue({ id: "pb1", user_id: "owner1" } as never);
  vi.mocked(decryptSecret).mockResolvedValue("vault-provider-key");
  secret = { id: "sec1", name: "MODEL_KEY", allowed_hosts: ["api.example.com"], use_count: 2 };
  const query = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    single: vi.fn(async () => ({ data: secret, error: null })),
    update: update.mockReturnThis(),
  };
  vi.mocked(getServiceSupabase).mockReturnValue({ from: vi.fn(() => query) } as never);
});
afterEach(() => vi.unstubAllGlobals());

describe("Direct HTTP vault streaming", () => {
  it("delivers the first chunk before upstream completion or accounting, without truncation", async () => {
    let upstream!: ReadableStreamDefaultController<Uint8Array>;
    fetchMock.mockResolvedValue(new Response(new ReadableStream<Uint8Array>({
      start(controller) { upstream = controller; },
    }), { headers: { "Content-Type": "text/event-stream", "Set-Cookie": "provider=private", "X-Key": "vault-provider-key" } }));
    const response = await request({ extra_headers: { authorization: "override" } });
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(response.headers.get("Cache-Control")).toContain("no-transform");
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(response.headers.get("X-Key")).toBeNull();
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.get("Authorization")).toBe("Bearer vault-provider-key");
    expect(init.redirect).toBe("manual");
    expect(JSON.parse(init.body).stream).toBe(true);
    const reader = response.body!.getReader();
    const first = encoder.encode('data: {"text":"Helló"}\n\n');
    upstream.enqueue(first);
    expect((await reader.read()).value).toEqual(first);
    expect(update).not.toHaveBeenCalled();
    expect(recordSecretAudit).not.toHaveBeenCalled();
    const large = encoder.encode("data: " + "x".repeat(20000) + "\n\n");
    upstream.enqueue(large);
    upstream.close();
    expect((await reader.read()).value).toEqual(large);
    expect((await reader.read()).done).toBe(true);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ use_count: 3 }));
    expect(recordSecretAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: "success" }));
  });

  it("cancels upstream when the consumer cancels, including during a pending read", async () => {
    const cancel = vi.fn();
    fetchMock.mockResolvedValue(new Response(new ReadableStream({ cancel })));
    const response = await request();
    const reader = response.body!.getReader();
    const pending = reader.read();
    await reader.cancel();
    await pending;
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(recordSecretAudit).toHaveBeenCalledTimes(1);
    expect(recordSecretAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ reason: "client_cancelled" }));
  });

  it("does not drain upstream ahead of a slow consumer", async () => {
    const pull = vi.fn((controller: ReadableStreamDefaultController<Uint8Array>) => {
      controller.enqueue(encoder.encode("data: next\n\n"));
    });
    fetchMock.mockResolvedValue(new Response(new ReadableStream({ pull }, { highWaterMark: 0 })));
    const response = await request();
    expect(pull).not.toHaveBeenCalled();
    const reader = response.body!.getReader();
    await reader.read();
    expect(pull).toHaveBeenCalledTimes(1);
    await reader.cancel();
  });

  it("propagates a browser abort even if the consumer stops reading", async () => {
    const cancel = vi.fn();
    fetchMock.mockResolvedValue(new Response(new ReadableStream({ cancel })));
    const abort = new AbortController();
    const response = await request({}, abort.signal);
    abort.abort();
    await expect(response.text()).rejects.toThrow("Proxy stream interrupted");
    expect(cancel).toHaveBeenCalledOnce();
    expect(recordSecretAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ reason: "client_cancelled" }));
  });

  it("times out a stalled stream after headers", async () => {
    fetchMock.mockResolvedValue(new Response(new ReadableStream()));
    const response = await request({ timeout_ms: 25 });
    await expect(response.text()).rejects.toThrow("Proxy stream interrupted");
    expect(recordSecretAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ reason: "timeout" }));
  });

  it("reports stream failure without exposing the provider exception", async () => {
    let upstream!: ReadableStreamDefaultController<Uint8Array>;
    fetchMock.mockResolvedValue(new Response(new ReadableStream<Uint8Array>({ start(c) { upstream = c; } })));
    const response = await request();
    upstream.error(new Error("vault-provider-key"));
    await expect(response.text()).rejects.toThrow("Upstream response stream failed");
    expect(recordSecretAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ reason: "stream_failed" }));
  });

  it("preserves upstream error status and JSON body in stream mode", async () => {
    fetchMock.mockResolvedValue(new Response('{"error":"rate limited"}', {
      status: 429, headers: { "Content-Type": "application/json", "Retry-After": "10" },
    }));
    const response = await request();
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("10");
    expect(await response.json()).toEqual({ error: "rate limited" });
    expect(recordSecretAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ reason: "upstream_http_error" }));
  });

  it("supports bodyless responses", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const response = await request();
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(recordSecretAudit).toHaveBeenCalledTimes(1);
  });

  it("keeps the existing buffered JSON envelope by default", async () => {
    fetchMock.mockResolvedValue(Response.json({ answer: "ok" }));
    const response = await request({ response_mode: undefined });
    expect(await response.json()).toEqual({ status: 200, status_text: "", body: { answer: "ok" } });
  });

  it.each(["http://localhost/x", "http://192.168.1.2/x", "https://elsewhere.example/chat"])("refuses forbidden destination %s before decrypting", async (url) => {
    expect((await request({ url })).status).toBeGreaterThanOrEqual(400);
    expect(decryptSecret).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires authorization for the same playbook", async () => {
    vi.mocked(validateApiKey).mockResolvedValue({ playbooks: { id: "other" } } as never);
    expect((await request()).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts the owner's browser session without an APB API key", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: "owner1" });
    fetchMock.mockResolvedValue(Response.json({ ok: true }));
    expect(await (await request()).json()).toEqual({ ok: true });
    expect(validateApiKey).not.toHaveBeenCalled();
  });

  it("refuses redirects and hides their response body and Location", async () => {
    fetchMock.mockResolvedValue(new Response("vault-provider-key", { status: 302, headers: { Location: "https://evil.example" } }));
    const response = await request();
    expect(response.status).toBe(502);
    expect(response.headers.get("Location")).toBeNull();
    expect(await response.text()).not.toContain("vault-provider-key");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("does not serve provider HTML as active same-origin content", async () => {
    fetchMock.mockResolvedValue(new Response("<script>alert(1)</script>", { headers: { "Content-Type": "text/html" } }));
    const response = await request();
    expect(response.headers.get("Content-Type")).toBe("application/octet-stream");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    await response.text();
  });

  it.each([{ response_mode: "typo" }, { timeout_ms: -1 }, { method: 42 }])("rejects invalid options %j", async (options) => {
    expect((await request(options)).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers browser CORS preflight", async () => {
    const response = await app.request(path, { method: "OPTIONS", headers: {
      Origin: "https://agentplaybooks.ai", "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization,content-type",
    } });
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://agentplaybooks.ai");
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain("Authorization");
  });
});
