import { describe, expect, it } from "vitest";
import { applyCanvasPatch, slugifyCanvasName } from "@/lib/canvas";

describe("canvas helpers", () => {
  it("creates stable URL slugs", () => {
    expect(slugifyCanvasName("  PR Review – Áttekintés  ")).toBe("pr-review-attekintes");
  });

  it("appends and prepends content", () => {
    expect(applyCanvasPatch("first", { operation: "append", content: "second" })).toBe("first\nsecond");
    expect(applyCanvasPatch("second", { operation: "prepend", content: "first" })).toBe("first\nsecond");
  });

  it("replaces one exact passage", () => {
    expect(applyCanvasPatch("before old after", { operation: "replace", search: "old", content: "new" }))
      .toBe("before new after");
  });

  it("rejects missing and ambiguous passages", () => {
    expect(() => applyCanvasPatch("text", { operation: "replace", search: "missing", content: "new" })).toThrow("not found");
    expect(() => applyCanvasPatch("same same", { operation: "replace", search: "same", content: "new" })).toThrow("exactly one");
  });
});
