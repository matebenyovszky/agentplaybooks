#!/usr/bin/env node
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

/** Consume only our usage events, including messages nested in Wrangler JSON tails. */
export function usageEvents(value) {
  if (typeof value === "string") {
    try { return usageEvents(JSON.parse(value)); } catch { return []; }
  }
  if (!value || typeof value !== "object") return [];
  if (value.event === "mcp.tool_usage" && value.schemaVersion === 1) return [value];
  if (Array.isArray(value)) return value.flatMap(usageEvents);
  return [...usageEvents(value.logs), ...usageEvents(value.message)];
}

export function createUsageReport({ since = 0, until = Infinity, excludeActors = [] } = {}) {
  const excluded = new Set(excludeActors);
  const accounts = new Set(), credentials = new Set(), accountDays = new Map(), tools = new Map();
  let observed = 0, ignored = 0, discovery = 0, successful = 0, errors = 0, unclassified = 0;
  let first = Infinity, last = -Infinity;
  return {
    add(event) {
      const time = Date.parse(event.timestamp);
      if (!Number.isFinite(time) || time < since || time >= until) return;
      if (!["success", "error"].includes(event.outcome)) return;
      observed++;
      if (["internal", "test"].includes(event.audience) || excluded.has(event.actorRef)) { ignored++; return; }
      if (event.tool === "find_tools") { discovery++; return; }
      first = Math.min(first, time); last = Math.max(last, time);
      const name = typeof event.tool === "string" && /^[a-z_]{1,80}$/.test(event.tool) ? event.tool : "unknown_tool";
      const tool = tools.get(name) ?? { tool: name, success: 0, errors: 0 };
      tools.set(name, tool);
      if (event.outcome === "error") { errors++; tool.errors++; return; }
      successful++; tool.success++;
      if (event.audience === "unclassified") unclassified++;
      if (!/^[a-f0-9]{64}$/.test(event.actorRef ?? "")) return;
      if (event.actorKind === "account") {
        accounts.add(event.actorRef);
        const days = accountDays.get(event.actorRef) ?? new Set();
        days.add(new Date(time).toISOString().slice(0, 10));
        accountDays.set(event.actorRef, days);
      } else if (event.actorKind === "playbook_key") credentials.add(event.actorRef);
    },
    result() {
      return {
        coverage: "Observed logs only; not historical MAU or a count of verified external people. Returning means successful use on multiple UTC dates within this export.",
        observedEvents: observed, excludedInternalOrTestEvents: ignored, discoveryCalls: discovery,
        successfulCalls: successful, failedCalls: errors,
        errorRate: successful + errors ? errors / (successful + errors) : null,
        activeAccounts: accounts.size, activeSharedCredentials: credentials.size,
        returningAccounts: [...accountDays.values()].filter(days => days.size > 1).length,
        unclassifiedSuccessfulCalls: unclassified,
        firstObservedCall: Number.isFinite(first) ? new Date(first).toISOString() : null,
        lastObservedCall: Number.isFinite(last) ? new Date(last).toISOString() : null,
        tools: [...tools.values()].sort((a, b) => (b.success + b.errors) - (a.success + a.errors)),
      };
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log("Usage: node scripts/report-mcp-usage.mjs [logs.jsonl|-] [--since ISO_DATE] [--until ISO_DATE] [--exclude-actor SHA256]...\nReads JSONL events or Wrangler tail JSON from stdin/file. until is exclusive; internal/test events and find_tools discovery are excluded from activity.");
  } else {
    try {
      let file = "-"; const options = { excludeActors: [] };
      for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === "--since" || arg === "--until") {
          const time = Date.parse(args[++i]);
          if (!Number.isFinite(time)) throw new Error("Invalid date option");
          options[arg.slice(2)] = time;
        } else if (arg === "--exclude-actor") {
          const actor = args[++i];
          if (!/^[a-f0-9]{64}$/.test(actor ?? "")) throw new Error("Expected a hashed actor reference");
          options.excludeActors.push(actor);
        } else if (!arg.startsWith("--") && file === "-") file = arg;
        else throw new Error("Unknown option; use --help");
      }
      const report = createUsageReport(options);
      const input = file === "-" ? process.stdin : createReadStream(file);
      for await (const line of createInterface({ input, crlfDelay: Infinity })) {
        for (const event of usageEvents(line)) report.add(event);
      }
      console.log(JSON.stringify(report.result(), null, 2));
    } catch {
      console.error("Unable to read usage data or options. Use --help; no source log content is printed on failure.");
      process.exitCode = 1;
    }
  }
}
