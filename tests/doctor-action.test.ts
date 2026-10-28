import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { auditAction } from "../actions/doctor/run.mjs";

describe("reusable Doctor Action", () => {
  it("writes reports outside the scanned project, with a summary even when strict mode fails", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "apb-action-"));
    const project = path.join(root, "project");
    await mkdir(project);
    await writeFile(path.join(project, "AGENTS.md"), "API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456789\n");
    const output = path.join(root, "outputs");
    const summary = path.join(root, "summary");
    const result = await auditAction({ NODE_ENV: "test", GITHUB_WORKSPACE: project, RUNNER_TEMP: root,
      GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary, APB_DOCTOR_STRICT: "true" });
    expect(result.failed).toBe(true);
    const outputs = await readFile(output, "utf8");
    const reportPath = outputs.match(/^report=(.+)$/m)![1];
    expect(reportPath.startsWith(project + path.sep)).toBe(false);
    expect(await readFile(reportPath, "utf8")).not.toContain("sk-abcdefghijklmnopqrstuvwxyz");
    expect(await readFile(summary, "utf8")).toContain("AgentPlaybooks Doctor");
  });
});
