import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { parse } from "yaml";

const workflow = parse(readFileSync(new URL("../.github/workflows/publish-mcp-registry.yml", import.meta.url), "utf8"));
const script = workflow.jobs.publish.steps.find((step: { id?: string }) => step.id === "metadata").with.script;
const npmCheck = script.slice(script.indexOf("// npm's successful publish"), script.indexOf("const registryUrl ="));
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const run = (fetch: unknown, sleep = vi.fn((resolve: () => void) => resolve())) =>
  new AsyncFunction("fetch", "setTimeout", "core", "version", npmCheck)(fetch, sleep, { info: vi.fn() }, "0.8.0");

describe("npm propagation before registry publication", () => {
  it("waits for read replicas after a successful npm publish", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ version: "0.8.0" }));
    const sleep = vi.fn((resolve: () => void) => resolve());
    await expect(run(fetch, sleep)).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(expect.any(Function), 10000);
  });

  it("fails after six unsuccessful reads", async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(null, { status: 404 })));
    await expect(run(fetch)).rejects.toThrow("HTTP 404");
    expect(fetch).toHaveBeenCalledTimes(6);
  });

  it("does not retry an authorization failure", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 403 }));
    await expect(run(fetch)).rejects.toThrow("HTTP 403");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("still rejects an unexpected npm version", async () => {
    await expect(run(vi.fn().mockResolvedValue(Response.json({ version: "0.7.0" })))).rejects.toThrow("different release version");
  });
});
