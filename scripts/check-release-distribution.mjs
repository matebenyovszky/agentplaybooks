import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = async path => readFile(resolve(root, path), "utf8");
const json = async path => JSON.parse(await read(path));
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const cli = await json("packages/cli/package.json");
const packageLock = await json("packages/cli/package-lock.json");
const portable = await json("packages/cli/plugin.json");
const mcp = await json("packages/cli/mcp.json");
const registry = await json("server.json");
const variants = await Promise.all([
  "packages/cli/.codex-plugin/plugin.json",
  "packages/cli/.claude-plugin/plugin.json",
  "packages/cli/.cursor-plugin/plugin.json",
  ".claude-plugin/marketplace.json",
  ".cursor-plugin/marketplace.json",
].map(json));

check(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(cli.version), "CLI version must be SemVer.");
check(packageLock.version === cli.version, "CLI package-lock version differs.");
check(packageLock.packages?.[""]?.version === cli.version, "CLI package-lock root package version differs.");
const webLock = await json("package-lock.json");
for (const dependency of ["@emnapi/core", "@emnapi/runtime", "@emnapi/wasi-threads"]) {
  check(Boolean(webLock.packages?.[`node_modules/${dependency}`]), `Root lockfile lost Linux/WASM optional dependency ${dependency}.`);
}
check(portable.version === cli.version, "Portable plugin version differs.");
check(registry.version === cli.version, "MCP Registry version differs.");
for (const [index, manifest] of variants.entries()) {
  const version = index < 3 ? manifest.version : manifest.plugins?.[0]?.version;
  check(version === cli.version, `Plugin/marketplace manifest ${index + 1} version differs.`);
}
check(portable.$schema === "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", "Missing Agent Plugins 1.0 schema.");
check(mcp.$schema === "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json", "Missing portable MCP schema.");
check(mcp.mcpServers?.["agentplaybooks-account"]?.url === registry.remotes?.[0]?.url, "Portable and registry MCP URLs differ.");
check(cli.files.includes("plugin.json") && cli.files.includes("mcp.json") && cli.files.includes("assets"), "Portable files are missing from the npm package allowlist.");
const webIcon = (await read("public/icon.svg")).replace(/\r\n/g, "\n");
const pluginIcon = (await read("packages/cli/assets/icon.svg")).replace(/\r\n/g, "\n");
check(webIcon === pluginIcon, "Plugin logo differs from the website logo.");
check(portable.extensions?.["com.openai"]?.interface?.logo === "./assets/icon.svg", "Plugin logo path differs.");
check(portable.extensions?.["com.openai"]?.interface?.composerIcon === "./assets/icon.svg", "Plugin composer icon path differs.");
check(variants[0].interface?.logo === "./assets/icon.svg", "Codex compatibility logo path differs.");
check(variants[0].interface?.composerIcon === "./assets/icon.svg", "Codex compatibility composer icon path differs.");
check(variants[2].logo === "assets/agentplaybooks-mark.svg", "Cursor plugin logo path differs.");
check(variants[4].plugins?.[0]?.logo === "packages/cli/assets/agentplaybooks-mark.svg", "Cursor marketplace logo path differs.");
const skillNames = await readdir(resolve(root, "packages/cli/skills"));
check(skillNames.length > 0, "No skills included in npm plugin.");

if (failures.length) {
  for (const failure of failures) process.stderr.write(`FAIL ${failure}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Release distribution manifests aligned at ${cli.version}; logo and ${skillNames.length} skill directory entries checked.\n`);
}
