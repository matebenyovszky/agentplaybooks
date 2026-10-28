type Actor = { kind: "account" | "playbook_key"; id: string; accountId: string };
type Call = { started: number; tool: string; endpoint: "management" | "playbook"; outcome: "success" | "error" };
const actors = new WeakMap<Request, Actor>();
const calls = new WeakMap<Request, Call>();

/** Only verified database identities belong here; never take these values from request headers. */
export function noteMcpUsageActor(request: Request, actor: Actor) {
  actors.set(request, actor);
}

/** tool must be a catalog name or the constant connected_tool/unknown_tool. */
export function startMcpToolUsage(request: Request, tool: string, endpoint: Call["endpoint"]) {
  calls.set(request, { started: performance.now(), tool, endpoint, outcome: "error" });
}

export function succeedMcpToolUsage(request: Request, isError = false) {
  const call = calls.get(request);
  if (call) call.outcome = isError ? "error" : "success";
}

/** A management call delegated to the playbook handler is counted only by that handler. */
export function skipMcpToolUsage(request: Request) { calls.delete(request); }

function inList(id: string, list: string | undefined) {
  return (list ?? "").split(",").some(value => value.trim() === id);
}

export async function finishMcpToolUsage(request: Request, status: number) {
  const call = calls.get(request);
  calls.delete(request);
  const actor = actors.get(request);
  actors.delete(request);
  if (!call) return;
  // Usage must never fail a successful application request. No response-body
  // parsing, extra database query, arguments, IPs, emails or error text.
  try {
    const actorRef = actor ? Array.from(new Uint8Array(await crypto.subtle.digest(
      "SHA-256", new TextEncoder().encode(`apb-usage-v1:${actor.kind}:${actor.id}`),
    )), byte => byte.toString(16).padStart(2, "0")).join("") : undefined;
    const audience = !actor ? "anonymous"
      : inList(actor.accountId, process.env.MCP_TEST_ACCOUNT_IDS) ? "test"
      : inList(actor.accountId, process.env.MCP_INTERNAL_ACCOUNT_IDS) ? "internal" : "unclassified";
    console.info(JSON.stringify({
      event: "mcp.tool_usage", schemaVersion: 1, timestamp: new Date().toISOString(),
      endpoint: call.endpoint, tool: call.tool, actorKind: actor?.kind ?? "anonymous",
      actorRef, audience, outcome: status >= 400 ? "error" : call.outcome,
      status, durationMs: Math.round(performance.now() - call.started), sampleRate: 1,
    }));
  } catch {
    console.warn("MCP usage measurement unavailable");
  }
}
