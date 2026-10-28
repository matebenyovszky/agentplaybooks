/** Build the full remote-MCP plugin alongside the intentionally skills-only ZIP. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildZipStore, collectOpenAiSkillsFiles, packageRoot } from "./pack-openai-skills-zip.mjs";
import { containsLiteralCredential } from "../src/plugin-package.js";

export async function packOpenAiRemoteZip({ root = packageRoot, outputPath } = {}) {
  const files = await collectOpenAiSkillsFiles(root);
  const mcp = await readFile(path.join(root, "mcp.json"));
  const config = JSON.parse(mcp);
  const entries = Object.values(config.mcpServers ?? {});
  if (entries.length !== 1 || entries[0].url !== "https://agentplaybooks.ai/api/mcp/manage"
      || entries[0].type !== "streamable-http" || entries[0].extensions?.["com.openai"]?.auth?.type !== "oauth") {
    throw new Error("The hosted plugin must declare the canonical remote MCP endpoint and OAuth authentication.");
  }
  if (containsLiteralCredential(mcp.toString("utf8"))) throw new Error("Refusing to package credentials.");
  files.set("mcp.json", mcp);
  const names = [...files.keys()].sort();
  const zip = buildZipStore(names.map(name => ({ name, data: files.get(name) })));
  const target = outputPath ?? path.join(root, "dist", "agentplaybooks-openai-remote.zip");
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, zip);
  return { outputPath: target, names, bytes: zip.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = await packOpenAiRemoteZip();
  console.log(`Wrote ${result.outputPath} (${result.bytes} bytes). Register/connect OAuth in the host and verify in a new cloud conversation before publishing.`);
}
