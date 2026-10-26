import { describe, expect, it } from "vitest";
import { postAuthPath } from "@/lib/auth-redirect";

const origin = "https://agentplaybooks.ai";

describe("post-login destinations", () => {
  it("preserves local paths, query strings and fragments", () => {
    expect(postAuthPath("/dashboard?tab=skills#recent", origin)).toBe("/dashboard?tab=skills#recent");
    expect(postAuthPath("/a/../playbooks/id", origin)).toBe("/playbooks/id");
    expect(postAuthPath("/search?q=hello%20world", origin)).toBe("/search?q=hello%20world");
  });

  it("rejects external URLs and browser-normalized authority escapes", () => {
    for (const value of [null, "", "https://evil.test", "//evil.test", "/\\evil.test", "/\t/evil.test", "/\n/evil.test", "/\r/evil.test", "javascript:alert(1)"]) {
      expect(postAuthPath(value, origin), String(value)).toBe("/dashboard");
    }
  });
});
