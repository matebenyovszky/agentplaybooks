import { describe, expect, it } from "vitest";

import robots from "@/app/robots";

describe("robots metadata", () => {
  it("allows public API endpoints for every crawler", () => {
    const metadata = robots();
    const rules = Array.isArray(metadata.rules) ? metadata.rules : [metadata.rules];
    const wildcardRule = rules.find(
      (rule) => !Array.isArray(rule.userAgent) && rule.userAgent === "*",
    );

    expect(wildcardRule).toBeDefined();
    expect(wildcardRule?.allow).toBe("/");
    expect(wildcardRule?.disallow).not.toContain("/api");
    expect(wildcardRule?.disallow).toContain("/dashboard");
  });
});
