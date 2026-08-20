/**
 * Transport-level rules shared by every MCP endpoint in this app.
 *
 * These lived only in the management endpoint, and the playbook endpoint drifted
 * behind them — it answered a notification with a JSON-RPC error and served the
 * manifest to a client asking for an event stream, which is enough to make a
 * conforming client report the server as unreachable while every tool call
 * actually worked. One definition, used by both, so that cannot happen again.
 */

export const LATEST_PROTOCOL_VERSION = "2025-11-25";

export const SUPPORTED_PROTOCOL_VERSIONS = new Set([
  "2024-11-05",
  "2025-03-26",
  "2025-06-18",
  LATEST_PROTOCOL_VERSION,
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
  return typeof requested === "string" && SUPPORTED_PROTOCOL_VERSIONS.has(requested)
    ? requested
    : LATEST_PROTOCOL_VERSION;
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
 * A credential that was presented and rejected gets 403 instead, naming the
 * permission it lacks: with 401 the client would keep retrying the same key.
 */
export const AUTH_CHALLENGE = { "WWW-Authenticate": 'Bearer realm="AgentPlaybooks"' } as const;

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
      headers: { ...AUTH_CHALLENGE },
    };
}
