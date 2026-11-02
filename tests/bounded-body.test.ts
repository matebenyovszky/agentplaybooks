import { describe, expect, it, vi } from "vitest";
import { BodySizeLimitError, readBoundedText } from "@/lib/bounded-body";

describe("bounded request bodies", () => {
  it("cancels an oversized chunked upload before buffering the remainder", async () => {
    const cancel = vi.fn();
    let reads = 0;
    const body = new ReadableStream({ pull(controller) {
      reads++;
      controller.enqueue(new Uint8Array(1024));
    }, cancel }, { highWaterMark: 0 });
    await expect(readBoundedText(body, 1500)).rejects.toBeInstanceOf(BodySizeLimitError);
    expect(reads).toBe(2);
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("handles an empty body and decoder output at EOF", async () => {
    await expect(readBoundedText(null, 100)).resolves.toEqual({ text: "", truncated: false });
    const body = new ReadableStream({ start(controller) {
      controller.enqueue(new Uint8Array([97, 0xc3])); controller.close();
    } });
    await expect(readBoundedText(body, 100, 1)).resolves.toEqual({ text: "a", truncated: true });
  });
});
