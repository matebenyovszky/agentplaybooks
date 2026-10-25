/**
 * Writing the playbook audit trail.
 *
 * One table, `audit_logs`, carries both kinds of event: federated MCP calls
 * (written by the federation `audit` callback, which already had this table to
 * itself) and secrets vault operations, namespaced `secret.*`. Two rules shape
 * the vault side:
 *
 * 1. **A refusal is an event.** `status` distinguishes an authorized call that
 *    failed (`error`) from one that was turned away (`denied`). A trail holding
 *    only successes cannot answer the question it exists for.
 * 2. **The trail must not become a second copy of the secret.** No value, no
 *    full URL (a path or query string carries data of its own — `secret.use`
 *    keeps the destination host and nothing more), no API key, and `error_code`
 *    is a short code rather than an error message, because messages
 *    interpolate their inputs.
 *
 * A write never throws. An audit backend that is briefly unavailable must not
 * take the vault down with it; the failure goes to the server log, the same
 * choice the federation writer makes.
 */

import { getServiceSupabase } from "./supabase";
import type { FederationAuditEvent } from "@/lib/mcp/federation";
import type { AuditActorType, AuditLogRow, SecretAuditOperation } from "@/lib/supabase/types";
import { scheduleAuditForward } from "./audit-forward";

type AuditLogInsert = Partial<AuditLogRow> & Pick<AuditLogRow, "playbook_id" | "operation" | "status">;

/** Full issued playbook/user API keys (`apb_live_` / `apb_test_` + 16+ secret chars). Prefixes end in `...`. */
const FULL_APB_KEY = /\bapb_(?:live|test)_[A-Za-z0-9]{16,}\b/g;
const FULL_APB_KEY_EXACT = /^apb_(?:live|test)_[A-Za-z0-9]{16,}$/;

/** Literal so a raw key never flows (via slice) into the SIEM HMAC body. */
const REDACTED_KEY = "[redacted-key]";

export function redactAuditSecrets(value: string): string {
  return value
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(FULL_APB_KEY, REDACTED_KEY);
}

/** Host only for http(s); other URLs drop userinfo, query, and fragment. */
export function sanitizeAuditTarget(target: string | null | undefined): string | null {
  if (target == null || target === "") return target ?? null;
  try {
    const url = new URL(target);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.hostname.toLowerCase() || null;
    }
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return redactAuditSecrets(url.toString());
  } catch {
    return redactAuditSecrets(target);
  }
}

export function sanitizeAuditInsert<T extends AuditLogInsert>(row: T): T {
  const actor = row.actor_id;
  return {
    ...row,
    actor_id:
      actor == null
        ? actor
        : FULL_APB_KEY_EXACT.test(actor)
          ? REDACTED_KEY
          : redactAuditSecrets(actor),
    target: sanitizeAuditTarget(row.target),
    error_code: row.error_code == null ? row.error_code : redactAuditSecrets(row.error_code),
    secret_name: row.secret_name == null ? row.secret_name : redactAuditSecrets(row.secret_name),
    request_id: row.request_id == null ? row.request_id : redactAuditSecrets(row.request_id),
  };
}

export type AuditActor = {
  type: AuditActorType;
  /** A user id, or an API key prefix. Never the key itself. */
  id: string | null;
};

/**
 * An event under construction.
 *
 * `status` is kept current as the handler proceeds: it starts at `denied`,
 * because a handler that throws before its authorization check has refused the
 * caller, and moves to `error` once the caller is known to be allowed. The
 * flush sets `success` on the way out. This is what lets a single catch block
 * classify a failure correctly without parsing its own error messages.
 */
export type SecretAuditDraft = {
  operation: SecretAuditOperation;
  status: "success" | "denied" | "error";
  secretName?: string | null;
  /** The destination host of a `secret.use`. Host only. */
  target?: string | null;
  /** A short code, never a message. */
  reason?: string | null;
};

export type AuditContext = {
  playbookId: string;
  actor: AuditActor;
  requestId?: string | null;
};

/** A draft for an operation whose caller has not been authorized yet. */
export function beginSecretAudit(
  operation: SecretAuditOperation,
  fields: Omit<SecretAuditDraft, "operation" | "status"> = {},
): SecretAuditDraft {
  return { operation, status: "denied", ...fields };
}

/**
 * Who is acting, from whichever credential the handler accepted.
 *
 * The owner's session wins over an API key when both are present, matching the
 * order the secrets handlers themselves check them in.
 */
export function auditActor(
  user: { id: string } | null | undefined,
  storedDisplayPrefix: string | null | undefined,
): AuditActor {
  if (user) return { type: "owner", id: user.id };
  if (storedDisplayPrefix) return { type: "api_key", id: storedDisplayPrefix };
  return { type: "anonymous", id: null };
}

/**
 * The host a credential was sent to, or null when the URL will not parse.
 *
 * Only the hostname survives on purpose: it answers "where did this credential
 * go" without copying the request into the log.
 */
export function destinationHostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

/**
 * The `audit` callback the federation layer expects, writing into the same
 * trail. Both MCP entry points use this one rather than each keeping its own
 * copy of the insert.
 */
async function insertAuditLog(row: AuditLogInsert): Promise<void> {
  const safe = sanitizeAuditInsert(row);
  const { data, error } = await getServiceSupabase()
    .from("audit_logs")
    .insert(safe)
    .select()
    .single();
  if (error) {
    console.error("Failed to write audit log", error.message);
    return;
  }
  scheduleAuditForward(data ?? safe);
}

export function federationAuditWriter(playbookId: string, requestId?: string | null) {
  return async (event: FederationAuditEvent) => {
    try {
      await insertAuditLog({
        playbook_id: playbookId,
        mcp_server_id: event.serverId,
        operation: event.operation,
        target: event.target || null,
        status: event.status,
        latency_ms: event.latencyMs,
        error_code: event.errorCode || null,
        request_id: requestId || null,
      });
    } catch (err) {
      // Same contract as the vault writer: losing an audit row must not turn a
      // working federated call into a failed one.
      console.error("Failed to write audit log", err);
    }
  };
}

export async function recordSecretAudit(
  context: AuditContext,
  draft: SecretAuditDraft,
): Promise<void> {
  try {
    await insertAuditLog({
      playbook_id: context.playbookId,
      // No federated server is involved in a vault operation.
      mcp_server_id: null,
      operation: draft.operation,
      target: draft.target ?? null,
      status: draft.status,
      error_code: draft.reason ?? null,
      actor_type: context.actor.type,
      actor_id: context.actor.id,
      secret_name: draft.secretName ?? null,
      request_id: context.requestId ?? null,
    });
  } catch (err) {
    console.error("Failed to write audit log", err);
  }
}

/**
 * Record the outcome of a handler that kept a draft.
 *
 * `outcome: "failure"` keeps whatever classification the draft reached, so a
 * throw before the authorization check is recorded as `denied` and one after it
 * as `error`.
 */
export async function flushSecretAudit(
  context: AuditContext,
  draft: SecretAuditDraft | null,
  outcome: "success" | "failure",
  fallbackReason?: string,
): Promise<void> {
  if (!draft) return;
  if (outcome === "success") {
    draft.status = "success";
    draft.reason = null;
  } else if (!draft.reason) {
    draft.reason = fallbackReason ?? "failed";
  }
  await recordSecretAudit(context, draft);
}
