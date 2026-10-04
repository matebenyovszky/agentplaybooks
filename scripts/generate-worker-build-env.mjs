import nextEnv from "@next/env";
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function publicWorkerEnv(env) {
  // Next inlines these browser-safe settings when it compiles route handlers.
  // Wrangler bundles our native handlers separately, so supply the same values.
  // Never include service keys, encryption keys, PATs, or other build secrets.
  return Object.fromEntries([
    "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SITE_URL",
  ].filter((key) => typeof env[key] === "string").map((key) => [key, env[key]]));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  nextEnv.loadEnvConfig(root);
  await writeFile(resolve(root, "src/worker/build-env.generated.ts"),
    `// Generated during prebuild; contains only explicitly allowed public settings.\nexport const publicBuildEnv: Record<string, string> = ${JSON.stringify(publicWorkerEnv(process.env))};\n`);
}
