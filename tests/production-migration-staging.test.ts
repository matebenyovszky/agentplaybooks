import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
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

function prepareDeploy(output: string) {
  return execFileSync(process.execPath, ["scripts/prepare-supabase-deploy.mjs"], {
    encoding: "utf8",
    env: { ...process.env, GITHUB_OUTPUT: output, SUPABASE_DB_URL: "postgresql://postgres:x@db.zcphxfospbvqplonkvco.supabase.co/postgres" },
  });
}

it("refuses unattended audit DDL while preserving the audited migration version and alias", () => {
  const temp = mkdtempSync(join(tmpdir(), "apb-staging-test-"));
  const output = join(temp, "output");
  let staged: string | undefined;
  try {
    prepareDeploy(output);
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

it("stages the #216 migrations after the last version already on production", () => {
  const temp = mkdtempSync(join(tmpdir(), "apb-staging-test-"));
  const output = join(temp, "output");
  let staged: string | undefined;
  try {
    const log = prepareDeploy(output);
    staged = readFileSync(output, "utf8").trim().slice("workdir=".length);
    const pending = readdirSync(join(staged, "supabase", "migrations"))
      .filter((file) => file.endsWith(".sql") && !file.endsWith("_already_applied.sql"))
      .filter((file) => file.slice(0, 14) > "20261025123000")
      .sort();
    expect(pending).toEqual([
      "20261025124500_audit_logs_tamper_resistance.sql",
      "20261025130000_audit_config_changes.sql",
      "20261025140000_private_instance.sql",
      "20261025200000_audit_content_writes.sql",
      "20261026090000_account_offboarding.sql",
      "20261026212458_optimize_rls_and_foreign_key_indexes.sql",
      "20261028062350_increase_skill_attachment_limit_to_25.sql",
      "20261028101338_audit_chain_tip_order_index.sql",
    ]);
    expect(log).toContain("20261025124500_audit_logs_tamper_resistance.sql");
    expect(log).not.toContain("20261025120000_audit_logs_tamper_resistance.sql");
  } finally {
    if (staged) cleanTemp(staged, "agentplaybooks-supabase-deploy-");
    cleanTemp(temp, "apb-staging-test-");
  }
});

it("refuses a local migration that would insert before the last production version", () => {
  const fake = "supabase/migrations/20261025120000_should_not_insert.sql";
  writeFileSync(fake, "-- fixture for insert-before-last-remote guard\n");
  try {
    expect(() => prepareDeploy(join(tmpdir(), "apb-staging-unused-output"))).toThrow(
      /inserted before the last migration on production[\s\S]*20261025120000_should_not_insert\.sql[\s\S]*Do not pass --include-all/,
    );
  } finally {
    unlinkSync(fake);
  }
});
