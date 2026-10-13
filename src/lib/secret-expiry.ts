/**
 * When a vault secret stops being usable.
 *
 * An expired secret cannot be used any more: it is not proxied, not handed to a
 * federated server, and not revealed to an API key. Its owner can still read it
 * in the dashboard, which is how it gets replaced.
 *
 * The expiry is the owner's rule rather than part of the value: rotating a
 * secret keeps it, exactly as `apb secrets push` documents. Bringing an expired
 * secret back means setting a later `expires_at` or clearing it.
 */
import { isoTimestamp } from "@/lib/timestamp";

/**
 * Whether the secret has expired. An expiry that is set but cannot be read
 * counts as expired: for a credential, failing closed is the safe direction.
 */
export function isSecretExpired(expiresAt: string | null | undefined, now = Date.now()): boolean {
  if (!expiresAt) return false;
  const at = Date.parse(expiresAt);
  return !Number.isFinite(at) || at <= now;
}

/** The refusal an agent sees, naming the way out. */
export function expiredSecretMessage(name: string, expiresAt: string | null | undefined): string {
  return `Secret '${name}' expired at ${expiresAt}. Its owner can set a later expires_at, `
    + "or clear it, to make it usable again.";
}

/**
 * An `expires_at` from a request, ready to store: `undefined` when the request
 * leaves it alone, `null` to clear it, otherwise a UTC timestamp. Throws for a
 * time without a timezone, which would otherwise be read in whatever zone the
 * database uses and expire hours early or late.
 */
export function expiresAtInput(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return isoTimestamp(value, "expires_at");
}
