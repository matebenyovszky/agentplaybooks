function label(value: unknown): string | undefined {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 128) : undefined;
}

/** Small connection/discovery events; never log credentials, arguments, or content. */
export function logMcpDiscovery(request: Request, method: string, playbookId: string, actor: { kind: string; keyPrefix?: string } | null, params: unknown) {
  const handshake = method === "initialize" || method === "server/discover";
  if (!handshake && !(["tools/list", "resources/list"].includes(method) && Math.random() < 0.02)) return;
  const source = params && typeof params === "object" ? params as Record<string, unknown> : {};
  const meta = source._meta && typeof source._meta === "object" ? source._meta as Record<string, unknown> : {};
  const info = source.clientInfo ?? meta["io.modelcontextprotocol/clientInfo"];
  const client = info && typeof info === "object" ? info as Record<string, unknown> : {};
  console.info(JSON.stringify({
    event: handshake ? "mcp.connection" : "mcp.discovery", method, playbookId,
    actor: actor?.kind ?? "public", keyPrefix: actor?.keyPrefix,
    clientName: label(client.name), clientVersion: label(client.version),
    userAgent: label(request.headers.get("user-agent")), rayId: label(request.headers.get("cf-ray")),
    sampleRate: handshake ? 1 : 0.02,
  }));
}
