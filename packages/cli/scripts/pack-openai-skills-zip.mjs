#!/usr/bin/env node
/**
 * Build the ChatGPT / OpenAI Plugins Directory **Skills-only** ZIP from this
 * CLI package. Does not submit anything. Listing copy waits for Mate yes.
 *
 *   node scripts/pack-openai-skills-zip.mjs
 *   node scripts/pack-openai-skills-zip.mjs --output=/tmp/agentplaybooks-openai-skills.zip
 *
 * Default output: packages/cli/dist/agentplaybooks-openai-skills.zip
 *
 * Packs Agent Plugins 1.0 plugin.json, skills/<name>/SKILL.md trees, LICENSE,
 * and the official app mark. Omits mcp.json, mcpServers, .mcp.json, apps,
 * .codex-plugin (account MCP), and screenshots.
 */
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { crc32 as zlibCrc32 } from "node:zlib";

import { containsLiteralCredential } from "../src/plugin-package.js";

const PLUGIN_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";
const OFFICIAL_LOGO = "./assets/icon.svg";
const FORBIDDEN_BASENAMES = new Set(["mcp.json", ".mcp.json", ".app.json"]);
const FORBIDDEN_PATH = /(^|\/)(\.codex-plugin|\.claude-plugin|\.cursor-plugin|node_modules|commands)(\/|$)/;

export const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const defaultOutputPath = path.join(packageRoot, "dist", "agentplaybooks-openai-skills.zip");

const ZIP_LOCAL = 0x04034b50;
const ZIP_CENTRAL = 0x02014b50;
const ZIP_EOCD = 0x06054b50;
const UTF8_FLAG = 0x0800;
const STORE = 0;
const UNIX_FILE_ATTR = (0o100644 << 16) >>> 0;

function u16(value) {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(value);
  return buf;
}

function u32(value) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(value);
  return buf;
}

function zipCrc32(buffer) {
  return zlibCrc32(buffer) >>> 0;
}

/** Fixed DOS timestamp so the ZIP is byte-stable across machines. */
function dosDateTime() {
  const date = ((2026 - 1980) << 9) | (1 << 5) | 1;
  return { time: 0, date };
}

export function buildZipStore(entries) {
  const { time, date } = dosDateTime();
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    if (name.includes("\\") || name.startsWith("/") || name.split("/").includes("..")) {
      throw new Error(`Unsafe ZIP path: ${name}`);
    }
    const nameBuf = Buffer.from(name, "utf8");
    const crc = zipCrc32(data);
    const local = Buffer.concat([
      u32(ZIP_LOCAL),
      u16(20),
      u16(UTF8_FLAG),
      u16(STORE),
      u16(time),
      u16(date),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(nameBuf.length),
      u16(0),
      nameBuf,
      data,
    ]);
    const central = Buffer.concat([
      u32(ZIP_CENTRAL),
      u16((3 << 8) | 20),
      u16(20),
      u16(UTF8_FLAG),
      u16(STORE),
      u16(time),
      u16(date),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(nameBuf.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(UNIX_FILE_ATTR),
      u32(offset),
      nameBuf,
    ]);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralDir = Buffer.concat(centrals);
  const eocd = Buffer.concat([
    u32(ZIP_EOCD),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralDir.length),
    u32(offset),
    u16(0),
  ]);
  return Buffer.concat([...locals, centralDir, eocd]);
}

export function listZipStore(buffer) {
  const files = [];
  let offset = 0;
  while (offset + 4 <= buffer.length) {
    const sig = buffer.readUInt32LE(offset);
    if (sig === ZIP_CENTRAL || sig === ZIP_EOCD) break;
    if (sig !== ZIP_LOCAL) throw new Error(`Invalid ZIP local header at ${offset}`);
    const nameLen = buffer.readUInt16LE(offset + 26);
    const extraLen = buffer.readUInt16LE(offset + 28);
    const compSize = buffer.readUInt32LE(offset + 18);
    const nameStart = offset + 30;
    const name = buffer.subarray(nameStart, nameStart + nameLen).toString("utf8");
    const dataStart = nameStart + nameLen + extraLen;
    files.push({
      name,
      data: Buffer.from(buffer.subarray(dataStart, dataStart + compSize)),
    });
    offset = dataStart + compSize;
  }
  return files;
}

function assertAllowedZipPath(name) {
  const base = name.split("/").at(-1);
  if (FORBIDDEN_BASENAMES.has(base) || FORBIDDEN_PATH.test(name)) {
    throw new Error(`Skills-only ZIP must omit ${name}`);
  }
}

function assertSkillsOnlyManifest(plugin) {
  if (!plugin || typeof plugin !== "object" || Array.isArray(plugin)) {
    throw new Error("plugin.json must be an object.");
  }
  if (plugin.$schema !== PLUGIN_SCHEMA) {
    throw new Error(`plugin.json must declare Agent Plugins 1.0 (${PLUGIN_SCHEMA}).`);
  }
  if (plugin.license !== "MIT") throw new Error("plugin.json license must be MIT.");
  if (Object.hasOwn(plugin, "mcpServers")) {
    throw new Error("Skills-only ZIP must omit mcpServers from plugin.json.");
  }
  const openai = plugin.extensions?.["com.openai"];
  if (openai && typeof openai === "object") {
    if (Object.hasOwn(openai, "apps") || Object.hasOwn(openai, "mcpServers")) {
      throw new Error("Skills-only ZIP must omit apps / mcpServers from extensions.com.openai.");
    }
    const iface = openai.interface;
    if (iface && typeof iface === "object") {
      if (Object.hasOwn(iface, "screenshots")) {
        throw new Error("Skills-only ZIP must omit interface.screenshots.");
      }
      if (iface.logo && iface.logo !== OFFICIAL_LOGO) {
        throw new Error(`Logo must remain the official app mark (${OFFICIAL_LOGO}).`);
      }
      if (iface.composerIcon && iface.composerIcon !== OFFICIAL_LOGO) {
        throw new Error(`composerIcon must remain the official app mark (${OFFICIAL_LOGO}).`);
      }
    }
  }
}

function assertSkillMarkdown(content, zipPath) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error(`${zipPath} is missing YAML frontmatter.`);
  const frontmatter = match[1];
  if (!/^name:\s*\S/m.test(frontmatter)) throw new Error(`${zipPath} frontmatter is missing name.`);
  if (!/^description:\s*\S/m.test(frontmatter)) throw new Error(`${zipPath} frontmatter is missing description.`);
  if (!content.slice(match[0].length).trim()) throw new Error(`${zipPath} instructions must not be empty.`);
}

async function addTree(absDir, relDir, files) {
  const entries = await readdir(absDir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const abs = path.join(absDir, entry.name);
    const rel = `${relDir}/${entry.name}`;
    assertAllowedZipPath(rel);
    if (entry.isDirectory()) {
      await addTree(abs, rel, files);
      continue;
    }
    if (!entry.isFile()) continue;
    files.set(rel, await readFile(abs));
  }
}

export async function collectOpenAiSkillsFiles(root = packageRoot) {
  const files = new Map();
  const pluginRaw = await readFile(path.join(root, "plugin.json"));
  const plugin = JSON.parse(pluginRaw.toString("utf8"));
  assertSkillsOnlyManifest(plugin);
  files.set("plugin.json", pluginRaw);

  const license = await readFile(path.join(root, "LICENSE"));
  if (!license.toString("utf8").includes("MIT License")) {
    throw new Error("LICENSE must be the MIT text from packages/cli/LICENSE.");
  }
  files.set("LICENSE", license);

  const openai = plugin.extensions?.["com.openai"]?.interface;
  const logoPath = openai?.logo ?? openai?.composerIcon;
  if (logoPath) {
    if (logoPath !== OFFICIAL_LOGO) {
      throw new Error(`Logo must remain the official app mark (${OFFICIAL_LOGO}).`);
    }
    const icon = await readFile(path.join(root, "assets", "icon.svg"));
    files.set("assets/icon.svg", icon);
  }

  const skillsRoot = path.join(root, "skills");
  const skillDirs = await readdir(skillsRoot, { withFileTypes: true });
  skillDirs.sort((a, b) => a.name.localeCompare(b.name));
  let skillCount = 0;
  for (const entry of skillDirs) {
    if (entry.name.startsWith(".") || !entry.isDirectory()) continue;
    const skillDir = path.join(skillsRoot, entry.name);
    const skillRel = `skills/${entry.name}`;
    try {
      const skillMd = await stat(path.join(skillDir, "SKILL.md"));
      if (!skillMd.isFile()) continue;
    } catch {
      continue;
    }
    skillCount += 1;
    await addTree(skillDir, skillRel, files);
    assertSkillMarkdown(files.get(`${skillRel}/SKILL.md`).toString("utf8"), `${skillRel}/SKILL.md`);
  }
  if (skillCount < 1) {
    throw new Error("Skills-only ZIP needs at least one skills/<name>/SKILL.md.");
  }

  for (const [name, data] of files) {
    assertAllowedZipPath(name);
    if (containsLiteralCredential(data.toString("utf8"))) {
      throw new Error(`Refusing to pack credential-like text in ${name}.`);
    }
  }
  return files;
}

function parseOutputPath(argv, root = packageRoot) {
  const eq = argv.find((arg) => arg.startsWith("--output="));
  if (eq) return path.resolve(eq.slice("--output=".length));
  const flag = argv.findIndex((arg) => arg === "--output" || arg === "-o");
  if (flag >= 0) {
    const value = argv[flag + 1];
    if (!value) throw new Error("Missing value for --output.");
    return path.resolve(value);
  }
  return path.join(root, "dist", "agentplaybooks-openai-skills.zip");
}

export async function packOpenAiSkillsZip({ root = packageRoot, outputPath } = {}) {
  const files = await collectOpenAiSkillsFiles(root);
  const names = [...files.keys()].sort();
  const zip = buildZipStore(names.map((name) => ({ name, data: files.get(name) })));
  const target = outputPath ?? path.join(root, "dist", "agentplaybooks-openai-skills.zip");
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, zip);
  return { outputPath: target, files, names, bytes: zip.length };
}

async function main(argv = process.argv.slice(2)) {
  const result = await packOpenAiSkillsZip({ outputPath: parseOutputPath(argv) });
  process.stdout.write(`Wrote ${result.outputPath} (${result.bytes} bytes)\n`);
  for (const name of result.names) {
    process.stdout.write(`  ${name}\n`);
  }
  process.stdout.write("Skills-only ZIP is ready locally. Do not submit until Mate yeses listing copy.\n");
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
