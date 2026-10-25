import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("self-host restore-drill seed SQL", () => {
  it("inserts audit rows one at a time so the hash-chain trigger can chain them", () => {
    const result = spawnSync("npx", ["tsx", "scripts/self-host/seed-drill.ts"], {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, SECRETS_ENCRYPTION_KEY: KEY },
    });
    expect(result.status, result.stderr).toBe(0);
    const inserts = result.stdout.match(/INSERT INTO public\.audit_logs/g) ?? [];
    expect(inserts.length).toBe(3);
    expect(result.stdout).not.toMatch(
      /INSERT INTO public\.audit_logs[\s\S]*VALUES[\s\S]*secret\.create[\s\S]*,\s*\(/,
    );
  });
});
