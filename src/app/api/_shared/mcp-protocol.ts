/**
 * Transport-level rules shared by every MCP endpoint in this app.
 *
 * These lived only in the management endpoint, and the playbook endpoint drifted
 * behind them — it answered a notification with a JSON-RPC error and served the
 * manifest to a client asking for an event stream, which is enough to make a
 * conforming client report the server as unreachable while every tool call
 * actually worked. One definition, used by both, so that cannot happen again.
 */

/**
 * The two eras, kept apart on purpose.
 *
 * `2026-07-28` removed the `initialize` handshake, so it must never be the
 * answer to one: a legacy client told "2026-07-28" has been handed a version
 * whose handshake does not exist. Negotiation on `initialize` therefore picks
 * from the legacy list only, while discovery reports everything we serve.
 */
export const MODERN_PROTOCOL_VERSIONS = ["2026-07-28"] as const;

export const LEGACY_PROTOCOL_VERSIONS = [
  "2024-11-05",
  "2025-03-26",
  "2025-06-18",
  "2025-11-25",
] as const;

/** The newest revision we serve at all. */
export const LATEST_PROTOCOL_VERSION = MODERN_PROTOCOL_VERSIONS[0];

/** The newest revision that still has a handshake to negotiate. */
export const LATEST_LEGACY_PROTOCOL_VERSION = LEGACY_PROTOCOL_VERSIONS[LEGACY_PROTOCOL_VERSIONS.length - 1];

export const SUPPORTED_PROTOCOL_VERSIONS = new Set<string>([
  ...LEGACY_PROTOCOL_VERSIONS,
  ...MODERN_PROTOCOL_VERSIONS,
]);

/**
 * A GET on an MCP endpoint means "open a server-to-client SSE stream". Neither
 * endpoint offers one, and the spec requires 405 in that case; the JSON manifest
 * stays available for anything that asks for a document instead.
 */
export function requestsEventStream(accept?: string): boolean {
  return Boolean(accept?.includes("text/event-stream"));
}

/**
 * The protocol version to report back. The client's own revision is echoed when
 * we support it, so a newer client is not told to speak an older dialect than it
 * asked for.
 */
export function negotiateProtocolVersion(requested?: unknown): string {
  return typeof requested === "string"
    && (LEGACY_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
    ? requested
    : LATEST_LEGACY_PROTOCOL_VERSION;
}

/**
 * A JSON-RPC notification carries no `id` and must never be answered. MCP names
 * every notification `notifications/*`, which is checked too — but an explicit
 * `id: null` is not treated as one: the spec forbids it in a request, yet a
 * client that sends it is still waiting for an answer.
 */
export function isNotification(method: unknown, id: unknown): boolean {
  return id === undefined || (typeof method === "string" && method.startsWith("notifications/"));
}

/**
 * The methods that establish a connection rather than return anything from the
 * playbook: the legacy handshake and its modern-era replacement.
 *
 * These must answer without a credential, even for a private playbook. A client
 * probes the URL before it applies any header, and on an MCP endpoint a 401 is
 * the authorization spec's way of saying "this is an OAuth protected resource,
 * start the flow" — so refusing the handshake makes an OAuth-capable client go
 * looking for metadata we do not serve. Claude's connector dialog shows the
 * result: it labels the server "Always required — Detected", then fails with no
 * message, whichever authentication mode the operator picks.
 *
 * Both answers carry static identity only — our name, version, protocol
 * versions, and capability list — never the playbook's name or instructions. The
 * methods that return data are still refused, so the credential still decides
 * what a caller can read; it no longer decides whether the connection can be
 * established.
 */
const HANDSHAKE_METHODS = new Set(["initialize", "server/discover"]);

export function isHandshakeMethod(method: unknown): boolean {
  return typeof method === "string" && HANDSHAKE_METHODS.has(method);
}

/**
 * How an MCP endpoint should refuse a private playbook.
 *
 * These endpoints used to answer 404 "Playbook not found" whether the playbook
 * was absent or merely protected. A client cannot act on that: 404 means "there
 * is nothing at this URL", so a connector reports the server as unreachable
 * rather than prompting for a credential — which is exactly what happens when
 * someone adds a private playbook as a custom connector, since the client
 * probes the URL before it applies any header.
 *
 * 401 with a challenge is the HTTP answer to "authenticate first", and it is
 * what the MCP authorization spec expects of an HTTP transport. It does confirm
 * that a GUID exists, which the 404 hid — a trade worth making, because the GUID
 * is 64 bits of the caller's own knowledge and the alternative breaks every
 * connector flow for private playbooks.
 *
 * No `WWW-Authenticate` is sent, and that is deliberate. A `Bearer` challenge is
 * how the MCP authorization spec announces an OAuth protected resource, so an
 * OAuth-capable client reads it as "start an OAuth flow" — Claude's connector
 * switched from "API key" to "Always required" and then failed, because there is
 * no OAuth metadata endpoint here and never was. The 401 alone carries what we
 * mean: the endpoint exists and needs a credential the operator configures.
 *
 * A credential that was presented and rejected gets 403 instead, naming the
 * permission it lacks: with 401 the client would keep retrying the same key.
 */

export function privateAccessRefusal(request: Request): {
  status: 401 | 403;
  message: string;
  headers: Record<string, string>;
} {
  const presented = Boolean(request.headers.get("Authorization"));
  return presented
    ? {
      status: 403,
      message: "That credential cannot read this playbook. A playbook API key needs the memory:read permission; a user API key needs playbooks:read and access to the playbook.",
      headers: {},
    }
    : {
      status: 401,
      message: "This playbook is private. Send an API key as `Authorization: Bearer <key>`.",
      headers: {},
    };
}
