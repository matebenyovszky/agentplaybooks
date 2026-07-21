import { analyze } from "./checks.js";
import { discover, discoverGlobal } from "./discovery.js";

export async function runDoctor(target) {
  const inventory = await discover(target);
  return analyze(inventory);
}

export async function runGlobalDoctor() {
  return analyze(await discoverGlobal());
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
