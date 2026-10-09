import { afterEach, describe, expect, it, vi } from "vitest";

const { createServerClient } = vi.hoisted(() => ({
  createServerClient: vi.fn((url: string, key: string) => ({ url, key })),
}));

vi.mock("@/lib/supabase/client", () => ({ createServerClient }));

const originalEnv = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

afterEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = originalEnv.url;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalEnv.anonKey;
  process.env.SUPABASE_SERVICE_ROLE_KEY = originalEnv.serviceKey;
  vi.clearAllMocks();
});

describe("server Supabase clients", () => {
  it("reuses separate anonymous and service clients, rebuilding after key rotation", async () => {
    vi.resetModules();
    const { getServerAnonSupabase, getServerServiceSupabase } = await import("@/lib/supabase/server");
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://db.test";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-one";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-one";

    const anon = getServerAnonSupabase();
    const service = getServerServiceSupabase();
    expect(getServerAnonSupabase()).toBe(anon);
    expect(getServerServiceSupabase()).toBe(service);
    expect(anon).not.toBe(service);
    expect(createServerClient).toHaveBeenCalledTimes(2);
    expect(createServerClient).toHaveBeenNthCalledWith(1, "https://db.test", "anon-one");
    expect(createServerClient).toHaveBeenNthCalledWith(2, "https://db.test", "service-one");

    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-two";
    expect(getServerAnonSupabase()).not.toBe(anon);
    expect(getServerServiceSupabase()).toBe(service);
    expect(createServerClient).toHaveBeenNthCalledWith(3, "https://db.test", "anon-two");

    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-two";
    expect(getServerServiceSupabase()).not.toBe(service);
    expect(createServerClient).toHaveBeenNthCalledWith(4, "https://db.test", "service-two");
  });

  it("requires the correct key for each privilege level", async () => {
    vi.resetModules();
    const { getServerAnonSupabase, getServerServiceSupabase } = await import("@/lib/supabase/server");
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://db.test";
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-one";

    expect(getServerAnonSupabase).toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY/);
    expect(getServerServiceSupabase()).toEqual({ url: "https://db.test", key: "service-one" });

    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-one";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(getServerServiceSupabase).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(getServerAnonSupabase()).toEqual({ url: "https://db.test", key: "anon-one" });
  });
});
