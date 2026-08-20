import { describe, expect, it } from "vitest";
import { presentedApiKey } from "@/app/api/_shared/auth";
import { privateAccessRefusal } from "@/app/api/_shared/mcp-protocol";

/**
 * Where a client is allowed to put the API key.
 *
 * `Authorization` is the documented carrier, but a client may reserve that
 * header for its own authentication handling. When it does, the operator has
 * nowhere to put the key and nothing to diagnose with: the connection
 * establishes, every listing comes back empty, and refreshing it fails. So
 * `X-API-Key` is accepted as well — with or without the `Bearer` prefix people
 * copy along with the documented value.
 */

function requestWith(headers: Record<string, string>) {
  return new Request("http://localhost/api/mcp/x", { headers });
}

describe("which header may carry the API key", () => {
  it("reads the documented Authorization header", () => {
    expect(presentedApiKey(requestWith({ Authorization: "Bearer apb_live_key" }))).toBe("apb_live_key");
  });

  it("reads X-API-Key for a client that cannot lend us Authorization", () => {
    expect(presentedApiKey(requestWith({ "X-API-Key": "apb_live_key" }))).toBe("apb_live_key");
  });

  it("tolerates the Bearer prefix pasted into X-API-Key", () => {
    expect(presentedApiKey(requestWith({ "X-API-Key": "Bearer apb_live_key" }))).toBe("apb_live_key");
  });

  it("does not care about header name casing", () => {
    // Header names are case-insensitive per RFC 9110, and `Headers.get` honours
    // that — worth pinning, because a connector dialog spells it lowercase.
    expect(presentedApiKey(requestWith({ authorization: "Bearer apb_live_key" }))).toBe("apb_live_key");
    expect(presentedApiKey(requestWith({ "x-api-key": "apb_live_key" }))).toBe("apb_live_key");
  });

  it("prefers Authorization when both are present", () => {
    expect(presentedApiKey(requestWith({
      Authorization: "Bearer apb_from_auth",
      "X-API-Key": "apb_from_x",
    }))).toBe("apb_from_auth");
  });

  it("ignores a value that is not one of our keys", () => {
    // A Supabase session token arrives in Authorization too, and must not be
    // mistaken for a playbook key.
    expect(presentedApiKey(requestWith({ Authorization: "Bearer eyJhbGciOi" }))).toBeNull();
    expect(presentedApiKey(requestWith({ "X-API-Key": "not-a-key" }))).toBeNull();
    expect(presentedApiKey(requestWith({ "X-API-Key": "   " }))).toBeNull();
    expect(presentedApiKey(requestWith({}))).toBeNull();
  });
});

describe("refusing a caller that used the alternative header", () => {
  it("treats a rejected X-API-Key as presented, not as missing", () => {
    // 401 tells a client "you sent nothing", so it retries the same key forever
    // instead of reporting which permission is missing.
    const refusal = privateAccessRefusal(requestWith({ "X-API-Key": "apb_wrong" }));

    expect(refusal.status).toBe(403);
    expect(refusal.message).toContain("memory:read");
  });
});
