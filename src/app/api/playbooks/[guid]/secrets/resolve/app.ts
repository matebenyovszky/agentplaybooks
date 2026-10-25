import { createApiApp } from "@/app/api/_shared/hono";
import { getServiceSupabase } from "@/app/api/_shared/supabase";
import { storedDisplayPrefix } from "@/app/api/_shared/auth";
import {
  bearerMayLoadRuntime,
  MAX_RUNTIME_SECRETS,
  mtlsRuntimeGrant,
  playbookOwnerByGuid,
  secretNames,
} from "@/app/api/_shared/secret-runtime";
import { recordSecretAudit, type AuditContext } from "@/app/api/_shared/audit";
import { decryptSecret } from "@/lib/crypto";

export const app = createApiApp("/api/playbooks/:guid/secrets/resolve");

app.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store, no-cache, must-revalidate, no-transform");
  c.header("Pragma", "no-cache");
  await next();
});
app.onError(() => new Response(JSON.stringify({ error: "Secret loading failed" }), {
  status: 500, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
}));

function auditTrail(
  playbookId: string,
  clientId: string | null,
  displayPrefix: string | null,
  request: Request,
): AuditContext {
  const requestId = request.headers.get("cf-ray") || request.headers.get("x-request-id");
  return {
    playbookId,
    actor: clientId
      ? { type: "mtls", id: clientId }
      : { type: "api_key", id: displayPrefix },
    requestId,
  };
}

app.post("/", async c => {
  const body = await c.req.json().catch(() => null);
  const required: unknown = body?.names;
  const optional: unknown = body?.optional_names ?? [];
  const mode = body?.auth_mode ?? "api_key";
  if (!secretNames(required) || !secretNames(optional)
    || required.length + optional.length === 0
    || required.length + optional.length > MAX_RUNTIME_SECRETS
    || optional.some(name => required.includes(name))
    || (mode !== "api_key" && mode !== "mtls")) {
    return c.json({ error: "Provide up to 100 distinct secret names and a valid auth_mode" }, 400);
  }
  const playbook = await playbookOwnerByGuid(c.req.param("guid") || "");
  if (!playbook) {
    return c.json({ error: "Authentication required or credential not authorized for this playbook" }, 401);
  }
  let clientId: string | null = null;
  let allowedNames: string[] | null = null;
  if (mode === "api_key") {
    if (!await bearerMayLoadRuntime(c.req.raw, playbook.playbookId)) {
      return c.json({ error: "Authentication required or credential not authorized for this playbook" }, 401);
    }
  } else {
    const grant = await mtlsRuntimeGrant(c.req.raw, playbook.playbookId);
    if (!grant) {
      return c.json({ error: "Authentication required or credential not authorized for this playbook" }, 401);
    }
    clientId = grant.clientId;
    allowedNames = grant.allowedNames;
  }
  const displayPrefix = clientId ? null : await storedDisplayPrefix(c.req.raw);
  const audit = auditTrail(playbook.playbookId, clientId, displayPrefix, c.req.raw);
  const names = [...required, ...optional];
  const denied = names.filter(name => allowedNames && !allowedNames.includes(name));
  if (denied.length) {
    await Promise.all(denied.map(name => recordSecretAudit(audit, {
      operation: "secret.reveal", status: "denied", secretName: name, reason: "client_scope",
    })));
    return c.json({ error: "Credential does not allow the requested secrets" }, 403);
  }
  const db = getServiceSupabase();
  const { data: rows, error } = await db.from("secrets").select("*")
    .eq("playbook_id", playbook.playbookId).in("name", names);
  if (error || !rows) return c.json({ error: "Secret loading failed" }, 503);
  const byName = new Map(rows.map(row => [row.name, row]));
  const missing = required.filter(name => !byName.has(name));
  const blocked = rows.filter(row => !row.allow_api_key_reveal
    || (row.expires_at && Date.parse(row.expires_at) <= Date.now()));
  if (missing.length || blocked.length) {
    await Promise.all([
      ...missing.map(name => recordSecretAudit(audit, {
        operation: "secret.reveal", status: "error", secretName: name, reason: "not_found",
      })),
      ...blocked.map(row => recordSecretAudit(audit, {
        operation: "secret.reveal", status: "denied", secretName: row.name,
        reason: row.allow_api_key_reveal ? "expired" : "reveal_not_permitted",
      })),
    ]);
    return c.json({ error: "Required secrets are missing, expired, or not enabled for runtime reveal" }, 403);
  }
  const values: Record<string, string> = Object.create(null);
  try {
    for (const row of rows) {
      values[row.name] = await decryptSecret(row, playbook.ownerId, {
        playbookId: playbook.playbookId, secretName: row.name,
      });
    }
  } catch {
    await recordSecretAudit(audit, { operation: "secret.reveal", status: "error", reason: "decrypt_failed" });
    return c.json({ error: "Secret loading failed" }, 500);
  }
  const now = new Date().toISOString();
  await Promise.all(rows.map(async row => {
    await db.from("secrets").update({ last_used_at: now, use_count: row.use_count + 1 }).eq("id", row.id);
    await recordSecretAudit(audit, { operation: "secret.reveal", status: "success", secretName: row.name });
  }));
  if (clientId) await db.from("secret_clients").update({ last_used_at: now }).eq("id", clientId);
  return c.json({ values, missing_optional: optional.filter(name => !byName.has(name)) });
});
