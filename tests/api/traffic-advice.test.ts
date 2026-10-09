import { describe, expect, it } from "vitest";
import { GET } from "@/app/.well-known/traffic-advice/route";

describe("traffic-advice absence", () => {
  it("preserves 404 without rendering a Next error page", async () => {
    const response = GET();
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=300");
  });
});
