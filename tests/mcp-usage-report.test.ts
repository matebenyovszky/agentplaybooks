import { describe, expect, it } from "vitest";
import { createUsageReport, jsonRecords, usageEvents } from "../scripts/report-mcp-usage.mjs";

describe("observed MCP usage report", () => {
  it("reads actual multiline Wrangler JSON and JSONL with escaped content", async () => {
    const event = { event: "mcp.tool_usage", schemaVersion: 1, tool: "read_memory" };
    const wrapper = { logs: [{ message: [JSON.stringify(event), 'unrelated { escaped " text }'] }] };
    const lines = ["Connected to Worker", JSON.stringify(wrapper, null, 2), JSON.stringify(event)].join("\n").split("\n");
    const records = [];
    for await (const record of jsonRecords(lines)) records.push(record);
    expect(records.flatMap(usageEvents)).toEqual([event, event]);
  });
  it("separates test/discovery/errors, deduplicates accounts and never treats shared keys as users", () => {
    const report = createUsageReport({ since: Date.parse("2026-10-01"), until: Date.parse("2026-11-01") });
    const event = { event: "mcp.tool_usage", schemaVersion: 1, tool: "write_memory", timestamp: "2026-10-28T10:00:00Z", actorKind: "account", actorRef: "a".repeat(64), audience: "unclassified", outcome: "success" };
    for (const e of [event, event, { ...event, timestamp: "2026-10-29T10:00:00Z" }, { ...event, actorKind: "playbook_key" }, { ...event, audience: "test" }, { ...event, audience: "internal" }, { ...event, outcome: "error" }, { ...event, tool: "find_tools" }, { ...event, timestamp: "2026-11-01T00:00:00Z" }]) report.add(e);
    expect(report.result()).toMatchObject({ observedEvents: 8, excludedInternalOrTestEvents: 2, discoveryCalls: 1, successfulCalls: 4, failedCalls: 1, activeAccounts: 1, activeSharedCredentials: 1, returningAccounts: 1, errorRate: 0.2 });
    expect(JSON.stringify(report.result())).not.toContain("a".repeat(64));
    expect(usageEvents(JSON.stringify({ logs: [{ message: [JSON.stringify(event)] }] }))).toEqual([event]);
    expect(usageEvents("invalid SECRET log")).toEqual([]);
  });
});
