import { presentedApiKey, validateApiKey } from "./auth";
import { getServiceSupabase } from "./supabase";
import { verifiedClientFingerprint } from "@/lib/mtls";
import { recordSecretAudit } from "./audit";
import { playbookIdentifierColumn } from "@/lib/playbook-identifier";

export const SECRET_NAME = /^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/;
export const MAX_RUNTIME_SECRETS = 100;

export function secretNames(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= MAX_RUNTIME_SECRETS
    && value.every(name => typeof name === "string" && SECRET_NAME.test(name))
    && new Set(value).size === value.length;
}

export type PlaybookOwner = {
  playbookId: string;
  ownerId: string;
};

export type MtlsRuntimeGrant = {
  clientId: string;
  allowedNames: string[] | null;
};

/** Playbook id and owner from the GUID/UUID in the URL. Does not read a bearer key. */
export async function playbookOwnerByGuid(guid: string): Promise<PlaybookOwner | null> {
  const { data, error } = await getServiceSupabase()
    .from("playbooks")
    .select("id, user_id")
    .eq(playbookIdentifierColumn(guid), guid)
    .maybeSingle();
  if (error || !data?.id || !data.user_id) return null;
  return { playbookId: data.id, ownerId: data.user_id };
}

/**
 * Whether this request's playbook key is bound to `playbookId` and may load
 * runtime vault values. Returns only a boolean so the call cannot taint the
 * SIEM HMAC body (CodeQL `js/insufficient-password-hash`).
 */
export async function bearerMayLoadRuntime(request: Request, playbookId: string): Promise<boolean> {
  const accepted = await validateApiKey(request, "secrets:read");
  return Boolean(accepted && accepted.playbooks.id === playbookId);
}

/**
 * Certificate grant for this playbook, or null. Does not fall back to a bearer
 * key. Denied attempts are recorded with the mTLS client id, not a key prefix.
 */
export async function mtlsRuntimeGrant(
  request: Request, playbookId: string,
): Promise<MtlsRuntimeGrant | null> {
  const requestId = request.headers.get("cf-ray") || request.headers.get("x-request-id");
  if (presentedApiKey(request)) return null;
  const fingerprint = verifiedClientFingerprint(request);
  if (!fingerprint) return null;
  const { data: client, error } = await getServiceSupabase().from("secret_clients").select("*")
    .eq("playbook_id", playbookId).eq("certificate_sha256", fingerprint)
    .eq("is_active", true).maybeSingle();
  if (error || !client || (client.expires_at && Date.parse(client.expires_at) <= Date.now())) {
    await recordSecretAudit({
      playbookId, actor: { type: "mtls", id: client?.id ?? null }, requestId,
    }, {
      operation: "secret.reveal", status: "denied",
      reason: error ? "client_lookup_failed" : client ? "client_expired" : "client_not_registered_or_revoked",
    });
    return null;
  }
  return { clientId: client.id, allowedNames: client.secret_names };
}
