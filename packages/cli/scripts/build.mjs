import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

await mkdir(new URL("../dist/", import.meta.url), { recursive: true });
await build({
  entryPoints: [fileURLToPath(new URL("../src/cli.js", import.meta.url))],
  outfile: fileURLToPath(new URL("../dist/agentplaybooks.mjs", import.meta.url)),
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
  sourcemap: false,
  legalComments: "none",
});
