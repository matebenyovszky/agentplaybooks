import { describe, expect, it } from "vitest";
import {
  buildOAuthConsentReturnPath,
  formatOAuthScope,
  getOAuthClientHost,
} from "../src/lib/oauth-consent";

describe("OAuth consent helpers", () => {
  it("builds a local, encoded login return path", () => {
    expect(buildOAuthConsentReturnPath("request/with spaces?and=query")).toBe(
      "/oauth/consent?authorization_id=request%2Fwith+spaces%3Fand%3Dquery"
    );
  });

  it("provides understandable labels for standard scopes", () => {
    expect(formatOAuthScope("openid")).toBe("Verify your identity");
    expect(formatOAuthScope("email")).toBe("Read your email address");
    expect(formatOAuthScope("custom:scope")).toBe("custom:scope");
  });

  it("displays only a valid client host", () => {
    expect(getOAuthClientHost("https://chatgpt.com/mcp/callback")).toBe("chatgpt.com");
    expect(getOAuthClientHost("not a url")).toBeNull();
  });
});
