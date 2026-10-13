import { createApiApp } from "@/app/api/_shared/hono";
import { getAuthenticatedUser } from "@/app/api/_shared/auth";
import { getServiceSupabase } from "@/app/api/_shared/supabase";
import { secretNames } from "@/app/api/_shared/secret-runtime";
import { recordSecretAudit } from "@/app/api/_shared/audit";
import { normalizeCertificateFingerprint } from "@/lib/mtls";

export const app = createApiApp("/api/playbooks/:guid/secret-clients");
app.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  await next();
});

async function owner(request: Request, identifier: string | undefined) {
  if (!identifier) return null;
  const user = await getAuthenticatedUser(request);
  if (!user) return null;
  const field = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(identifier) ? "id" : "guid";
  const { data, error } = await getServiceSupabase().from("playbooks").select("id")
    .eq(field, identifier).eq("user_id", user.id).maybeSingle();
  return !error && data ? { playbookId: data.id, actor: { type: "owner" as const, id: user.id } } : null;
}

app.get("/", async c => {
  const access = await owner(c.req.raw, c.req.param("guid"));
  if (!access) return c.json({ error: "Playbook owner access required" }, 403);
  const { data, error } = await getServiceSupabase().from("secret_clients").select("*")
    .eq("playbook_id", access.playbookId).order("created_at", { ascending: false });
  if (error) return c.json({ error: "Could not load certificate clients" }, 503);
  return c.json(data);
});

app.post("/", async c => {
  const access = await owner(c.req.raw, c.req.param("guid"));
  if (!access) return c.json({ error: "Playbook owner access required" }, 403);
  const body = await c.req.json().catch(() => null);
  const fingerprint = normalizeCertificateFingerprint(body?.certificate_sha256);
  const expiresAt = body?.expires_at ?? null;
  if (typeof body?.name !== "string" || !body.name.trim() || body.name.length > 100
    || !fingerprint || !secretNames(body.secret_names) || !body.secret_names.length
    || (expiresAt !== null && (typeof expiresAt !== "string"
      || !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now()))) {
    return c.json({ error: "Provide a name, SHA-256 fingerprint, explicit secret names, and an optional future expiry" }, 400);
  }
  const { data, error } = await getServiceSupabase().from("secret_clients").insert({
    playbook_id: access.playbookId, name: body.name.trim(), certificate_sha256: fingerprint,
    secret_names: body.secret_names, expires_at: expiresAt,
  }).select("*").single();
  if (error) return c.json({ error: error.code === "23505" ? "Certificate already registered in this playbook" : "Could not register certificate" }, error.code === "23505" ? 409 : 503);
  await recordSecretAudit(access, { operation: "secret.client_create", status: "success", target: data.id });
  return c.json(data, 201);
});

app.delete("/:id", async c => {
  const access = await owner(c.req.raw, c.req.param("guid"));
  if (!access) return c.json({ error: "Playbook owner access required" }, 403);
  const id = c.req.param("id");
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id)) return c.json({ error: "Invalid client ID" }, 400);
  const { data, error } = await getServiceSupabase().from("secret_clients").update({ is_active: false })
    .eq("playbook_id", access.playbookId).eq("id", id).select("id").maybeSingle();
  if (error) return c.json({ error: "Could not revoke certificate" }, 503);
  if (!data) return c.json({ error: "Client not found" }, 404);
  await recordSecretAudit(access, { operation: "secret.client_revoke", status: "success", target: id });
  return c.json({ revoked: true });
});
