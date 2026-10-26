import { describe, expect, it } from "vitest";
import { resolveAllowedOrigins } from "./hono";

describe("resolveAllowedOrigins", () => {
  it("falls back to the project's own domains when ALLOWED_ORIGINS is unset", () => {
    const origins = resolveAllowedOrigins(undefined, undefined);
    expect(origins).toContain("https://agentplaybooks.ai");
    expect(origins).toContain("https://apbks.com");
  });

  it("trusts only a self-hosted APP_URL, not the project's public sites", () => {
    const origins = resolveAllowedOrigins(undefined, "https://example.test");
    expect(origins).toEqual(["https://example.test"]);
    expect(origins).not.toContain("https://agentplaybooks.ai");
  });

  it("keeps the hosted list when APP_URL is one of this project's sites", () => {
    const origins = resolveAllowedOrigins(undefined, "https://agentplaybooks.ai");
    expect(origins[0]).toBe("https://agentplaybooks.ai");
    expect(origins).toContain("https://apbks.com");
  });

  it("replaces the list entirely when ALLOWED_ORIGINS is set", () => {
    const origins = resolveAllowedOrigins("https://apb.internal", undefined);
    expect(origins).toEqual(["https://apb.internal"]);
    // A self-hosted instance must not keep trusting the project's domains.
    expect(origins).not.toContain("https://agentplaybooks.ai");
  });

  it("parses a comma-separated list and trims whitespace", () => {
    expect(resolveAllowedOrigins(" https://a.test , https://b.test ", undefined))
      .toEqual(["https://a.test", "https://b.test"]);
  });

  it("ignores an empty or whitespace-only value", () => {
    expect(resolveAllowedOrigins("", undefined)).toContain("https://agentplaybooks.ai");
    expect(resolveAllowedOrigins("  ,  ", undefined)).toContain("https://agentplaybooks.ai");
  });
});
