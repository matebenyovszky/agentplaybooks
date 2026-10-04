import { describe, expect, it } from "vitest";
import { publicWorkerEnv } from "../scripts/generate-worker-build-env.mjs";
import { applyPublicBuildEnv } from "@/worker/environment";

describe("native Worker build/runtime environment", () => {
  it("exports only allowlisted public settings from build-time environment", () => {
    const env = { NEXT_PUBLIC_SUPABASE_URL: "https://build.example.com", NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon", NEXT_PUBLIC_SITE_URL: "https://site.example.com", SUPABASE_SERVICE_ROLE_KEY: "SECRET_SERVICE", SECRETS_ENCRYPTION_KEY: "SECRET_ENCRYPTION", GITHUB_TOKEN: "SECRET_PAT", OTHER: "SECRET_OTHER" };
    const output = publicWorkerEnv(env);
    expect(Object.keys(output).sort()).toEqual(["NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_URL"]);
    expect(JSON.stringify(output)).not.toContain("SECRET");
  });
  it("fills public settings absent from runtime bindings without replacing runtime settings or secrets", () => {
    const runtime: Record<string, string | undefined> = { NEXT_PUBLIC_SUPABASE_URL: "https://runtime.example.com", SUPABASE_SERVICE_ROLE_KEY: "runtime-secret" };
    applyPublicBuildEnv(runtime, { NEXT_PUBLIC_SUPABASE_URL: "https://build.example.com", NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon" });
    expect(runtime).toEqual({ NEXT_PUBLIC_SUPABASE_URL: "https://runtime.example.com", NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon", SUPABASE_SERVICE_ROLE_KEY: "runtime-secret" });
  });
});
