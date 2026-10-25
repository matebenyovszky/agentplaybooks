import { readFileSync, statSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "../src/lib/crypto";

const originalKey = process.env.SECRETS_ENCRYPTION_KEY;

const OWNER = "00000000-0000-4000-8000-0000000000a1";
const PLAYBOOK_ID = "00000000-0000-4000-8000-0000000000b1";
const SECRET_NAME = "DRILL_TOKEN";
const SECRET_VALUE = "drill-secret-value-do-not-use-in-prod";

describe("self-host restore drill fixtures", () => {
  afterEach(() => {
    if (originalKey === undefined) delete process.env.SECRETS_ENCRYPTION_KEY;
    else process.env.SECRETS_ENCRYPTION_KEY = originalKey;
  });

  it("round-trips the drill secret with the application vault code", async () => {
    process.env.SECRETS_ENCRYPTION_KEY = "0123456789abcdef".repeat(4);
    const encrypted = await encryptSecret(SECRET_VALUE, OWNER, {
      playbookId: PLAYBOOK_ID,
      secretName: SECRET_NAME,
    });
    await expect(
      decryptSecret(encrypted, OWNER, { playbookId: PLAYBOOK_ID, secretName: SECRET_NAME }),
    ).resolves.toBe(SECRET_VALUE);
  });

  it("keeps backup and restore scripts executable", () => {
    for (const relative of [
      "scripts/self-host/backup.sh",
      "scripts/self-host/restore.sh",
      "scripts/self-host/restore-drill.sh",
    ]) {
      const source = readFileSync(relative, "utf8");
      expect(source.startsWith("#!/usr/bin/env bash")).toBe(true);
      expect(statSync(relative).mode & 0o111).toBeGreaterThan(0);
    }
  });

  it("never ships the vault master key in the backup helper", () => {
    const lib = readFileSync("scripts/self-host/lib.sh", "utf8");
    const backup = readFileSync("scripts/self-host/backup.sh", "utf8");
    expect(lib).toContain("SECRETS_ENCRYPTION_KEY");
    expect(backup).toContain("KEY-SEPARATION.txt");
    expect(backup).toContain("encryption_master_key_included");
    expect(backup).toContain("false");
  });
});
