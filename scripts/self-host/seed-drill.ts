/**
 * Seed a playbook, an AES-GCM vault secret, audit rows, and a storage object
 * for the self-host restore drill. Prints SQL on stdout for `psql`.
 */
import { encryptSecret } from "../../src/lib/crypto";

const OWNER = "00000000-0000-4000-8000-0000000000a1";
const PLAYBOOK_ID = "00000000-0000-4000-8000-0000000000b1";
const SECRET_ID = "00000000-0000-4000-8000-0000000000c1";
const GUID = "restore-drill-playbook";
const PLAYBOOK_NAME = "Restore drill playbook";
const SECRET_NAME = "DRILL_TOKEN";
const SECRET_VALUE = "drill-secret-value-do-not-use-in-prod";
const AUDIT_COUNT = 3;

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

async function main() {
  const key = process.env.SECRETS_ENCRYPTION_KEY;
  if (!key || !/^[0-9a-f]{64}$/i.test(key)) {
    throw new Error("SECRETS_ENCRYPTION_KEY must be 64 hex characters for the drill");
  }

  const encrypted = await encryptSecret(SECRET_VALUE, OWNER, {
    playbookId: PLAYBOOK_ID,
    secretName: SECRET_NAME,
  });

  const sql = `
BEGIN;

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES (${sqlLiteral(OWNER)}, 'restore-drill@example.invalid', '{"full_name":"Restore Drill"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, auth_user_id, display_name, is_virtual, is_verified)
VALUES (${sqlLiteral(OWNER)}, ${sqlLiteral(OWNER)}, 'Restore Drill', false, false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.playbooks (id, user_id, guid, name, description, visibility)
VALUES (
  ${sqlLiteral(PLAYBOOK_ID)},
  ${sqlLiteral(OWNER)},
  ${sqlLiteral(GUID)},
  ${sqlLiteral(PLAYBOOK_NAME)},
  'Seeded for the on-prem restore drill',
  'private'
);

INSERT INTO public.secrets (
  id, playbook_id, name, description,
  encrypted_value, iv, auth_tag, category, created_by
) VALUES (
  ${sqlLiteral(SECRET_ID)},
  ${sqlLiteral(PLAYBOOK_ID)},
  ${sqlLiteral(SECRET_NAME)},
  'Restore-drill fixture',
  ${sqlLiteral(encrypted.encrypted_value)},
  ${sqlLiteral(encrypted.iv)},
  ${sqlLiteral(encrypted.auth_tag)},
  'token',
  'restore-drill'
);

INSERT INTO public.audit_logs (playbook_id, operation, target, status, actor_type, actor_id, secret_name)
VALUES
  (${sqlLiteral(PLAYBOOK_ID)}, 'secret.create', NULL, 'success', 'owner', ${sqlLiteral(OWNER)}, ${sqlLiteral(SECRET_NAME)}),
  (${sqlLiteral(PLAYBOOK_ID)}, 'secret.use', 'api.example.invalid', 'success', 'api_key', 'apb_drill', ${sqlLiteral(SECRET_NAME)}),
  (${sqlLiteral(PLAYBOOK_ID)}, 'secret.reveal', NULL, 'denied', 'anonymous', NULL, ${sqlLiteral(SECRET_NAME)});

CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL,
  name text NOT NULL,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);
INSERT INTO storage.objects (bucket_id, name, metadata)
VALUES ('restore-drill', 'drill-object.txt', '{"source":"restore-drill"}'::jsonb);

COMMIT;
`;

  process.stdout.write(sql);
  process.stderr.write(
    JSON.stringify(
      {
        ownerId: OWNER,
        playbookId: PLAYBOOK_ID,
        guid: GUID,
        playbookName: PLAYBOOK_NAME,
        secretName: SECRET_NAME,
        secretValue: SECRET_VALUE,
        auditCount: AUDIT_COUNT,
        storageObject: "drill-object.txt",
      },
      null,
      2,
    ) + "\n",
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
