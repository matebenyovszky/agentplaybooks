import path from "node:path";
import { printDoctor, publicReport, runDoctor, runGlobalDoctor } from "./doctor.js";
import { applySync, planSync, printSyncPlan } from "./sync.js";

const HELP = `AgentPlaybooks CLI

Usage:
  agentplaybooks doctor [path] [--json] [--strict] [--global]
  agentplaybooks sync [path] [--apply] [--json]

Commands:
  doctor  Audit agent instructions, skills, MCP configuration, secrets, and drift.
  sync    Plan or apply creation of the canonical local agentplaybook.json.

Safety:
  doctor is read-only and local-only.
  sync is plan-only unless --apply is explicitly supplied.
`;

function parse(args) {
  const command = args[0];
  const flags = new Set(args.filter((arg) => arg.startsWith("--")));
  const positional = args.slice(1).filter((arg) => !arg.startsWith("--"));
  return { command, flags, target: positional[0] };
}

export async function run(args) {
  const { command, flags, target } = parse(args);
  if (!command || flags.has("--help") || command === "help") {
    console.log(HELP);
    return;
  }

  if (command === "doctor") {
    const report = flags.has("--global")
      ? await runGlobalDoctor()
      : await runDoctor(path.resolve(target ?? process.cwd()));
    if (flags.has("--json")) console.log(JSON.stringify(publicReport(report), null, 2));
    else printDoctor(report);
    if (flags.has("--strict") && report.findings.some((item) => item.severity === "critical" || item.severity === "high")) {
      process.exitCode = 2;
    }
    return;
  }

  if (command === "sync") {
    if (flags.has("--global")) throw new Error("Global sync is not supported in the alpha release.");
    const plan = await planSync(path.resolve(target ?? process.cwd()));
    if (flags.has("--json")) {
      console.log(JSON.stringify({ action: plan.action, changed: plan.changed, manifestPath: plan.manifestPath, manifest: plan.manifest }, null, 2));
    } else {
      printSyncPlan(plan);
    }
    if (flags.has("--apply")) {
      const result = await applySync(plan);
      if (!flags.has("--json")) {
        console.log(result.applied ? `Applied ${plan.action}: ${plan.manifestPath}` : "No changes applied.");
        if (result.backupPath) console.log(`Backup: ${result.backupPath}`);
      }
    }
    return;
  }

  throw new Error(`Unknown command '${command}'.\n\n${HELP}`);
}
