import { describe, expect, it, vi } from "vitest";
import { MAX_PROXY_RESPONSE_BYTES, readSecretProxyResponse } from "@/lib/secret-proxy-response";

describe("bounded buffered secret proxy responses", () => {
  it("rejects oversized JSON before parsing and cancels the upstream", async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(MAX_PROXY_RESPONSE_BYTES + 1)); }, cancel,
    }), { headers: { "Content-Type": "application/json", "Content-Length": "1" } });
    await expect(readSecretProxyResponse(response)).rejects.toMatchObject({ name: "ProxyResponseTooLargeError" });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("stops reading text after its prefix even when the upstream never ends", async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode("a".repeat(10_001))); }, cancel,
    }));
    await expect(readSecretProxyResponse(response)).resolves.toBe("a".repeat(10_000) + "\n... (truncated)");
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("decodes UTF-8 split across chunks and preserves JSON and exact-length text", async () => {
    const bytes = new TextEncoder().encode('{"value":"árvíz😀"}');
    let offset = 0;
    const response = new Response(new ReadableStream({ pull(controller) {
      if (offset === bytes.length) controller.close();
      else controller.enqueue(bytes.subarray(offset, ++offset));
    } }), { headers: { "Content-Type": "application/json" } });
    await expect(readSecretProxyResponse(response)).resolves.toEqual({ value: "árvíz😀" });
    await expect(readSecretProxyResponse(new Response("a".repeat(10_000)))).resolves.toBe("a".repeat(10_000));
  });
});
