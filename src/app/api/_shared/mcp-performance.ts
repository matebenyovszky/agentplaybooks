type Timing = { started: number; parsed?: number; authorized?: number; method?: string; tool?: string };
const requests = new WeakMap<Request, Timing>();
const METHODS = new Set(["initialize", "server/discover", "tools/list", "tools/call", "resources/list", "resources/read", "skills/list", "skills/get", "prompts/list", "prompts/get", "ping", "notifications/initialized"]);

export function startMcpPerformance(request: Request) {
  requests.set(request, { started: performance.now() });
}

export function parsedMcpPerformance(request: Request, method: unknown, tool?: string) {
  const timing = requests.get(request);
  if (!timing) return;
  timing.parsed = performance.now();
  timing.method = typeof method === "string" && METHODS.has(method) ? method : "other";
  // The caller supplies only a name from the built-in tool allowlist.
  timing.tool = tool;
}

export function authorizedMcpPerformance(request: Request) {
  const timing = requests.get(request);
  if (timing) timing.authorized = performance.now();
}

/** Wall-time phase measurements, not CPU time. No credentials, arguments or content. */
export function finishMcpPerformance(request: Request, status: number) {
  const timing = requests.get(request);
  requests.delete(request);
  if (!timing) return;
  const ended = performance.now();
  const elapsed = ended - timing.started;
  if (elapsed < 1000 && Math.random() >= 0.02) return;
  const round = (value: number) => Math.round(value * 10) / 10;
  console.info(JSON.stringify({
    event: "mcp.performance", method: timing.method ?? "unparsed", tool: timing.tool, status,
    totalWallMs: round(elapsed),
    parseWallMs: timing.parsed === undefined ? undefined : round(timing.parsed - timing.started),
    authorizationWallMs: timing.authorized === undefined ? undefined : round(timing.authorized - (timing.parsed ?? timing.started)),
    handlerWallMs: timing.authorized === undefined ? undefined : round(ended - timing.authorized),
    sampleRate: elapsed >= 1000 ? 1 : 0.02,
  }));
}
