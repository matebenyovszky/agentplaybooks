import readline from "node:readline";

const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

/** Demand-driven transport for AgentPlaybooks' JSON MCP endpoints. No timer,
 * health poll, discovery refresh, or automatic retry issues a network request.
 * Hermes leaves a stdio connection idle instead of pinging an HTTP server. */
export function createMcpRelay({ url, keyEnvVar = "AGENTPLAYBOOKS_API_KEY", keyHeader = "X-API-Key", env = process.env, fetchImpl = fetch, signal, allowInsecureHttp = false }) {
  const endpoint = new URL(url);
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash ||
      !/\/api\/mcp\/(?:manage|[a-f0-9-]+)$/i.test(endpoint.pathname) ||
      !(endpoint.protocol === "https:" || endpoint.protocol === "http:" && (allowInsecureHttp || ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname)))) {
    throw new Error("Use an AgentPlaybooks HTTPS MCP endpoint (localhost HTTP is also supported).");
  }
  if (!/^[A-Z_][A-Z0-9_]*$/.test(keyEnvVar) || !["X-API-Key", "Authorization"].includes(keyHeader)) throw new Error("Invalid credential reference or header.");
  let session, protocol;
  return async message => {
    const hasId = Object.hasOwn(message ?? {}, "id");
    const id = hasId ? message.id : null;
    const error = (code, text) => ({ jsonrpc: "2.0", id, error: { code, message: text } });
    if (!message || Array.isArray(message) || message.jsonrpc !== "2.0" || typeof message.method !== "string") return error(-32600, "Invalid JSON-RPC request.");
    // A local liveness probe needs no hosted data. Normal Hermes stdio does not
    // send these, but an explicitly configured probe still stays on this host.
    if (message.method === "ping") return hasId ? { jsonrpc: "2.0", id, result: {} } : null;
    const key = env[keyEnvVar];
    if (!key) return hasId ? error(-32001, `Configure ${keyEnvVar} in the selected profile's secret environment.`) : null;
    const headers = { "Content-Type": "application/json", Accept: "application/json", [keyHeader]: key };
    if (session) headers["Mcp-Session-Id"] = session;
    if (protocol) headers["MCP-Protocol-Version"] = protocol;
    try {
      const timeout = AbortSignal.timeout(90_000);
      const response = await fetchImpl(endpoint.href, {
        method: "POST", headers, body: JSON.stringify(message), redirect: "error",
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      if (!response.ok) { await response.body?.cancel(); return hasId ? error(-32000, `AgentPlaybooks HTTP ${response.status}.`) : null; }
      session = response.headers.get("mcp-session-id") ?? session;
      if (!hasId) { await response.body?.cancel(); return null; }
      const reader = response.body.getReader();
      const chunks = []; let size = 0;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_RESPONSE_BYTES) throw new Error("Response too large");
          chunks.push(value);
        }
      } finally { await reader.cancel(); }
      const result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (result.jsonrpc !== "2.0" || result.id !== id || !("result" in result || "error" in result)) throw new Error("Invalid response");
      if (message.method === "initialize" && result.result?.protocolVersion) protocol = result.result.protocolVersion;
      return result;
    } catch {
      // Neither remote error bodies nor fetch exceptions may echo credentials.
      return hasId ? error(-32000, "AgentPlaybooks connection failed or returned an invalid response; no automatic retry was made.") : null;
    }
  };
}

export async function runMcpStdio(options = {}) {
  const input = options.input ?? process.stdin, output = options.output ?? process.stdout;
  const controller = new AbortController();
  const relay = createMcpRelay({ ...options, signal: controller.signal });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  const pending = new Set();
  const send = message => { if (message) output.write(JSON.stringify(message) + "\n"); };
  try {
    for await (const line of lines) {
      if (!line.trim()) continue;
      let message;
      try { message = JSON.parse(line); }
      catch { send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Invalid JSON." } }); continue; }
      if (pending.size >= 16) {
        if (Object.hasOwn(message ?? {}, "id")) send({ jsonrpc: "2.0", id: message.id, error: { code: -32000, message: "Too many concurrent requests." } });
        continue;
      }
      const task = relay(message).then(send).finally(() => pending.delete(task));
      pending.add(task);
    }
  } finally {
    controller.abort();
    await Promise.allSettled(pending);
    lines.close();
  }
}
