import { analyze } from "./checks.js";
import { discover, discoverGlobal } from "./discovery.js";

const PLATFORM_LABELS = {
  claude: "Claude",
  cursor: "Cursor",
  codex: "Codex",
  copilot: "Copilot",
  gemini: "Gemini",
  hermes: "Hermes",
};

const NAMED_PLATFORMS = new Set(Object.keys(PLATFORM_LABELS));

export async function runDoctor(target) {
  const inventory = await discover(target);
  return analyze(inventory);
}

export async function runGlobalDoctor() {
  return analyze(await discoverGlobal());
}

/**
 * Named platforms discovered in the inventory, plus informational absences.
 *
 * `portable` (AGENTS.md) and `generic` are not platforms. Claude is listed as
 * missing when the project has no Claude config yet (no `.claude/`, `CLAUDE.md`,
 * or Claude `.mcp.json`) so a 100/100 Cursor-only report still names both.
 * That absence is not a finding and does not affect the health score.
 */
export function platformPresence(inventory) {
  const found = new Set();
  for (const collection of [inventory.instructions, inventory.skills, inventory.mcpConfigs, inventory.mcpServers]) {
    for (const item of collection ?? []) {
      if (NAMED_PLATFORMS.has(item.platform)) found.add(item.platform);
    }
  }
  const present = [...found].sort();
  const missing = found.has("claude") ? [] : ["claude"];
  return { present, missing };
}

function formatPlatformLine({ present, missing }) {
  const parts = [
    ...present.map((id) => `${PLATFORM_LABELS[id]} present`),
    ...missing.map((id) => `${PLATFORM_LABELS[id]} not present`),
  ];
  return `Platforms: ${parts.join("; ")}.`;
}

export function publicReport(report) {
  return {
    version: "1",
    score: report.score,
    summary: {
      instructions: report.inventory.instructions.length,
      skills: report.inventory.skills.length,
      mcpConfigs: report.inventory.mcpConfigs.length,
      mcpServers: report.inventory.mcpServers.length,
      findings: report.findings.length,
    },
    platforms: platformPresence(report.inventory),
    findings: report.findings,
  };
}

export function printDoctor(report) {
  const counts = report.findings.reduce((result, item) => {
    result[item.severity] = (result[item.severity] ?? 0) + 1;
    return result;
  }, {});

  console.log(`AgentPlaybooks Doctor — health ${report.score}/100`);
  console.log(`Found ${report.inventory.instructions.length} instruction file(s), ${report.inventory.skills.length} skill(s), and ${report.inventory.mcpServers.length} MCP server definition(s).`);
  console.log(formatPlatformLine(platformPresence(report.inventory)));
  console.log(`Findings: ${counts.critical ?? 0} critical, ${counts.high ?? 0} high, ${counts.medium ?? 0} medium, ${counts.low ?? 0} low.`);

  if (report.findings.length === 0) {
    console.log("No findings.");
    return;
  }

  console.log("");
  for (const item of report.findings) {
    const lines = item.lines?.length ? ` (line${item.lines.length > 1 ? "s" : ""} ${item.lines.join(", ")})` : "";
    console.log(`[${item.severity.toUpperCase()}] ${item.code}`);
    console.log(`  ${item.source}${lines}`);
    console.log(`  ${item.message}`);
  }
}
