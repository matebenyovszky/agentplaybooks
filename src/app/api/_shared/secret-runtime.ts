import { presentedApiKey, validateApiKey } from "./auth";
import { getPlaybookByGuid } from "./guards";
import { getServiceSupabase } from "./supabase";
import { verifiedClientFingerprint } from "@/lib/mtls";
import type { AuditContext } from "./audit";
import { recordSecretAudit } from "./audit";

export const SECRET_NAME = /^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/;
export const MAX_RUNTIME_SECRETS = 100;

export function secretNames(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= MAX_RUNTIME_SECRETS
    && value.every(name => typeof name === "string" && SECRET_NAME.test(name))
    && new Set(value).size === value.length;
}

export type RuntimeAccess = {
  playbookId: string;
  ownerId: string;
  allowedNames: string[] | null;
  clientId: string | null;
  audit: AuditContext;
};

/** Explicit modes prevent a failed certificate check falling back to a bearer key. */
export async function authorizeSecretRuntime(
  request: Request, guid: string, mode: "api_key" | "mtls",
): Promise<RuntimeAccess | null> {
  const requestId = request.headers.get("cf-ray") || request.headers.get("x-request-id");
  if (mode === "api_key") {
    const key = await validateApiKey(request, "secrets:read");
    if (!key) return null;
    const playbook = await getPlaybookByGuid(guid, null, key.playbooks.id);
    if (!playbook || playbook.id !== key.playbooks.id) return null;
    return {
      playbookId: playbook.id, ownerId: playbook.user_id, allowedNames: null, clientId: null,
      audit: { playbookId: playbook.id, actor: { type: "api_key", id: key.key_prefix }, requestId },
    };
  }

  // A certificate credential never implicitly inherits a bearer key's privileges.
  if (presentedApiKey(request)) return null;
  const fingerprint = verifiedClientFingerprint();
  if (!fingerprint) return null;
  const db = getServiceSupabase();
  const { data: playbook, error: playbookError } = await db.from("playbooks")
    .select("id, user_id").eq("guid", guid).maybeSingle();
  if (playbookError || !playbook) return null;
  const { data: client, error } = await db.from("secret_clients").select("*")
    .eq("playbook_id", playbook.id).eq("certificate_sha256", fingerprint)
    .eq("is_active", true).maybeSingle();
  if (error || !client || (client.expires_at && Date.parse(client.expires_at) <= Date.now())) {
    await recordSecretAudit({
      playbookId: playbook.id, actor: { type: "mtls", id: client?.id ?? null }, requestId,
    }, {
      operation: "secret.reveal", status: "denied",
      reason: error ? "client_lookup_failed" : client ? "client_expired" : "client_not_registered_or_revoked",
    });
    return null;
  }
  return {
    playbookId: playbook.id, ownerId: playbook.user_id,
    allowedNames: client.secret_names, clientId: client.id,
    audit: { playbookId: playbook.id, actor: { type: "mtls", id: client.id }, requestId },
  };
}
