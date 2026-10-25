import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");

describe("security documentation pack", () => {
  it("ships HU + EN files and a bilingual CSV", () => {
    for (const relative of [
      "docs/security/README.md",
      "docs/security/README.hu.md",
      "docs/security/whitepaper.md",
      "docs/security/whitepaper.hu.md",
      "docs/security/asset-inventory.md",
      "docs/security/asset-inventory.hu.md",
      "docs/security/risk-assessment.md",
      "docs/security/risk-assessment.hu.md",
      "docs/security/risk-assessment.csv",
      "scripts/list-self-host-stack.mjs",
      "scripts/check-security-docs.mjs",
    ]) {
      expect(existsSync(path.join(repoRoot, relative)), relative).toBe(true);
    }
  });

  it("keeps relative links and cited source paths resolvable", () => {
    const result = spawnSync(process.execPath, ["scripts/check-security-docs.mjs"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(result.stderr, result.stderr).toBe("");
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toMatch(/Security docs check passed/);
  });

  it("lists the declared compose app service without Docker", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/list-self-host-stack.mjs", "--declared-only", "--json"],
      { cwd: repoRoot, encoding: "utf8" },
    );
    expect(result.status, result.stderr).toBe(0);
    const report = JSON.parse(result.stdout);
    const services = report.declared.flatMap((entry: { services: Array<{ name: string; ports: string[] }> }) => entry.services);
    expect(services.map((service: { name: string }) => service.name)).toContain("app");
    expect(services[0].ports.some((port: string) => port.includes("3000"))).toBe(true);
    expect(report.expectedAppSecrets).toContain("SECRETS_ENCRYPTION_KEY");
  });

  it("records AES-256-GCM and the honest gaps instead of over-claiming", () => {
    const whitepaper = readFileSync(path.join(repoRoot, "docs/security/whitepaper.md"), "utf8");
    expect(whitepaper).toMatch(/AES-256-GCM/);
    expect(whitepaper).toMatch(/HKDF/);
    expect(whitepaper.toLowerCase()).toMatch(/jogi ellenőrzés szükséges/);
    expect(whitepaper).toMatch(/No KMS \/ HSM/);
    expect(whitepaper).toMatch(/No application-level MFA/);
    expect(whitepaper).toMatch(/Auditor role: not in the codebase/);
    expect(whitepaper).toMatch(/Folyamatban \/ In progress/);
    expect(whitepaper).toMatch(/pull\/202/);
    expect(whitepaper).toMatch(/pull\/201/);
    expect(whitepaper).toMatch(/pull\/200/);
    expect(whitepaper).toMatch(/pull\/204/);
  });
});
