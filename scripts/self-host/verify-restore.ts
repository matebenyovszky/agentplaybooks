/**
 * Post-restore assertions for the self-host drill:
 *  - playbook row intact
 *  - vault secret decrypts to the seeded plaintext
 *  - audit_logs row count preserved
 *  - storage object file present
 */
import { execFileSync } from "node:child_process";
import { decryptSecret } from "../../src/lib/crypto";

const OWNER = "00000000-0000-4000-8000-0000000000a1";
const PLAYBOOK_ID = "00000000-0000-4000-8000-0000000000b1";
const GUID = "restore-drill-playbook";
const PLAYBOOK_NAME = "Restore drill playbook";
const SECRET_NAME = "DRILL_TOKEN";
const SECRET_VALUE = "drill-secret-value-do-not-use-in-prod";
const AUDIT_COUNT = 3;
const STORAGE_OBJECT = "drill-object.txt";
const STORAGE_CONTENTS = "restore-drill-object\n";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set`);
  return value;
}

function compose(
  composeFile: string,
  project: string,
  args: string[],
  input?: string,
): string {
  return execFileSync(
    "docker",
    ["compose", "-f", composeFile, "--project-name", project, ...args],
    { encoding: "utf8", input, maxBuffer: 10 * 1024 * 1024 },
  );
}

async function main() {
  const composeFile = requireEnv("COMPOSE_FILE");
  const project = process.env.COMPOSE_PROJECT_NAME || "agentplaybooks-selfhost";
  const dbService = process.env.DB_SERVICE || "db";
  const storageService = process.env.STORAGE_SERVICE || "storage";
  const storagePath = process.env.STORAGE_PATH || "/var/lib/storage";
  const postgresUser = process.env.POSTGRES_USER || "postgres";
  const postgresDb = process.env.POSTGRES_DB || "postgres";

  const run = (args: string[], input?: string) => compose(composeFile, project, args, input);
  const psql = (sql: string): string =>
    run(
      ["exec", "-T", dbService, "psql", "-U", postgresUser, "-d", postgresDb, "-At", "-v", "ON_ERROR_STOP=1", "-c", sql],
    ).trim();

  const playbook = psql(
    `SET ROLE service_role; SELECT guid || '|' || name FROM public.playbooks WHERE id = '${PLAYBOOK_ID}'`,
  );
  if (playbook.split("\n").at(-1) !== `${GUID}|${PLAYBOOK_NAME}`) {
    throw new Error(`Playbook mismatch: ${playbook}`);
  }

  const secretRow = psql(
    `SELECT encrypted_value || E'\\t' || iv || E'\\t' || auth_tag FROM public.secrets WHERE playbook_id = '${PLAYBOOK_ID}' AND name = '${SECRET_NAME}'`,
  );
  const [encrypted_value, iv, auth_tag] = secretRow.split("\t");
  if (!encrypted_value || !iv || !auth_tag) {
    throw new Error(`Secret row missing fields: ${secretRow}`);
  }

  const plaintext = await decryptSecret(
    { encrypted_value, iv, auth_tag },
    OWNER,
    { playbookId: PLAYBOOK_ID, secretName: SECRET_NAME },
  );
  if (plaintext !== SECRET_VALUE) {
    throw new Error("Decrypted secret does not match the seeded value");
  }

  const auditCount = Number(
    psql(`SELECT count(*) FROM public.audit_logs WHERE playbook_id = '${PLAYBOOK_ID}'`),
  );
  if (auditCount !== AUDIT_COUNT) {
    throw new Error(`audit_logs count ${auditCount} != ${AUDIT_COUNT}`);
  }

  const storageFile = run([
    "exec",
    "-T",
    storageService,
    "cat",
    `${storagePath}/${STORAGE_OBJECT}`,
  ]);
  if (storageFile !== STORAGE_CONTENTS) {
    throw new Error(`Storage object mismatch: ${JSON.stringify(storageFile)}`);
  }

  process.stdout.write(
    [
      "VERIFY_OK=1",
      `PLAYBOOK=${GUID}`,
      `SECRET_DECRYPTED=1`,
      `AUDIT_LOGS=${auditCount}`,
      `STORAGE_OBJECT=${STORAGE_OBJECT}`,
    ].join("\n") + "\n",
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
