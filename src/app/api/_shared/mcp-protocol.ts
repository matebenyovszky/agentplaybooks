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
