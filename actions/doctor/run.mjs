import { appendFile, mkdtemp, realpath, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { publicReport, runDoctor } from "../../packages/cli/src/doctor.js";

export async function auditAction(env = process.env) {
  const workspace = await realpath(path.resolve(env.GITHUB_WORKSPACE ?? process.cwd()));
  const target = await realpath(path.resolve(workspace, env.APB_DOCTOR_PATH ?? "."));
  const relative = path.relative(workspace, target);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("Doctor path must stay within the workspace.");
  if (!["true", "false"].includes(env.APB_DOCTOR_STRICT ?? "true")) throw new Error("strict must be true or false");
  const report = publicReport(await runDoctor(target));
  const outputDir = await mkdtemp(path.join(env.RUNNER_TEMP ?? os.tmpdir(), "apb-doctor-"));
  const reportPath = path.join(outputDir, "report.json");
  const badgePath = path.join(outputDir, "badge.json");
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
  await writeFile(badgePath, JSON.stringify({ schemaVersion: 1, label: "agent config health", message: `${report.score}/100`, color: report.score >= 90 ? "brightgreen" : report.score >= 60 ? "yellow" : "red" }) + "\n");
  if (env.GITHUB_OUTPUT) await appendFile(env.GITHUB_OUTPUT, `score=${report.score}\nreport=${reportPath}\nbadge=${badgePath}\n`);
  if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY,
    `## AgentPlaybooks Doctor\n\nHealth: **${report.score}/100**. ${report.summary.skills} skills; ${report.summary.mcpServers} MCP definitions; ${report.findings.length} findings.\n\nThe scan was local and read-only. The JSON report contains paths and findings, never file contents or credential values.\n`);
  return { report, failed: (env.APB_DOCTOR_STRICT ?? "true") === "true" && report.findings.some(item => ["high", "critical"].includes(item.severity)) };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === pathToFileURL(fileURLToPath(import.meta.url)).href) {
  auditAction().then(({ report, failed }) => {
    console.log(`Doctor: ${report.score}/100, ${report.findings.length} findings.`);
    if (failed) process.exitCode = 2;
  }).catch(() => { console.error("Doctor action failed; check the target path and locked dependencies."); process.exitCode = 1; });
}
