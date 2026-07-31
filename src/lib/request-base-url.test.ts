import { describe, expect, it } from "vitest";
import { buildSafeBaseUrl } from "@/lib/request-base-url";

describe("buildSafeBaseUrl", () => {
  it("uses allowed host from configured site url", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://agentplaybooks.com";

    expect(buildSafeBaseUrl("https", "agentplaybooks.com")).toBe("https://agentplaybooks.com");
  });

  it("rejects host header not in allow list", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://agentplaybooks.com";

    expect(buildSafeBaseUrl("https", "evil.com")).toBe("https://agentplaybooks.com");
  });

  it("rejects invalid host header syntax", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://agentplaybooks.com";

    expect(buildSafeBaseUrl("https", "agentplaybooks.com/path")).toBe("https://agentplaybooks.com");
  });

  it("defaults unknown protocol to https", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://agentplaybooks.com";

    expect(buildSafeBaseUrl("javascript", "agentplaybooks.com")).toBe("https://agentplaybooks.com");
  });
});
