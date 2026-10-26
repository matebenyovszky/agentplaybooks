/**
 * Optional per-secret destination allow-list.
 *
 * `use_secret` and the secrets proxy inject a decrypted credential into an
 * outbound request whose URL the caller chooses. That is the intended design —
 * the agent never sees the plaintext — but it means anyone holding a
 * `secrets:read` key, including an agent following injected instructions, can
 * name any destination.
 *
 * A secret may therefore pin itself to a set of hosts. The feature is opt-in so
 * existing deployments are unaffected:
 *
 *   - `allowed_hosts` NULL or empty  -> any destination (previous behaviour)
 *   - `allowed_hosts` populated      -> only those hosts
 *   - `SECRETS_REQUIRE_ALLOWED_HOSTS=true` -> an unpinned secret cannot be used
 *     for outbound requests at all, so an operator can make pinning mandatory
 *     for their own instance without changing anyone else's.
 *
 * Entries are hostnames, compared case-insensitively. A leading `*.` matches
 * one or more subdomain labels but not the bare domain, so `*.example.com`
 * covers `api.example.com` but not `example.com` — list both if you want both.
 */

export function requiresAllowedHosts(
  configured = process.env.SECRETS_REQUIRE_ALLOWED_HOSTS,
): boolean {
  return configured?.trim().toLowerCase() === "true";
}

export function normalizeAllowedHosts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function hostMatches(hostname: string, pattern: string): boolean {
  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(1); // ".example.com"
    return hostname.endsWith(suffix) && hostname.length > suffix.length;
  }
  return hostname === pattern;
}

export type DestinationDecision =
  | { allowed: true }
  | { allowed: false; reason: string };

export function checkSecretDestination(
  url: string,
  allowedHosts: unknown,
  options: { requireAllowList?: boolean } = {},
): DestinationDecision {
  const requireAllowList = options.requireAllowList ?? requiresAllowedHosts();
  const patterns = normalizeAllowedHosts(allowedHosts);

  if (patterns.length === 0) {
    return requireAllowList
      ? {
        allowed: false,
        reason:
          "This deployment requires every secret to declare allowed_hosts before it can be used for outbound requests.",
      }
      : { allowed: true };
  }

  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return { allowed: false, reason: `Invalid URL: ${url}` };
  }

  if (patterns.some((pattern) => hostMatches(hostname, pattern))) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason:
      `Destination '${hostname}' is not in this secret's allowed_hosts (${patterns.join(", ")}).`,
  };
}

/**
 * Does `next` only narrow where a secret may be sent?
 *
 * An API key may tighten a secret's allow-list but not widen or clear it:
 * otherwise a key that may write secrets could redirect a credential it can
 * never read to a host of its own. An empty current list means "any host", so
 * any non-empty list narrows it.
 */
export function narrowsAllowedHosts(current: unknown, next: unknown): boolean {
  const before = normalizeAllowedHosts(current);
  const after = normalizeAllowedHosts(next);
  if (after.length === 0) return before.length === 0;
  if (before.length === 0) return true;
  return after.every((host) => before.includes(host));
}
