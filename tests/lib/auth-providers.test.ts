import { describe, expect, it, vi } from "vitest";
import { fetchAuthSettings, parseAuthSettings } from "@/lib/auth-providers";

const ids = (settings: ReturnType<typeof parseAuthSettings>) => settings.providers.map((provider) => provider.id);

describe("parseAuthSettings", () => {
  it("offers only the providers the instance has enabled", () => {
    const settings = parseAuthSettings({
      external: { email: true, google: false, github: true, linkedin_oidc: false, azure: false, apple: true },
      disable_signup: false,
    });
    expect(ids(settings)).toEqual(["github"]);
    expect(settings.email).toBe(true);
    expect(settings.signup).toBe(true);
  });

  it("puts Microsoft first and asks it for the email scope", () => {
    const settings = parseAuthSettings({ external: { azure: true, google: true, email: false } });
    expect(ids(settings)).toEqual(["azure", "google"]);
    expect(settings.providers[0]).toMatchObject({ label: "Microsoft", scopes: "email" });
    expect(settings.email).toBe(false);
  });

  it("hides sign-up when the instance disables it", () => {
    expect(parseAuthSettings({ external: { email: true }, disable_signup: true }).signup).toBe(false);
  });

  it("offers nothing for a malformed answer", () => {
    for (const raw of [null, "x", {}, { external: "x" }]) {
      expect(parseAuthSettings(raw)).toEqual({ providers: [], email: false, signup: true });
    }
  });
});

describe("fetchAuthSettings", () => {
  it("reads /auth/v1/settings with the anon key", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ external: { email: true, github: true } })));
    const settings = await fetchAuthSettings("https://db.example/", "anon-key", fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledWith("https://db.example/auth/v1/settings", { headers: { apikey: "anon-key" } });
    expect(settings && ids(settings)).toEqual(["github"]);
  });

  it("returns null when the settings cannot be read", async () => {
    const failing = vi.fn(async () => new Response("no", { status: 500 }));
    expect(await fetchAuthSettings("https://db.example", "k", failing as unknown as typeof fetch)).toBeNull();
    const throwing = vi.fn(async () => {
      throw new Error("offline");
    });
    expect(await fetchAuthSettings("https://db.example", "k", throwing as unknown as typeof fetch)).toBeNull();
  });
});
