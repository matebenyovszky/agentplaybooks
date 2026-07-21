import path from "node:path";
import { digest, normalizePath } from "./discovery.js";

const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PLACEHOLDER_PATTERN = /^(?:\$\{|\{\{|<|your[_-]|example|changeme|replace[_-]|env:|vault:|secret:)/i;
const CREDENTIAL_PATTERNS = [
  /\bsk-[a-zA-Z0-9_-]{20,}\b/,
  /\bgh[pousr]_[a-zA-Z0-9]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|password|client[_-]?secret)\s*[=:]\s*["']?([^\s,"'}]+)/i,
];

function finding(severity, code, message, source, details = {}) {
  return { severity, code, message, source: normalizePath(source), ...details };
}

function groupBy(items, keyFor) {
  const groups = new Map();
  for (const item of items) {
    const key = keyFor(item);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return groups;
}

function parseFrontmatter(content) {
  if (!content.startsWith("---")) return { values: {}, valid: false };
  const end = content.indexOf("\n---", 3);
  if (end === -1) return { values: {}, valid: false };
  const values = {};
  for (const line of content.slice(3, end).split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    values[match[1]] = match[2].replace(/^["']|["']$/g, "").trim();
  }
  return { values, valid: true };
}

function credentialLines(content) {
  const results = [];
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    for (const pattern of CREDENTIAL_PATTERNS) {
      const match = line.match(pattern);
      if (!match) continue;
      const candidate = match[1] ?? match[0];
      if (!PLACEHOLDER_PATTERN.test(candidate.trim())) results.push(index + 1);
      break;
    }
  }
  return [...new Set(results)];
}

function findMcpCollections(value, collections = []) {
  if (!value || typeof value !== "object") return collections;
  if (!Array.isArray(value) && value.mcpServers && typeof value.mcpServers === "object") {
    collections.push(value.mcpServers);
  }
  for (const child of Object.values(value)) findMcpCollections(child, collections);
  return collections;
}

function transportFor(server) {
  if (typeof server?.url === "string") return server.url.includes("/sse") ? "sse" : "http";
  if (typeof server?.command === "string") return "stdio";
  return "unknown";
}

function parseTomlServers(content) {
  const servers = [];
  const sectionPattern = /^\[mcp_servers\.([A-Za-z0-9_-]+)\]\s*$/gm;
  const matches = [...content.matchAll(sectionPattern)];
  for (const [index, match] of matches.entries()) {
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? content.length;
    const block = content.slice(start, end);
    const url = block.match(/^url\s*=\s*["']([^"']+)["']/m)?.[1];
    const command = block.match(/^command\s*=\s*["']([^"']+)["']/m)?.[1];
    servers.push({ name: match[1], definition: { url, command }, transport: url ? (url.includes("/sse") ? "sse" : "http") : command ? "stdio" : "unknown" });
  }
  return servers;
}

export function analyze(inventory) {
  const findings = [];
  const skills = [];
  const mcpServers = [];

  for (const instruction of inventory.instructions) {
    const lines = credentialLines(instruction.content);
    if (lines.length) {
      findings.push(finding("critical", "secret.hardcoded", "Possible hard-coded credential found in agent instructions; only line numbers are reported.", instruction.source, { lines }));
    }
  }

  for (const skill of inventory.skills) {
    const frontmatter = parseFrontmatter(skill.content);
    const parentName = path.basename(path.dirname(skill.source));
    const name = frontmatter.values.name || parentName;
    const description = frontmatter.values.description || "";
    skills.push({ ...skill, name, description });

    if (!frontmatter.valid) {
      findings.push(finding("high", "skill.frontmatter.invalid", "SKILL.md must start with valid YAML frontmatter.", skill.source));
    }
    if (!frontmatter.values.name) {
      findings.push(finding("high", "skill.name.missing", "Skill frontmatter is missing the required name field.", skill.source));
    } else if (!SKILL_NAME_PATTERN.test(frontmatter.values.name) || frontmatter.values.name.length > 64) {
      findings.push(finding("high", "skill.name.invalid", "Skill name must be lowercase kebab-case and no longer than 64 characters.", skill.source));
    }
    if (!description) {
      findings.push(finding("medium", "skill.description.missing", "Skill frontmatter is missing the required description field.", skill.source));
    } else if (description.length > 1024) {
      findings.push(finding("medium", "skill.description.long", "Skill description exceeds 1024 characters.", skill.source));
    }
    if (frontmatter.values.name && frontmatter.values.name !== parentName) {
      findings.push(finding("low", "skill.directory.mismatch", `Skill name differs from its parent directory (${parentName}).`, skill.source));
    }
    const lines = credentialLines(skill.content);
    if (lines.length) {
      findings.push(finding("critical", "secret.hardcoded", "Possible hard-coded credential found; only line numbers are reported.", skill.source, { lines }));
    }
  }

  for (const config of inventory.mcpConfigs) {
    const lines = credentialLines(config.content);
    if (lines.length) {
      findings.push(finding("critical", "secret.hardcoded", "Possible hard-coded credential found in agent configuration; only line numbers are reported.", config.source, { lines }));
    }

    let parsedServers = [];
    if (config.source.toLowerCase().endsWith(".toml")) {
      parsedServers = parseTomlServers(config.content);
    } else {
      try {
        const parsed = JSON.parse(config.content);
        parsedServers = findMcpCollections(parsed).flatMap((collection) => Object.entries(collection).map(([name, definition]) => ({
          name,
          definition,
          transport: transportFor(definition),
        })));
      } catch {
        findings.push(finding("high", "mcp.config.invalid-json", "MCP configuration is not valid JSON.", config.source));
        continue;
      }
    }

    for (const server of parsedServers) {
      const serverDigest = digest(JSON.stringify(server.definition));
      mcpServers.push({
        name: server.name,
        source: config.source,
        platform: config.platform,
        transport: server.transport,
        digest: serverDigest,
      });
      if (server.transport === "unknown") {
        findings.push(finding("high", "mcp.transport.missing", `MCP server '${server.name}' has neither a command nor a URL.`, config.source));
      }
      const url = server.definition?.url;
      if (typeof url === "string" && url.startsWith("http://") && !/^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/.test(url)) {
        findings.push(finding("high", "mcp.url.insecure", `MCP server '${server.name}' uses unencrypted HTTP outside localhost.`, config.source));
      }
    }
  }

  const skillGroups = groupBy(skills, (skill) => skill.name);
  for (const [name, variants] of skillGroups) {
    if (variants.length < 2 || new Set(variants.map((item) => item.digest)).size < 2) continue;
    findings.push(finding("medium", "skill.drift", `Skill '${name}' has different definitions across discovered locations.`, variants[0].source, {
      relatedSources: variants.map((item) => item.source),
    }));
  }

  const serverGroups = groupBy(mcpServers, (server) => server.name);
  for (const [name, variants] of serverGroups) {
    if (variants.length < 2 || new Set(variants.map((item) => item.digest)).size < 2) continue;
    findings.push(finding("medium", "mcp.drift", `MCP server '${name}' has different definitions across platforms.`, variants[0].source, {
      relatedSources: variants.map((item) => item.source),
    }));
  }

  const penalty = findings.reduce((total, item) => total + ({ critical: 25, high: 10, medium: 4, low: 1 }[item.severity] ?? 0), 0);
  const score = Math.max(0, 100 - penalty);
  const severityRank = { critical: 0, high: 1, medium: 2, low: 3 };
  findings.sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || a.source.localeCompare(b.source));

  return {
    score,
    findings,
    inventory: {
      root: inventory.root,
      instructions: inventory.instructions,
      skills,
      mcpConfigs: inventory.mcpConfigs,
      mcpServers,
    },
  };
}
