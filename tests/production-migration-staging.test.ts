import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { expect, it } from "vitest";

function cleanTemp(path: string, prefix: string) {
  const absolute = resolve(path);
  if (dirname(absolute) !== resolve(tmpdir()) || !basename(absolute).startsWith(prefix)) {
    throw new Error("Refusing to remove a path outside the test temporary directory");
  }
  rmSync(absolute, { recursive: true, force: true });
}

it("refuses unattended audit DDL while preserving the audited migration version and alias", () => {
  const temp = mkdtempSync(join(tmpdir(), "apb-staging-test-"));
  const output = join(temp, "output");
  let staged: string | undefined;
  try {
    execFileSync(process.execPath, ["scripts/prepare-supabase-deploy.mjs"], {
      env: { ...process.env, GITHUB_OUTPUT: output, SUPABASE_DB_URL: "postgresql://postgres:x@db.zcphxfospbvqplonkvco.supabase.co/postgres" },
    });
    staged = readFileSync(output, "utf8").trim().slice("workdir=".length);
    const migrations = join(staged, "supabase", "migrations");
    const guard = readFileSync(join(migrations, "20261024120000_audit_logs_compliance.sql"), "utf8");
    expect(guard).toContain("RAISE EXCEPTION");
    expect(guard).toContain("verified operator runbook");
    expect(guard).not.toContain("ALTER TABLE");
    expect(readFileSync(join(migrations, "20261009220418_review_proposals.sql"), "utf8"))
      .toBe(readFileSync("supabase/migrations/20261002120000_review_proposals.sql", "utf8"));
  } finally {
    if (staged) cleanTemp(staged, "agentplaybooks-supabase-deploy-");
    cleanTemp(temp, "apb-staging-test-");
  }
});
