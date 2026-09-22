import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

await mkdir(new URL("../dist/", import.meta.url), { recursive: true });
await mkdir(new URL("../hermes-plugin/", import.meta.url), { recursive: true });
for (const filename of ["__init__.py", "client.py", "config_schema.py", "plugin.yaml", "README.md", "LICENSE"]) {
  await copyFile(new URL(`../../hermes-memory/agentplaybooks/${filename}`, import.meta.url), new URL(`../hermes-plugin/${filename}`, import.meta.url));
}
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
