import { describe, expect, it } from "vitest";
import { emailLinkCredentials } from "@/lib/email-link-auth";

describe("existing-account email-link sign-in", () => {
  it("preserves the local OAuth consent destination without creating accounts", () => {
    const credentials = emailLinkCredentials("review@example.invalid", "/oauth/consent?authorization_id=demo", "https://agentplaybooks.ai");
    expect(credentials.options.shouldCreateUser).toBe(false);
    expect(credentials.options.emailRedirectTo).toBe("https://agentplaybooks.ai/oauth/consent?authorization_id=demo");
  });

  it.each(["https://attacker.invalid", "//attacker.invalid", "/\\attacker.invalid", "/\nattacker.invalid"])("does not send sign-in links to an off-site destination: %s", (next) => {
    expect(emailLinkCredentials("review@example.invalid", next, "https://agentplaybooks.ai").options.emailRedirectTo).toBe("https://agentplaybooks.ai/dashboard");
  });
});
