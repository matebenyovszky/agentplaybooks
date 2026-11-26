import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const activeAccounts = new Set<string>();
vi.mock("@/app/api/_shared/account-status", () => ({
  accountIsActive: async (_request: Request, userId: string) => activeAccounts.has(userId),
}));

import { GET, POST } from "@/app/api/auth/entra/route";
import { entraConfig, idTokenMatches, unverifiedJwtClaims } from "@/lib/entra-sso";

const TENANT = "11111111-1111-4111-8111-111111111111";
const CLIENT = "22222222-2222-4222-8222-222222222222";
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const idToken = (claims: Record<string, unknown>) => `${b64({ alg: "RS256" })}.${b64(claims)}.c2ln`;
const post = (body: unknown) => POST(new Request("https://apbks.example.test/api/auth/entra", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
}));

const gotrue = vi.fn();

beforeEach(() => {
  vi.stubEnv("ENTRA_TENANT_ID", TENANT);
  vi.stubEnv("ENTRA_CLIENT_ID", CLIENT.toUpperCase());
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://apbks-auth.example.test/");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  vi.stubGlobal("fetch", gotrue);
  gotrue.mockReset();
  gotrue.mockResolvedValue(Response.json({
    access_token: "session-jwt", refresh_token: "gotrue-refresh", expires_at: 2_000_000_000,
    user: { id: "user-1", email: "kollega@example.test" },
  }));
  activeAccounts.clear();
  activeAccounts.add("user-1");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Entra ID sign-in for desktop agents", () => {
  it("publishes the tenant and client id, or that it is off", async () => {
    expect(await (await GET()).json()).toMatchObject({ enabled: true, tenant_id: TENANT, client_id: CLIENT });
    vi.stubEnv("ENTRA_CLIENT_ID", "");
    expect(await (await GET()).json()).toEqual({ enabled: false });
    expect((await post({ id_token: idToken({ tid: TENANT, aud: CLIENT }) })).status).toBe(404);
  });

  it("exchanges the ID token through Supabase Auth and returns only the access token", async () => {
    const response = await post({ id_token: idToken({ tid: TENANT, aud: CLIENT, nonce: "hash" }), nonce: "raw" });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json();
    expect(body).toEqual({ token_type: "bearer", access_token: "session-jwt", expires_at: 2_000_000_000, user: { id: "user-1", email: "kollega@example.test" } });
    expect(JSON.stringify(body)).not.toContain("gotrue-refresh");
    const [url, init] = gotrue.mock.calls[0];
    expect(url).toBe("https://apbks-auth.example.test/auth/v1/token?grant_type=id_token");
    expect(init.headers).toMatchObject({ apikey: "anon-key" });
    expect(JSON.parse(init.body)).toMatchObject({ provider: "azure", nonce: "raw" });
  });

  it("turns away tokens for another tenant or app before asking Supabase Auth", async () => {
    for (const claims of [{ tid: "33333333-3333-4333-8333-333333333333", aud: CLIENT }, { tid: TENANT, aud: "other-app" }, {}]) {
      expect((await post({ id_token: idToken(claims) })).status).toBe(401);
    }
    expect((await post({ id_token: "not-a-jwt" })).status).toBe(401);
    expect((await post({})).status).toBe(400);
    expect(gotrue).not.toHaveBeenCalled();
  });

  it("passes on Supabase Auth's reason, and refuses a disabled account", async () => {
    gotrue.mockResolvedValueOnce(Response.json({ msg: "Provider (issuer \"https://login.microsoftonline.com/x/v2.0\") is not enabled" }, { status: 400 }));
    const refused = await post({ id_token: idToken({ tid: TENANT, aud: CLIENT }) });
    expect(refused.status).toBe(401);
    expect((await refused.json()).detail).toContain("is not enabled");
    activeAccounts.clear();
    expect((await post({ id_token: idToken({ tid: TENANT, aud: CLIENT }) })).status).toBe(403);
  });

  it("validates its configuration and claims helpers", () => {
    expect(entraConfig({ ENTRA_TENANT_ID: "contoso", ENTRA_CLIENT_ID: CLIENT })).toBeNull();
    const config = entraConfig({ ENTRA_TENANT_ID: TENANT, ENTRA_CLIENT_ID: CLIENT })!;
    expect(idTokenMatches(unverifiedJwtClaims(idToken({ tid: TENANT, aud: [CLIENT] })), config)).toBe(true);
    expect(unverifiedJwtClaims("a.b")).toBeNull();
  });
});
