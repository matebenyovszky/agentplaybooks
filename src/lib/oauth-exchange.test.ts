import { describe, expect, it } from "vitest";
import { connectionTemplate } from "@/lib/connection-catalogue";
import {
  buildExchangeBody,
  resolveConfiguredClientId,
  isLoopbackRedirect,
  isPlanFailure,
  planExchange,
  readExchangeResponse,
} from "./oauth-exchange";
import { CONNECTION_TEMPLATES } from "./connection-catalogue";

/**
 * The property that matters most here is negative: the token URL comes from the
 * catalogue and can never come from the request. A caller-supplied token URL
 * would make this endpoint hand the client secret to any address the caller
 * names — the same arbitrary-destination shape `allowed_hosts` exists to close
 * on the secrets proxy.
 */

describe("planExchange", () => {
  it("takes the token URL from the catalogue, not from any input", () => {
    const plan = planExchange("gmail");
    expect(isPlanFailure(plan)).toBe(false);
    if (isPlanFailure(plan)) return;
    const fromCatalogue = CONNECTION_TEMPLATES
      .find((template) => template.id === "gmail")!
      .transport_config.auth!.token_url;
    expect(plan.tokenUrl).toBe(fromCatalogue);
    expect(plan.refreshSecretName).toBe("GMAIL_REFRESH_TOKEN");
    expect(plan.clientSecretName).toBe("GOOGLE_CLIENT_SECRET");
  });

  it("accepts only ids the catalogue knows", () => {
    // There is no path by which a caller names a destination: an unknown id is
    // a 404, so the only reachable token URLs are the ones we shipped.
    for (const input of ["https://attacker.example/token", "../gmail", "gmial", ""]) {
      const plan = planExchange(input);
      expect(isPlanFailure(plan), `accepted '${input}'`).toBe(true);
    }
  });

  it("rejects a non-string template id", () => {
    for (const input of [undefined, null, 42, {}, ["gmail"]]) {
      expect(isPlanFailure(planExchange(input))).toBe(true);
    }
  });

  it("refuses a template that has no consent flow", () => {
    const plan = planExchange("cloudflare-mcp");
    expect(isPlanFailure(plan)).toBe(true);
    if (!isPlanFailure(plan)) return;
    expect(plan.status).toBe(400);
    expect(plan.error).toMatch(/does not use a consent flow/);
  });

  it("plans every consent template in the catalogue", () => {
    // A new consent entry should be usable without touching this endpoint.
    const consent = CONNECTION_TEMPLATES.filter((template) => template.requiresConsent);
    expect(consent.length).toBeGreaterThan(0);
    for (const template of consent) {
      const plan = planExchange(template.id);
      expect(isPlanFailure(plan), `could not plan ${template.id}`).toBe(false);
    }
  });
});

describe("isLoopbackRedirect", () => {
  it("accepts the loopback addresses the consent flow uses", () => {
    expect(isLoopbackRedirect("http://127.0.0.1:41234/callback")).toBe(true);
    expect(isLoopbackRedirect("http://localhost:8080/callback")).toBe(true);
  });

  it("rejects anything that is not loopback", () => {
    for (const value of [
      "https://attacker.example/callback",
      "http://169.254.169.254/callback",
      "http://127.0.0.1.attacker.example/callback",
      "not a url",
      "",
      undefined,
      null,
      42,
    ]) {
      expect(isLoopbackRedirect(value), `accepted ${String(value)}`).toBe(false);
    }
  });

  it("rejects https loopback, which this flow never uses", () => {
    // The CLI serves plain http on a loopback port; an https redirect means the
    // request did not come from it.
    expect(isLoopbackRedirect("https://127.0.0.1:41234/callback")).toBe(false);
  });
});

describe("buildExchangeBody", () => {
  const base = {
    code: "the-code",
    redirectUri: "http://127.0.0.1:41234/callback",
    clientId: "client-abc",
    codeVerifier: "the-verifier",
  };

  it("sends the code, the verifier and the client secret", () => {
    const body = buildExchangeBody({ ...base, clientSecret: "shhh" });
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("the-code");
    expect(body.get("code_verifier")).toBe("the-verifier");
    expect(body.get("client_secret")).toBe("shhh");
  });

  it("omits client_secret entirely for a public client", () => {
    // Some providers reject an empty client_secret rather than ignoring it.
    expect(buildExchangeBody({ ...base, clientSecret: null }).has("client_secret")).toBe(false);
  });
});

describe("readExchangeResponse", () => {
  it("returns the refresh token on success", () => {
    expect(readExchangeResponse(200, { access_token: "at", refresh_token: "rt" }))
      .toEqual({ ok: true, refreshToken: "rt" });
  });

  it("names the missing refresh token as its own failure", () => {
    // The exchange succeeded, so this would otherwise surface much later.
    const result = readExchangeResponse(200, { access_token: "at" });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/access_type=offline/);
  });

  it("reports the provider's description on refusal", () => {
    const result = readExchangeResponse(400, {
      error: "invalid_grant",
      error_description: "Code already redeemed",
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/Code already redeemed/);
  });

  it("never echoes the rest of a failure body", () => {
    // A token endpoint can echo the authorization code, and this text reaches a
    // client.
    const result = readExchangeResponse(400, {
      error: "invalid_grant",
      error_description: "Bad code",
      code: "SECRET-CODE",
      client_secret: "SHOULD-NEVER-APPEAR",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).not.toContain("SECRET-CODE");
    expect(result.error).not.toContain("SHOULD-NEVER-APPEAR");
  });

  it("survives a body that is not an object", () => {
    for (const payload of [null, undefined, "nope", 42]) {
      expect(readExchangeResponse(500, payload).ok).toBe(false);
    }
  });
});

describe("resolveConfiguredClientId", () => {
  const gmail = connectionTemplate("gmail")!;
  const tokenUrl = gmail.transport_config.auth!.token_url!;
  const placeholder = gmail.transport_config.auth!.client_id!;

  it("reads the client id from the server configured against that token endpoint", () => {
    const servers = [
      { transport_config: { auth: { type: "bearer", token_secret: "CF" } } },
      { transport_config: { auth: { token_url: tokenUrl, client_id: "42-abc.apps.googleusercontent.com" } } },
    ];
    expect(resolveConfiguredClientId(servers, gmail)).toBe("42-abc.apps.googleusercontent.com");
  });

  it("treats the catalogue placeholder as not configured", () => {
    // A template ships `client_id: "GOOGLE_CLIENT_ID"` to show what to fill in.
    // Handing that to the authorize URL would send the user to a Google error
    // page; saying "not configured" sends them to the flag instead.
    const servers = [{ transport_config: { auth: { token_url: tokenUrl, client_id: placeholder } } }];
    expect(resolveConfiguredClientId(servers, gmail)).toBeNull();
  });

  it("does not take a client id from a server for a different provider", () => {
    const servers = [{
      transport_config: { auth: { token_url: "https://login.microsoftonline.com/x/oauth2/v2.0/token", client_id: "ms-client" } },
    }];
    expect(resolveConfiguredClientId(servers, gmail)).toBeNull();
  });

  it("survives whatever is actually in the column", () => {
    // transport_config is free-form JSON edited by hand, so every shape here is
    // reachable from the UI.
    for (const servers of [
      null,
      undefined,
      [],
      [null],
      [{}],
      [{ transport_config: null }],
      [{ transport_config: "bearer" }],
      [{ transport_config: { auth: null } }],
      [{ transport_config: { auth: [] } }],
      [{ transport_config: { auth: { token_url: tokenUrl } } }],
      [{ transport_config: { auth: { token_url: tokenUrl, client_id: "" } } }],
      [{ transport_config: { auth: { token_url: tokenUrl, client_id: 42 } } }],
    ]) {
      expect(resolveConfiguredClientId(servers as never, gmail)).toBeNull();
    }
  });
});
