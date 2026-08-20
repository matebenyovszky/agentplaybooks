import { describe, expect, it } from "vitest";
import { credentialProblem, presentedApiKey } from "@/app/api/_shared/api-key-header";
import { privateAccessRefusal } from "@/app/api/_shared/mcp-protocol";

/**
 * Where a client may put the API key, and what we say when it is unusable.
 *
 * A real client log read `200 → 202 → 403 "needs the memory:read permission"`
 * while the permissions were correct all along: its config had written
 * `Authorization: apb_…` with no `Bearer` scheme, because a `headers:` map has
 * nowhere to put one. The key arrived and we did not recognise it.
 *
 * From the client side every failure in here looks the same — an empty listing
 * and a failing refresh — so the message is the only diagnostic anyone gets.
 */

function requestWith(headers: Record<string, string>) {
  return new Request("http://localhost/api/mcp/x", { headers });
}

describe("finding the API key", () => {
  it("reads the documented Bearer form", () => {
    expect(presentedApiKey(requestWith({ Authorization: "Bearer apb_live_key" }))).toBe("apb_live_key");
  });

  it("reads a bare key in Authorization", () => {
    // A config that maps header names to values has nowhere to put a scheme.
    expect(presentedApiKey(requestWith({ Authorization: "apb_live_key" }))).toBe("apb_live_key");
  });

  it("reads X-API-Key, with or without the scheme", () => {
    expect(presentedApiKey(requestWith({ "X-API-Key": "apb_live_key" }))).toBe("apb_live_key");
    expect(presentedApiKey(requestWith({ "X-API-Key": "Bearer apb_live_key" }))).toBe("apb_live_key");
  });

  it("accepts a lowercase scheme", () => {
    expect(presentedApiKey(requestWith({ Authorization: "bearer apb_live_key" }))).toBe("apb_live_key");
  });

  it("does not care about header name casing", () => {
    // Case-insensitive per RFC 9110, and `Headers.get` honours it — worth
    // pinning, because a connector dialog spells the name lowercase.
    expect(presentedApiKey(requestWith({ authorization: "Bearer apb_live_key" }))).toBe("apb_live_key");
    expect(presentedApiKey(requestWith({ "x-api-key": "apb_live_key" }))).toBe("apb_live_key");
  });

  it("prefers Authorization when both carry a key", () => {
    expect(presentedApiKey(requestWith({
      Authorization: "Bearer apb_from_auth",
      "X-API-Key": "apb_from_x",
    }))).toBe("apb_from_auth");
  });

  it("falls through to X-API-Key when Authorization holds something else", () => {
    // A Supabase session token arrives in Authorization and is not a playbook
    // key; the key in the other header must still be found.
    expect(presentedApiKey(requestWith({
      Authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig",
      "X-API-Key": "apb_from_x",
    }))).toBe("apb_from_x");
  });

  it("ignores anything that is not one of our keys", () => {
    expect(presentedApiKey(requestWith({ Authorization: "Bearer eyJhbGciOi" }))).toBeNull();
    expect(presentedApiKey(requestWith({ "X-API-Key": "not-a-key" }))).toBeNull();
    expect(presentedApiKey(requestWith({ "X-API-Key": "   " }))).toBeNull();
    expect(presentedApiKey(requestWith({}))).toBeNull();
  });
});

describe("saying what is wrong with a presented credential", () => {
  it("says nothing when there is no credential, and nothing when it is usable", () => {
    expect(credentialProblem(requestWith({}))).toBeNull();
    expect(credentialProblem(requestWith({ Authorization: "Bearer apb_live_key" }))).toBeNull();
  });

  it("names the header that carried an unusable value", () => {
    const problem = credentialProblem(requestWith({ "X-API-Key": "not-a-key" }));

    expect(problem?.headerName).toBe("X-API-Key");
    expect(problem?.message).toContain("apb_");
    expect(problem?.message).not.toContain("not-a-key");
  });

  it("recognises a placeholder the client never expanded", () => {
    // The single most likely cause: a variable set after the client started.
    for (const value of ["${APBKS_KEY_APBKS_DEV}", "$APBKS_KEY_APBKS_DEV", "Bearer ${APBKS_KEY_X}"]) {
      const problem = credentialProblem(requestWith({ Authorization: value }));
      expect(problem?.message, value).toMatch(/unexpanded variable reference/);
    }
  });

  it("does not mistake a real key for a placeholder", () => {
    expect(credentialProblem(requestWith({ Authorization: "apb_live_key" }))).toBeNull();
  });
});

describe("how a private playbook refuses", () => {
  it("challenges a caller that sent nothing, naming both headers", () => {
    const refusal = privateAccessRefusal(requestWith({}));

    expect(refusal.status).toBe(401);
    expect(refusal.message).toContain("X-API-Key");
    expect(refusal.headers["WWW-Authenticate"]).toBeUndefined();
  });

  it("blames the permission only when a real key was presented", () => {
    const refusal = privateAccessRefusal(requestWith({ Authorization: "Bearer apb_wrong_but_wellformed" }));

    expect(refusal.status).toBe(403);
    expect(refusal.message).toContain("memory:read");
  });

  it("does not blame the permission when the value was never a key", () => {
    // The bug this whole file exists for: a correct key, unrecognised, reported
    // as a missing permission — sending someone to edit settings that were fine.
    const refusal = privateAccessRefusal(requestWith({ Authorization: "${APBKS_KEY_APBKS_DEV}" }));

    expect(refusal.status).toBe(403);
    expect(refusal.message).not.toContain("memory:read");
    expect(refusal.message).toMatch(/unexpanded variable reference/);
  });
});
