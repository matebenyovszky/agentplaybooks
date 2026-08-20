import { describe, it, expect } from "vitest";
import { withVaultReference, vaultReferenceTarget } from "@/lib/mcp/vault-reference";

describe("withVaultReference", () => {
  it("puts the name in the field the auth type actually reads", () => {
    expect(withVaultReference({ auth: { type: "api_key" } }, "K").auth)
      .toMatchObject({ type: "api_key", api_key_secret: "K" });
    expect(withVaultReference({ auth: { type: "bearer" } }, "K").auth)
      .toMatchObject({ type: "bearer", token_secret: "K" });
    expect(withVaultReference({ auth: { type: "oauth2_client_credentials" } }, "K").auth)
      .toMatchObject({ type: "oauth2_client_credentials", client_secret: "K" });
  });

  it("does not rewrite an oauth2_refresh_token server as a bearer server", () => {
    // The regression this exists for: the previous fall-through set
    // type = "bearer", turning a working OAuth connection into a broken bearer
    // one and orphaning every field around it.
    const oauth = {
      base_url: "https://gmail.googleapis.com",
      auth: {
        type: "oauth2_refresh_token",
        token_url: "https://oauth2.googleapis.com/token",
        client_id: "123-abc.apps.googleusercontent.com",
        refresh_token_secret: "GMAIL_REFRESH_TOKEN",
      },
    };
    const updated = withVaultReference(oauth, "GOOGLE_CLIENT_SECRET");
    expect(updated.auth).toEqual({
      type: "oauth2_refresh_token",
      token_url: "https://oauth2.googleapis.com/token",
      client_id: "123-abc.apps.googleusercontent.com",
      refresh_token_secret: "GMAIL_REFRESH_TOKEN",
      client_secret: "GOOGLE_CLIENT_SECRET",
    });
    expect(updated.base_url).toBe("https://gmail.googleapis.com");
  });

  it("leaves an auth type it has no field for untouched", () => {
    const exotic = { auth: { type: "mtls", cert: "x" } };
    expect(withVaultReference(exotic, "K")).toBe(exotic);
  });

  it("defaults to bearer only when there is no auth block to contradict", () => {
    expect(withVaultReference({ url: "https://x.test/mcp" }, "K").auth)
      .toEqual({ type: "bearer", token_secret: "K" });
    // An auth block that is present but not an object is not a configuration.
    expect(withVaultReference({ auth: "bearer" }, "K").auth)
      .toEqual({ type: "bearer", token_secret: "K" });
  });

  it("does not mutate the config it was given", () => {
    const config = { auth: { type: "bearer" as const } };
    withVaultReference(config, "K");
    expect(config.auth).toEqual({ type: "bearer" });
  });

  it("ignores a blank name rather than writing an empty reference", () => {
    const config = { auth: { type: "bearer", token_secret: "REAL" } };
    expect(withVaultReference(config, "   ")).toBe(config);
  });

  it("names the field the button would write, so the UI can explain itself", () => {
    expect(vaultReferenceTarget({ auth: { type: "oauth2_refresh_token" } })).toBe("client_secret");
    expect(vaultReferenceTarget({ auth: { type: "mtls" } })).toBeNull();
    expect(vaultReferenceTarget({})).toBe("token_secret");
  });
});
