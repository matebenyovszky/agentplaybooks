import { afterEach, describe, expect, it, vi } from "vitest";
import { auditedFetch, noteAuditActor, runWithAuditRequest } from "@/lib/audit-context";

describe("audit actor on database writes", () => {
  const sent: Headers[] = [];
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
    sent.length = 0;
  });

  const capture = () => {
    globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      sent.push(new Headers(init?.headers));
      return new Response("[]");
    }) as typeof fetch;
  };

  it("names the authenticated caller on a write made while handling its request", async () => {
    capture();
    const request = new Request("https://app.test/api/playbooks/x", { headers: { "x-request-id": "req-9" } });
    await runWithAuditRequest(request, async () => {
      await Promise.resolve();
      noteAuditActor(request, { type: "api_key", id: "apb_live_abcd..." });
      await auditedFetch("https://db.test/rest/v1/skills", { method: "PATCH", headers: { apikey: "k" } });
    });
    expect(sent[0].get("x-apb-actor")).toBe("api_key:apb_live_abcd...");
    expect(sent[0].get("x-apb-request-id")).toBe("req-9");
    expect(sent[0].get("apikey")).toBe("k");
  });

  it("prefers the signed-in user over a key presented on the same request", async () => {
    capture();
    const request = new Request("https://app.test/api/x");
    await runWithAuditRequest(request, async () => {
      noteAuditActor(request, { type: "owner", id: "user-1" });
      noteAuditActor(request, { type: "api_key", id: "apb_live_abcd..." });
      await auditedFetch("https://db.test/rest/v1/playbooks", { method: "POST" });
    });
    expect(sent[0].get("x-apb-actor")).toBe("owner:user-1");
  });

  it("adds nothing to reads, or outside a request", async () => {
    capture();
    const request = new Request("https://app.test/api/x");
    noteAuditActor(request, { type: "owner", id: "user-1" });
    await runWithAuditRequest(request, () => auditedFetch("https://db.test/rest/v1/playbooks", { method: "GET" }));
    await auditedFetch("https://db.test/rest/v1/playbooks", { method: "POST" });
    expect(sent.map((headers) => headers.get("x-apb-actor"))).toEqual([null, null]);
  });

  it("keeps two concurrent requests apart", async () => {
    capture();
    const first = new Request("https://app.test/api/1");
    const second = new Request("https://app.test/api/2");
    noteAuditActor(first, { type: "owner", id: "first" });
    noteAuditActor(second, { type: "owner", id: "second" });
    await Promise.all([
      runWithAuditRequest(first, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        await auditedFetch("https://db.test/rest/v1/a", { method: "POST" });
      }),
      runWithAuditRequest(second, () => auditedFetch("https://db.test/rest/v1/b", { method: "POST" })),
    ]);
    expect(sent.map((headers) => headers.get("x-apb-actor")).sort()).toEqual(["owner:first", "owner:second"]);
  });
});
