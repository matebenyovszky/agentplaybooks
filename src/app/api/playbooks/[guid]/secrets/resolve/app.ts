import { createApiApp } from "@/app/api/_shared/hono";
import { getServiceSupabase } from "@/app/api/_shared/supabase";
import { authorizeSecretRuntime, MAX_RUNTIME_SECRETS, secretNames } from "@/app/api/_shared/secret-runtime";
import { recordSecretAudit } from "@/app/api/_shared/audit";
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
  const access = await authorizeSecretRuntime(c.req.raw, c.req.param("guid") || "", mode);
  if (!access) return c.json({ error: "Authentication required or credential not authorized for this playbook" }, 401);
  const names = [...required, ...optional];
  const denied = names.filter(name => access.allowedNames && !access.allowedNames.includes(name));
  if (denied.length) {
    await Promise.all(denied.map(secretName => recordSecretAudit(access.audit, {
      operation: "secret.reveal", status: "denied", secretName, reason: "client_scope",
    })));
    return c.json({ error: "Credential does not allow the requested secrets" }, 403);
  }
  const db = getServiceSupabase();
  const { data: rows, error } = await db.from("secrets").select("*")
    .eq("playbook_id", access.playbookId).in("name", names);
  if (error || !rows) return c.json({ error: "Secret loading failed" }, 503);
  const byName = new Map(rows.map(row => [row.name, row]));
  const missing = required.filter(name => !byName.has(name));
  const blocked = rows.filter(row => !row.allow_api_key_reveal
    || (row.expires_at && Date.parse(row.expires_at) <= Date.now()));
  if (missing.length || blocked.length) {
    await Promise.all([
      ...missing.map(secretName => recordSecretAudit(access.audit, {
        operation: "secret.reveal", status: "error", secretName, reason: "not_found",
      })),
      ...blocked.map(row => recordSecretAudit(access.audit, {
        operation: "secret.reveal", status: "denied", secretName: row.name,
        reason: row.allow_api_key_reveal ? "expired" : "reveal_not_permitted",
      })),
    ]);
    return c.json({ error: "Required secrets are missing, expired, or not enabled for runtime reveal" }, 403);
  }
  const values: Record<string, string> = Object.create(null);
  try {
    for (const row of rows) {
      values[row.name] = await decryptSecret(row, access.ownerId, {
        playbookId: access.playbookId, secretName: row.name,
      });
    }
  } catch {
    await recordSecretAudit(access.audit, { operation: "secret.reveal", status: "error", reason: "decrypt_failed" });
    return c.json({ error: "Secret loading failed" }, 500);
  }
  const now = new Date().toISOString();
  await Promise.all(rows.map(async row => {
    await db.from("secrets").update({ last_used_at: now, use_count: row.use_count + 1 }).eq("id", row.id);
    await recordSecretAudit(access.audit, { operation: "secret.reveal", status: "success", secretName: row.name });
  }));
  if (access.clientId) await db.from("secret_clients").update({ last_used_at: now }).eq("id", access.clientId);
  return c.json({ values, missing_optional: optional.filter(name => !byName.has(name)) });
});
