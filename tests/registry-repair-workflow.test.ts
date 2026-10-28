import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { parse } from "yaml";

const workflow = parse(readFileSync(new URL("../.github/workflows/repair-mcp-registry-latest.yml", import.meta.url), "utf8"));
const steps = workflow.jobs.repair.steps;
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const run = (name: string, fetch: unknown, version = "0.8.0", core = {}) =>
  new AsyncFunction("process", "fetch", "core", steps.find((step: { name: string }) => step.name === name).with.script)(
    { env: { EXPECTED_VERSION: version } }, fetch, core,
  );
const entry = (version: string, status: string, isLatest = false) => ({
  server: { name: "ai.agentplaybooks/agentplaybooks", version },
  _meta: { "io.modelcontextprotocol.registry/official": { status, isLatest } },
});
const preflight = "Verify the replacement release and accidental historical record";

describe("manual registry repair safeguards", () => {
  it("only runs from main with the protected publisher environment", () => {
    expect(workflow.on).toEqual({ workflow_dispatch: expect.any(Object) });
    expect(workflow.jobs.repair.if).toBe("github.ref == 'refs/heads/main'");
    expect(workflow.jobs.repair.environment).toBe("mcp-registry-publish");
    expect(steps.some((step: { uses?: string }) => step.uses?.startsWith("actions/checkout"))).toBe(false);
  });

  it("refuses an unpublished replacement before any mutation", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    await expect(run(preflight, fetch)).rejects.toThrow("Publish the replacement release first");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("refuses to hide an active historical record", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json(entry("0.8.0", "active")))
      .mockResolvedValueOnce(Response.json(entry("1.0.0", "active", true)));
    await expect(run(preflight, fetch)).rejects.toThrow("Refusing to hide");
  });

  it("accepts only the expected deprecated historical record", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json(entry("0.8.0", "active")))
      .mockResolvedValueOnce(Response.json(entry("1.0.0", "deprecated", true)));
    await expect(run(preflight, fetch)).resolves.toBeUndefined();
    await expect(run(preflight, fetch, "../other-server")).rejects.toThrow("Expected an existing 0.x release");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not report success while latest is stale or deprecated", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(entry("1.0.0", "deprecated", true)));
    await expect(run("Verify active latest and retained history", fetch)).rejects.toThrow("Registry latest was not repaired");
  });
});
