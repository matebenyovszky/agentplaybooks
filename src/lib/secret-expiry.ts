/**
 * When a vault secret stops being usable.
 *
 * An expired secret cannot be used any more: it is not proxied, not handed to a
 * federated server, and not revealed to an API key. Its owner can still read it
 * in the dashboard, which is how it gets replaced. The comparison is the one
 * `auth.ts` already applies to an expired API key, so both credentials expire
 * the same way.
 *
 * The expiry is the owner's rule rather than part of the value: rotating a
 * secret keeps it, exactly as `apb secrets push` documents. Bringing an expired
 * secret back means setting a later `expires_at` or clearing it — in the
 * dashboard's rotate dialog, through `PUT /secrets/:name`, or with the optional
 * `expires_at` on the `rotate_secret` tool.
 */

export function isSecretExpired(expiresAt: string | null | undefined, now = Date.now()): boolean {
  if (!expiresAt) return false;
  const at = Date.parse(expiresAt);
  return Number.isFinite(at) && at <= now;
}

/** The refusal an agent sees, naming the way out. */
export function expiredSecretMessage(name: string, expiresAt: string | null | undefined): string {
  return `Secret '${name}' expired at ${expiresAt}. Its owner can set a later expires_at, `
    + "or clear it, to make it usable again.";
}
