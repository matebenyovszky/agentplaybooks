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
// Always named as present or missing so a 100/100 report still names Claude
// and Cursor in either direction. Other named platforms appear only when found.
const REPORTED_ABSENCES = ["claude", "cursor"];

export async function runDoctor(target, options) {
  const inventory = await discover(target, options);
  return analyze(inventory);
}

export async function runGlobalDoctor(options = {}) {
  return analyze(await discoverGlobal(options));
}

/**
 * Named platforms discovered in the inventory, plus informational absences.
 *
 * `portable` (AGENTS.md) and `generic` are not platforms. Claude and Cursor are
 * each listed as missing when that tool has no project config yet, so a 100/100
 * report still names both directions (Claude-only or Cursor-only). Those
 * absences are not findings and do not affect the health score.
 */
export function platformPresence(inventory) {
  const found = new Set();
  for (const collection of [inventory.instructions, inventory.skills, inventory.mcpConfigs, inventory.mcpServers]) {
    for (const item of collection ?? []) {
      if (NAMED_PLATFORMS.has(item.platform)) found.add(item.platform);
    }
  }
  const present = [...found].sort();
  const missing = REPORTED_ABSENCES.filter((id) => !found.has(id));
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

/**
 * What a push from here would and would not send, so `doctor` answers the
 * question someone asks before running it: what leaves this machine?
 *
 * The exclusions are the interesting half. MCP *configuration* is never
 * uploaded — a config carries auth headers, and a playbook can be shared with
 * people the credential was not meant for — while the MCP server *definitions*
 * inside a playbook are. That distinction is invisible from the inventory
 * counts alone, which is exactly why it is stated.
 */
export function pushableInventory(report) {
  const { instructions, skills, mcpConfigs } = report.inventory;
  return {
    uploads: [
      { kind: "skill", count: skills.length },
      { kind: "instruction file", count: instructions.length },
    ].filter((item) => item.count > 0),
    excluded: mcpConfigs.length > 0
      ? [{ kind: "MCP client config", count: mcpConfigs.length, why: "carries auth headers" }]
      : [],
  };
}

function printPushable(report) {
  const { uploads, excluded } = pushableInventory(report);
  console.log("");
  if (uploads.length === 0) {
    console.log("A push from here would upload nothing.");
  } else {
    const parts = uploads.map((item) => `${item.count} ${item.kind}${item.count === 1 ? "" : "s"}`);
    console.log(`A push from here would upload ${parts.join(" and ")}.`);
  }
  for (const item of excluded) {
    console.log(`It would not upload ${item.count} ${item.kind}${item.count === 1 ? "" : "s"} — ${item.why}.`);
  }
  console.log("Run 'agentplaybooks push' to see the plan and be asked before anything is sent.");
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
    printPushable(report);
    return;
  }

  console.log("");
  for (const item of report.findings) {
    const lines = item.lines?.length ? ` (line${item.lines.length > 1 ? "s" : ""} ${item.lines.join(", ")})` : "";
    console.log(`[${item.severity.toUpperCase()}] ${item.code}`);
    console.log(`  ${item.source}${lines}`);
    console.log(`  ${item.message}`);
  }
  printPushable(report);
}
