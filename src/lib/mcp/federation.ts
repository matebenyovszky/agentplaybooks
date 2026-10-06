import type { McpResource, McpTool, MCPServer } from "@/lib/supabase/types";

export type FederatedTransportConfig = {
  url?: string;
  spec_url?: string;
  base_url?: string;
  timeout_ms?: number;
  allow_insecure_http?: boolean;
  access?: "public" | "playbook_api_key";
  headers?: Record<string, string>;
  auth?: {
    type?: "none" | "bearer" | "api_key" | "oauth2_client_credentials" | "oauth2_refresh_token";
    header?: string;
    prefix?: string;
    token_secret?: string;
    api_key_secret?: string;
    token_url?: string;
    client_id?: string;
    client_secret?: string;
    scopes?: string[];
    audience?: string;
    refresh_token_secret?: string;
  };
  openapi?: Record<string, unknown>;
};

export type FederatedSecrets = Record<string, unknown>;

export type FederatedTool = McpTool & {
  _meta: {
    serverId: string;
    serverName: string;
    originalName: string;
    transport: string;
  };
};

export type FederatedResource = McpResource & {
  _meta: {
    serverId: string;
    originalUri: string;
  };
};

export type FederationAuditEvent = {
  serverId: string;
  operation: "tools/list" | "tools/call" | "resources/list" | "resources/read" | "oauth/token";
  target?: string;
  status: "success" | "error";
  latencyMs: number;
  errorCode?: string;
};

export type FederationOptions = {
  fetch?: typeof globalThis.fetch;
  secrets?: FederatedSecrets;
  audit?: (event: FederationAuditEvent) => void | Promise<void>;
};

type JsonRpcResponse<T> = {
  result?: T;
  error?: { code?: number; message?: string; data?: unknown };
};

type OpenApiOperation = {
  method: string;
  path: string;
  operationId: string;
  operation: Record<string, unknown>;
  spec: Record<string, unknown>;
};

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 60_000;
const CACHE_MAX = 64;
const LEGACY_SESSION_TTL_MS = 5 * 60_000;
const PROTOCOL_ERA_TTL_MS = 10 * 60_000;
const oauthCache = new Map<string, { token: string; expiresAt: number }>();

/**
 * A digest of a secret, for use as part of a cache key. The secret itself
 * must never become one: this map is process-global and cache keys end up in
 * logs and debugger views.
 */
async function fingerprint(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
type LegacySession = { session: Promise<string | null>; expiresAt: number };
const mcpSessions = new Map<string, LegacySession>();

function limitCache<T>(cache: Map<string, T>) {
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
}

/**
 * Which protocol era an upstream speaks, cached per endpoint.
 *
 * Revision 2026-07-28 removed the `initialize` handshake and sessions: a modern
 * request carries its version and identity in `_meta`, mirrored into headers,
 * and stands on its own. This client only knew the handshake, which the spec
 * compatibility matrix scores as "Legacy client + Modern server = Fails" — and
 * the upstreams people actually federate (Cloudflare, Supabase) are built for
 * the current revision.
 *
 * So we open modern and fall back when the response looks like a legacy
 * endpoint. A recognized modern JSON-RPC error stays modern; a 401 or 403 is
 * an authentication failure and cannot identify the protocol. Different paths
 * on one origin may run different protocols.
 */
type ProtocolEra = "modern" | "legacy";

const serverEras = new Map<string, { era: ProtocolEra; expiresAt: number }>();

const CLIENT_PROTOCOL_VERSION = "2026-07-28";
const LEGACY_CLIENT_PROTOCOL_VERSION = "2025-03-26";
const MODERN_ERROR_CODES = new Set([-32020, -32022, -32601]);
const META_PREFIX = "io.modelcontextprotocol/";

/** The body field a method mirrors into `Mcp-Name`, if any. */
function mirroredName(method: string, params: Record<string, unknown>): string | undefined {
  if (method === "tools/call" || method === "prompts/get") {
    return typeof params.name === "string" ? params.name : undefined;
  }
  if (method === "resources/read") {
    return typeof params.uri === "string" ? params.uri : undefined;
  }
  return undefined;
}

function modernParams(params: Record<string, unknown>, version: string) {
  return {
    ...params,
    _meta: {
      ...(params._meta as Record<string, unknown> | undefined),
      [`${META_PREFIX}protocolVersion`]: version,
      [`${META_PREFIX}clientInfo`]: { name: "AgentPlaybooks Federation", version: "1.0.0" },
      [`${META_PREFIX}clientCapabilities`]: {},
    },
  };
}

/** An ASCII-unsafe name travels Base64-wrapped, per the transport binding. */
function headerSafe(value: string): string {
  const safe = /^[\u0021-\u007e][\u0020-\u007e]*$/.test(value) && !value.startsWith("=?base64?");
  if (safe) return value;
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `=?base64?${btoa(binary)}?=`;
}

/**
 * The era an upstream was found to speak, once something has actually talked to
 * it. Surfaced by the connection test: "reached, modern" and "reached, legacy"
 * are different facts about an upstream, and the second one is a heads-up that
 * it will stop working when that server drops the handshake.
 */
export function knownProtocolEra(url: string): "modern" | "legacy" | null {
  const key = endpointOf(url);
  const cached = serverEras.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    serverEras.delete(key);
    return null;
  }
  return cached.era;
}

function endpointOf(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "";
  }
}

function rememberProtocolEra(url: string, era: ProtocolEra) {
  const key = endpointOf(url);
  if (!key) return;
  serverEras.delete(key);
  serverEras.set(key, { era, expiresAt: Date.now() + PROTOCOL_ERA_TTL_MS });
  limitCache(serverEras);
}

export class FederationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status = 502,
  ) {
    super(message);
    this.name = "FederationError";
  }
}

/**
 * Federated tool names lead with the server's *name*, because the name is the
 * one part of a tools/list a reader actually keeps: `supabase__execute_sql`
 * says which system is about to act, `ext__f8755c97da23__execute` says nothing
 * a human or a model can hold on to.
 *
 * The slug comes from the server's display name. When two servers in one
 * playbook collapse to the same slug, every member of the collision gets a
 * short id fragment — every member, deterministically, so that adding a second
 * "search" server changes the first one's names visibly instead of silently
 * re-routing calls addressed to it.
 *
 * The old `ext__<id12>__` names stay accepted on every call path. They live in
 * saved agent sessions, generated OpenAPI exports, and third-party configs, and
 * a rename that breaks an existing caller is a worse bug than the one it fixes.
 */
export function federatedToolName(
  server: Pick<MCPServer, "id" | "name">,
  originalName: string,
  peers: Pick<MCPServer, "id" | "name">[] = [],
) {
  return `${federatedServerPrefix(server, peers)}${sanitizeName(originalName)}`;
}

export function federatedServerPrefix(
  server: Pick<MCPServer, "id" | "name">,
  peers: Pick<MCPServer, "id" | "name">[] = [],
) {
  const slug = baseServerSlug(server);
  const collided = peers.some((peer) => peer.id !== server.id && baseServerSlug(peer) === slug);
  return collided ? `${slug}_${shortServerId(server)}__` : `${slug}__`;
}

export function legacyFederatedServerPrefix(server: Pick<MCPServer, "id">) {
  return `ext__${server.id.replace(/-/g, "").slice(0, 12)}__`;
}

/**
 * Every prefix under which this server's tools may legitimately be addressed,
 * longest first so the caller can strip the one that matched. The bare slug is
 * accepted even when a collision forced the advertised names to carry an id
 * fragment: by the time a call reaches one specific server, the router has
 * already decided, and refusing the shorter spelling would help no one.
 */
export function federatedCallPrefixes(server: Pick<MCPServer, "id" | "name">): string[] {
  const slug = baseServerSlug(server);
  return [`${slug}_${shortServerId(server)}__`, `${slug}__`, legacyFederatedServerPrefix(server)];
}

function baseServerSlug(server: Pick<MCPServer, "name">) {
  return sanitizeName(server.name || "").slice(0, 24).replace(/_+$/, "") || "server";
}

function shortServerId(server: Pick<MCPServer, "id">) {
  return server.id.replace(/-/g, "").slice(0, 4);
}

export function federatedResourceUri(serverId: string, originalUri: string) {
  return `mcp-proxy://${serverId}/${encodeBase64Url(originalUri)}`;
}

export function parseFederatedResourceUri(uri: string) {
  const match = uri.match(/^mcp-proxy:\/\/([^/]+)\/([A-Za-z0-9_-]+)$/);
  if (!match) return null;
  return { serverId: match[1], originalUri: decodeBase64Url(match[2]) };
}

export async function listFederatedTools(
  servers: MCPServer[],
  options: FederationOptions = {},
): Promise<FederatedTool[]> {
  const results = await Promise.all(servers.map(async (server) => {
    try {
      const tools = server.transport_type === "openapi"
        ? await discoverOpenApiTools(server, options)
        : await mcpListTools(server, options);
      return tools.map((tool) => namespaceTool(server, tool, servers));
    } catch {
      // Stored schemas are a safe discovery fallback when an upstream is temporarily unavailable.
      return (server.tools || []).map((tool) => namespaceTool(server, tool, servers));
    }
  }));
  return results.flat();
}

export async function callFederatedTool(
  server: MCPServer,
  namespacedName: string,
  args: Record<string, unknown>,
  options: FederationOptions = {},
) {
  const tool = await resolveTool(server, namespacedName, options);
  if (server.transport_type === "openapi") {
    return callOpenApiOperation(server, tool.originalName, args, options);
  }
  return audited(server, "tools/call", tool.originalName, options, () =>
    mcpRequest(server, "tools/call", { name: tool.originalName, arguments: args }, options),
  );
}

export async function listFederatedResources(
  servers: MCPServer[],
  options: FederationOptions = {},
): Promise<FederatedResource[]> {
  const results = await Promise.all(servers.filter((server) => server.transport_type !== "openapi").map(async (server) => {
    try {
      const result = await audited(server, "resources/list", undefined, options, () =>
        mcpRequest<{ resources?: McpResource[] }>(server, "resources/list", {}, options),
      );
      return (result.resources || []).map((resource) => namespaceResource(server, resource));
    } catch {
      return (server.resources || []).map((resource) => namespaceResource(server, resource));
    }
  }));
  return results.flat();
}

export async function readFederatedResource(
  server: MCPServer,
  originalUri: string,
  options: FederationOptions = {},
) {
  if (server.transport_type === "openapi") {
    throw new FederationError("OpenAPI integrations do not expose MCP resources", "RESOURCE_UNSUPPORTED", 400);
  }
  return audited(server, "resources/read", originalUri, options, () =>
    mcpRequest(server, "resources/read", { uri: originalUri }, options),
  );
}

async function mcpListTools(server: MCPServer, options: FederationOptions) {
  const result = await audited(server, "tools/list", undefined, options, () =>
    mcpRequest<{ tools?: McpTool[] }>(server, "tools/list", {}, options),
  );
  return result.tools || [];
}

async function mcpRequest<T = Record<string, unknown>>(
  server: MCPServer,
  method: string,
  params: Record<string, unknown>,
  options: FederationOptions,
): Promise<T> {
  const config = getConfig(server);
  const url = config.url;
  if (!url) throw new FederationError(`Missing transport URL for ${server.name}`, "MISSING_URL", 400);
  assertSafeRemoteUrl(url, config.allow_insecure_http);
  const headers = await buildHeaders(server, config, options);

  if (knownProtocolEra(url) !== "legacy") {
    const attempt = await sendModernRpc<T>(url, method, params, headers, config, options);
    if (attempt.kind === "result") {
      rememberProtocolEra(url, "modern");
      return attempt.result;
    }
    if (attempt.kind === "modern-error") {
      rememberProtocolEra(url, "modern");
      throw attempt.error;
    }
    if (attempt.kind === "auth-error") throw attempt.error;
    rememberProtocolEra(url, "legacy");
  }

  return legacyRequest<T>(server, url, method, params, headers, config, options);
}

type ModernAttempt<T> =
  | { kind: "result"; result: T }
  | { kind: "modern-error"; error: FederationError }
  | { kind: "auth-error"; error: FederationError }
  | { kind: "not-modern" };

/**
 * One standalone POST, with the version in both `_meta` and the header the
 * transport requires them to agree on.
 */
async function sendModernRpc<T>(
  url: string,
  method: string,
  params: Record<string, unknown>,
  headers: Record<string, string>,
  config: FederatedTransportConfig,
  options: FederationOptions,
  version = CLIENT_PROTOCOL_VERSION,
): Promise<ModernAttempt<T>> {
  const name = mirroredName(method, params);
  const response = await timedFetch(url, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": version,
      "Mcp-Method": method,
      ...(name ? { "Mcp-Name": headerSafe(name) } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method,
      params: modernParams(params, version),
    }),
  }, config.timeout_ms, options.fetch);

  const text = await response.text();
  let payload: JsonRpcResponse<T> | null = null;
  try {
    payload = parseJsonRpcText<JsonRpcResponse<T>>(text, response.headers.get("content-type"));
  } catch {
    payload = null;
  }

  if (response.ok && payload?.result) return { kind: "result", result: payload.result };

  // An authorization failure says nothing about the protocol revision. Falling
  // back would cache a modern endpoint as legacy until its next era probe.
  if (response.status === 401 || response.status === 403) {
    return {
      kind: "auth-error",
      error: new FederationError(payload?.error?.message || `Upstream returned ${response.status}`, "UPSTREAM_AUTH_ERROR"),
    };
  }

  const code = payload?.error?.code;
  if (typeof code === "number" && MODERN_ERROR_CODES.has(code)) {
    const supported = (payload?.error as { data?: { supported?: unknown } } | undefined)?.data?.supported;
    if (code === -32022 && Array.isArray(supported)) {
      // The point of -32022 is the list it carries; take the newest offered.
      const next = supported
        .filter((entry): entry is string => typeof entry === "string")
        .sort()
        .reverse()[0];
      if (next && next !== version) {
        return sendModernRpc<T>(url, method, params, headers, config, options, next);
      }
    }
    return {
      kind: "modern-error",
      error: new FederationError(payload?.error?.message || `Upstream MCP error (${method})`, "UPSTREAM_RPC_ERROR"),
    };
  }

  if (response.status >= 500) {
    throw new FederationError(`Upstream returned ${response.status}`, "UPSTREAM_HTTP_ERROR");
  }

  // Anything else — a 4xx without a modern error, or a 200 carrying a plain
  // JSON-RPC error — is how a handshake-era server answers a request it did not
  // expect. Fall back rather than surface an error we can avoid.
  return { kind: "not-modern" };
}

/** The handshake era: initialize, acknowledge, then the call, carrying a session. */
async function legacySessionKey(server: MCPServer, url: string, headers: Record<string, string>) {
  // Bind the session to its endpoint and effective credentials without keeping
  // either header values or a token in a process-global map key.
  const orderedHeaders = Object.entries(headers)
    .map(([name, value]) => [name.toLowerCase(), value])
    .sort(([left], [right]) => left.localeCompare(right));
  return `${server.playbook_id}:${server.id}:${await fingerprint(JSON.stringify([url, orderedHeaders]))}`;
}

function cachedLegacySession(
  key: string,
  url: string,
  headers: Record<string, string>,
  config: FederatedTransportConfig,
  options: FederationOptions,
): Promise<string | null> {
  const cached = mcpSessions.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.session;
  mcpSessions.delete(key);

  // Store the in-flight handshake so concurrent requests use one session.
  const session = initializeLegacySession(url, headers, config, options);
  const entry = { session, expiresAt: Date.now() + LEGACY_SESSION_TTL_MS };
  mcpSessions.set(key, entry);
  limitCache(mcpSessions);
  void session.catch(() => {
    if (mcpSessions.get(key) === entry) mcpSessions.delete(key);
  });
  return session;
}

async function initializeLegacySession(
  url: string,
  headers: Record<string, string>,
  config: FederatedTransportConfig,
  options: FederationOptions,
): Promise<string | null> {
  const initialized = await sendMcpRpc<Record<string, unknown>>(
    url,
    "initialize",
    {
      protocolVersion: LEGACY_CLIENT_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "AgentPlaybooks Federation", version: "1.0.0" },
    },
    headers,
    config,
    options,
  );
  const response = await timedFetch(url, {
    method: "POST",
    headers: mcpHeaders(headers, initialized.sessionId),
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  }, config.timeout_ms, options.fetch);
  if (!response.ok) {
    throw new FederationError(`Upstream initialization returned ${response.status}`, "UPSTREAM_HTTP_ERROR");
  }
  return initialized.sessionId;
}

async function legacyRequest<T>(
  server: MCPServer,
  url: string,
  method: string,
  params: Record<string, unknown>,
  headers: Record<string, string>,
  config: FederatedTransportConfig,
  options: FederationOptions,
): Promise<T> {
  const key = await legacySessionKey(server, url, headers);
  const sessionId = method === "initialize"
    ? null
    : await cachedLegacySession(key, url, headers, config, options);
  const response = await sendMcpRpc<T>(
    url,
    method,
    params,
    headers,
    config,
    options,
    sessionId,
    (status) => {
      if (status === 401 || status === 403 || status === 404 || status === 410) mcpSessions.delete(key);
    },
  );
  return response.result;
}

async function sendMcpRpc<T>(
  url: string,
  method: string,
  params: Record<string, unknown>,
  headers: Record<string, string>,
  config: FederatedTransportConfig,
  options: FederationOptions,
  sessionId?: string | null,
  onHttpError?: (status: number) => void,
) {
  const response = await timedFetch(url, {
    method: "POST",
    headers: mcpHeaders(headers, sessionId),
    body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method, params }),
  }, config.timeout_ms, options.fetch);
  if (!response.ok) onHttpError?.(response.status);
  const payload = await parseJsonOrSse<JsonRpcResponse<T>>(response);
  if (payload.error) {
    throw new FederationError(payload.error.message || `Upstream MCP error (${method})`, "UPSTREAM_RPC_ERROR");
  }
  if (!payload.result) throw new FederationError("Upstream MCP returned no result", "INVALID_UPSTREAM_RESPONSE");
  return { result: payload.result, sessionId: response.headers.get("mcp-session-id") };
}

function mcpHeaders(headers: Record<string, string>, sessionId?: string | null) {
  return {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "MCP-Protocol-Version": "2025-03-26",
    ...headers,
    ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
  };
}

async function discoverOpenApiTools(server: MCPServer, options: FederationOptions): Promise<McpTool[]> {
  const spec = await loadOpenApiSpec(server, options);
  return collectOpenApiOperations(spec).map(({ operationId, operation }) => ({
    name: operationId,
    description: stringValue(operation.description) || stringValue(operation.summary) || operationId,
    inputSchema: openApiInputSchema(operation),
  }));
}

async function callOpenApiOperation(
  server: MCPServer,
  operationId: string,
  args: Record<string, unknown>,
  options: FederationOptions,
) {
  return audited(server, "tools/call", operationId, options, async () => {
    const config = getConfig(server);
    const spec = await loadOpenApiSpec(server, options);
    const operation = collectOpenApiOperations(spec).find((item) => item.operationId === operationId);
    if (!operation) throw new FederationError(`OpenAPI operation not found: ${operationId}`, "TOOL_NOT_FOUND", 404);
    const baseUrl = config.base_url || firstOpenApiServer(spec);
    if (!baseUrl) throw new FederationError("OpenAPI integration has no base URL", "MISSING_URL", 400);
    const url = new URL(joinOpenApiUrl(baseUrl, operation.path));
    const parameters = arrayValue(operation.operation.parameters);
    const consumed = new Set<string>();
    const requestHeaders = await buildHeaders(server, config, options);
    for (const parameterValue of parameters) {
      const parameter = objectValue(parameterValue);
      const name = stringValue(parameter.name);
      if (!name || !(name in args)) continue;
      consumed.add(name);
      const location = stringValue(parameter.in);
      const value = String(args[name]);
      if (location === "path") url.pathname = url.pathname.replace(`{${name}}`, encodeURIComponent(value));
      if (location === "query") url.searchParams.append(name, value);
      if (location === "header") requestHeaders[name] = value;
    }
    assertSafeRemoteUrl(url.toString(), config.allow_insecure_http);
    const body = args.body ?? Object.fromEntries(Object.entries(args).filter(([key]) => !consumed.has(key)));
    const hasBody = !["GET", "HEAD"].includes(operation.method);
    const response = await timedFetch(url.toString(), {
      method: operation.method,
      headers: { Accept: "application/json", ...(hasBody ? { "Content-Type": "application/json" } : {}), ...requestHeaders },
      body: hasBody ? JSON.stringify(body) : undefined,
    }, config.timeout_ms, options.fetch);
    const text = await response.text();
    const responseBody = parseMaybeJson(text);
    if (!response.ok) {
      throw new FederationError(`OpenAPI upstream returned ${response.status}`, "UPSTREAM_HTTP_ERROR", 502);
    }
    return { status: response.status, data: responseBody };
  });
}

async function loadOpenApiSpec(server: MCPServer, options: FederationOptions) {
  const config = getConfig(server);
  if (config.openapi) return config.openapi;
  if (!config.spec_url) throw new FederationError("OpenAPI integration requires openapi or spec_url", "MISSING_SPEC", 400);
  assertSafeRemoteUrl(config.spec_url, config.allow_insecure_http);
  const headers = await buildHeaders(server, config, options);
  const response = await timedFetch(config.spec_url, { headers }, config.timeout_ms, options.fetch);
  const spec = await response.json();
  if (!response.ok || !isRecord(spec)) throw new FederationError("Unable to load OpenAPI specification", "SPEC_FETCH_FAILED");
  return spec;
}

function collectOpenApiOperations(spec: Record<string, unknown>): OpenApiOperation[] {
  const paths = objectValue(spec.paths);
  const result: OpenApiOperation[] = [];
  for (const [path, pathValue] of Object.entries(paths)) {
    const pathItem = objectValue(pathValue);
    for (const method of ["get", "post", "put", "patch", "delete"]) {
      const operation = objectValue(pathItem[method]);
      if (!Object.keys(operation).length) continue;
      const operationId = stringValue(operation.operationId) || sanitizeName(`${method}_${path}`);
      result.push({ method: method.toUpperCase(), path, operationId, operation, spec });
    }
  }
  return result;
}

function openApiInputSchema(operation: Record<string, unknown>): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const value of arrayValue(operation.parameters)) {
    const parameter = objectValue(value);
    const name = stringValue(parameter.name);
    if (!name) continue;
    properties[name] = objectValue(parameter.schema);
    if (parameter.required === true) required.push(name);
  }
  const requestBody = objectValue(operation.requestBody);
  const jsonContent = objectValue(objectValue(requestBody.content)["application/json"]);
  const bodySchema = objectValue(jsonContent.schema);
  if (Object.keys(bodySchema).length) {
    properties.body = bodySchema;
    if (requestBody.required === true) required.push("body");
  }
  return { type: "object", properties, ...(required.length ? { required } : {}) };
}

async function resolveTool(server: MCPServer, namespacedName: string, options: FederationOptions) {
  const prefix = federatedCallPrefixes(server).find((candidate) => namespacedName.startsWith(candidate));
  if (!prefix) {
    throw new FederationError(`Tool does not belong to ${server.name}`, "TOOL_NOT_FOUND", 404);
  }
  const remainder = namespacedName.slice(prefix.length);
  // The freshly loaded server row already contains declared tool names. Calling
  // one does not require another upstream tools/list round trip. Upstream auth
  // and tool execution remain unchanged; stale declarations fail at execution.
  const declared = (server.tools || []).find(candidate =>
    sanitizeName(candidate.name) === remainder || candidate.name === remainder);
  if (declared) return { originalName: declared.name };
  const tools = server.transport_type === "openapi"
    ? await discoverOpenApiTools(server, options)
    : await mcpListTools(server, options).catch(() => server.tools || []);
  // The advertised names are sanitized, so match on the sanitized form — but an
  // exact original name (`searchWeb`) is accepted too; a caller that already
  // knows the upstream spelling should not be punished for using it.
  const tool = tools.find((candidate) =>
    sanitizeName(candidate.name) === remainder || candidate.name === remainder);
  if (!tool) throw new FederationError(`Federated tool not found: ${namespacedName}`, "TOOL_NOT_FOUND", 404);
  return { originalName: tool.name };
}

async function buildHeaders(
  server: MCPServer,
  config: FederatedTransportConfig,
  options: FederationOptions,
) {
  const headers = { ...(config.headers || {}), ...objectStringValues(options.secrets?.headers) };
  const auth = config.auth;
  if (!auth || !auth.type || auth.type === "none") return headers;
  if (auth.type === "oauth2_client_credentials" || auth.type === "oauth2_refresh_token") {
    const token = await getOAuthToken(server, config, options);
    headers.Authorization = `Bearer ${token}`;
    return headers;
  }
  const secretName = auth.type === "bearer"
    ? auth.token_secret || "token"
    : auth.api_key_secret || "api_key";
  const secret = stringValue(options.secrets?.[secretName]);
  if (!secret) throw new FederationError(`Missing secret: ${secretName}`, "MISSING_SECRET", 500);
  const header = auth.header || "Authorization";
  const prefix = auth.prefix ?? (auth.type === "bearer" ? "Bearer " : "");
  headers[header] = `${prefix}${secret}`;
  return headers;
}

async function getOAuthToken(server: MCPServer, config: FederatedTransportConfig, options: FederationOptions) {
  const auth = config.auth || {};
  const tokenUrl = auth.token_url;
  if (!tokenUrl) throw new FederationError("OAuth token URL is missing", "MISSING_OAUTH_CONFIG", 500);
  assertSafeRemoteUrl(tokenUrl, config.allow_insecure_http);
  const isRefreshGrant = auth.type === "oauth2_refresh_token";
  const clientId = auth.client_id || stringValue(options.secrets?.client_id);
  const secretName = auth.client_secret || "client_secret";
  const clientSecret = stringValue(options.secrets?.[secretName]);

  // A refresh token carries a user's consent, granted once outside this app.
  // There is nowhere here to host a redirect and consent screen, so the token is
  // obtained out of band and stored in the vault. Renewal from then on is an
  // ordinary POST, which is all this does.
  const refreshTokenName = auth.refresh_token_secret || "refresh_token";
  const refreshToken = isRefreshGrant
    ? stringValue(options.secrets?.[refreshTokenName])
    : undefined;

  if (isRefreshGrant) {
    // Public clients (PKCE) legitimately have no client secret, so only the
    // refresh token itself is mandatory.
    if (!refreshToken) {
      throw new FederationError(`Missing secret: ${refreshTokenName}`, "MISSING_SECRET", 500);
    }
  } else if (!clientId || !clientSecret) {
    throw new FederationError("OAuth client credentials are missing", "MISSING_SECRET", 500);
  }

  // Any change to a credential, grant, scope, or audience must get a fresh
  // token. Only a digest goes into the process-global key, never a secret.
  const cacheKey = `${server.playbook_id}:${server.id}:${await fingerprint(JSON.stringify({
    tokenUrl,
    grant: auth.type,
    clientId,
    clientSecret,
    refreshToken,
    scopes: auth.scopes,
    audience: auth.audience,
  }))}`;
  const cached = oauthCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 10_000) return cached.token;
  oauthCache.delete(cacheKey);
  const started = Date.now();
  try {
    const body = isRefreshGrant
      ? new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken as string })
      : new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret });
    if (isRefreshGrant) {
      // Providers disagree about whether a refresh call should carry the client
      // credentials, so send exactly what the config declares.
      if (clientId) body.set("client_id", clientId);
      if (clientSecret) body.set("client_secret", clientSecret);
    }
    if (auth.scopes?.length) body.set("scope", auth.scopes.join(" "));
    if (auth.audience) body.set("audience", auth.audience);
    const response = await timedFetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body,
    }, config.timeout_ms, options.fetch);
    const payload = objectValue(await response.json());
    const token = stringValue(payload.access_token);
    if (!response.ok || !token) throw new FederationError("OAuth token request failed", "OAUTH_TOKEN_FAILED");
    const expiresIn = Number(payload.expires_in) || 300;
    oauthCache.set(cacheKey, { token, expiresAt: Date.now() + expiresIn * 1000 });
    limitCache(oauthCache);
    await options.audit?.({ serverId: server.id, operation: "oauth/token", status: "success", latencyMs: Date.now() - started });
    return token;
  } catch (error) {
    await options.audit?.({ serverId: server.id, operation: "oauth/token", status: "error", latencyMs: Date.now() - started, errorCode: errorCode(error) });
    throw error;
  }
}

async function audited<T>(
  server: MCPServer,
  operation: FederationAuditEvent["operation"],
  target: string | undefined,
  options: FederationOptions,
  callback: () => Promise<T>,
) {
  const started = Date.now();
  try {
    const result = await callback();
    await options.audit?.({ serverId: server.id, operation, target, status: "success", latencyMs: Date.now() - started });
    return result;
  } catch (error) {
    await options.audit?.({ serverId: server.id, operation, target, status: "error", latencyMs: Date.now() - started, errorCode: errorCode(error) });
    throw error;
  }
}

async function timedFetch(
  url: string,
  init: RequestInit,
  configuredTimeout: number | undefined,
  fetchImpl = globalThis.fetch,
) {
  const timeout = Math.min(Math.max(configuredTimeout || DEFAULT_TIMEOUT_MS, 100), MAX_TIMEOUT_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    const envelope = typeof init.body === "string" ? parseMaybeJson(init.body) : null;
    const rpc = isRecord(envelope) && envelope.jsonrpc === "2.0" ? envelope : null;
    // Notification acknowledgements have no RPC result to read. Release their
    // bodies immediately, even when a peer incorrectly leaves a stream open.
    if (rpc && rpc.id === undefined) {
      void response.body?.cancel().catch(() => {});
      return new Response(null, { status: response.status, headers: response.headers });
    }
    const body = await readBoundedResponse(response, controller.signal, rpc?.id);
    return new Response([204, 205, 304].includes(response.status) ? null : body, {
      status: response.status, statusText: response.statusText, headers: response.headers,
    });
  } catch (error) {
    if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      throw new FederationError(`Upstream timed out after ${timeout}ms`, "UPSTREAM_TIMEOUT", 504);
    }
    if (error instanceof FederationError) throw error;
    throw new FederationError(error instanceof Error ? error.message : "Upstream request failed", "UPSTREAM_NETWORK_ERROR");
  } finally {
    clearTimeout(timer);
  }
}

const MAX_UPSTREAM_BODY_BYTES = 8 * 1024 * 1024;

/** Bound the whole response, not just the time until its headers arrive. */
async function readBoundedResponse(response: Response, signal: AbortSignal, rpcId: unknown): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const sse = rpcId !== undefined && response.headers.get("content-type")?.includes("text/event-stream");
  let bytes = 0;
  let text = "";
  let onAbort: () => void = () => {};
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(new DOMException("Upstream body timed out", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), aborted]);
      if (value) {
        bytes += value.byteLength;
        if (bytes > MAX_UPSTREAM_BODY_BYTES) throw new FederationError("Upstream response exceeds 8 MiB", "UPSTREAM_RESPONSE_TOO_LARGE");
        text += decoder.decode(value, { stream: true });
      }
      if (done) text += decoder.decode();
      if (sse) {
        // Events can span chunks and multiple data lines. Ignore notifications
        // and other RPC IDs, then cancel as soon as our response is complete.
        const events = text.split(/\r?\n\r?\n/);
        text = done ? "" : events.pop() ?? "";
        for (const event of events) {
          const data = event.split(/\r?\n/).filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart()).join("\n");
          if (!data || data === "[DONE]") continue;
          const payload = parseMaybeJson(data);
          if (isRecord(payload) && payload.id === rpcId && ("result" in payload || "error" in payload)) {
            return `data: ${JSON.stringify(payload)}\n\n`;
          }
        }
        if (done) throw new FederationError("SSE response contained no matching JSON-RPC result", "INVALID_UPSTREAM_RESPONSE");
      } else if (done) {
        return text;
      }
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
    // Do not wait for the remote peer to close an otherwise long-lived SSE.
    void reader.cancel().catch(() => {});
  }
}

/** Shared so the modern path can read a body that came with a 4xx. */
export function parseJsonRpcText<T>(text: string, contentType: string | null): T {
  if (contentType?.includes("text/event-stream")) {
    const data = text.split(/\r?\n/).filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim()).find((line) => line && line !== "[DONE]");
    if (!data) throw new FederationError("SSE response contained no JSON-RPC data", "INVALID_UPSTREAM_RESPONSE");
    return JSON.parse(data) as T;
  }
  return JSON.parse(text) as T;
}

async function parseJsonOrSse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!response.ok) throw new FederationError(`Upstream returned ${response.status}`, "UPSTREAM_HTTP_ERROR");
  if (response.headers.get("content-type")?.includes("text/event-stream")) {
    const data = text.split(/\r?\n/).filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim()).find((line) => line && line !== "[DONE]");
    if (!data) throw new FederationError("SSE response contained no JSON-RPC data", "INVALID_UPSTREAM_RESPONSE");
    return JSON.parse(data) as T;
  }
  return JSON.parse(text) as T;
}

export function assertSafeRemoteUrl(value: string, allowInsecureHttp = false) {
  const url = new URL(value);
  if (url.protocol !== "https:" && !(allowInsecureHttp && url.protocol === "http:")) {
    throw new FederationError("Only HTTPS upstreams are allowed", "UNSAFE_UPSTREAM", 400);
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host === "metadata.google.internal") {
    throw new FederationError("Private upstream host is not allowed", "UNSAFE_UPSTREAM", 400);
  }
  const mappedIpv4 = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  const mappedIpv4Host = mappedIpv4
    ? `${parseInt(mappedIpv4[1], 16) >> 8}.${parseInt(mappedIpv4[1], 16) & 255}.${parseInt(mappedIpv4[2], 16) >> 8}.${parseInt(mappedIpv4[2], 16) & 255}`
    : null;
  if (
    isPrivateIpv4Host(host) ||
    (mappedIpv4Host !== null && isPrivateIpv4Host(mappedIpv4Host)) ||
    host === "::" || host === "::1" || host === "0000:0000:0000:0000:0000:0000:0000:0001" ||
    /^(fc|fd|fe[89ab])/.test(host)
  ) {
    throw new FederationError("Private upstream address is not allowed", "UNSAFE_UPSTREAM", 400);
  }
  if (!/^[a-z0-9.:-]+$/i.test(host)) {
    throw new FederationError("Invalid upstream host", "UNSAFE_UPSTREAM", 400);
  }
}

function isPrivateIpv4Host(host: string) {
  return /^(0\.|10\.|127\.|169\.254\.|192\.168\.)/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);
}

function namespaceTool(server: MCPServer, tool: McpTool, peers: MCPServer[] = []): FederatedTool {
  return {
    ...tool,
    name: federatedToolName(server, tool.name, peers),
    description: `[${server.name}] ${tool.description || tool.name}`,
    inputSchema: tool.inputSchema || { type: "object", properties: {} },
    _meta: { serverId: server.id, serverName: server.name, originalName: tool.name, transport: server.transport_type || "http" },
  };
}

function namespaceResource(server: MCPServer, resource: McpResource): FederatedResource {
  return {
    ...resource,
    uri: federatedResourceUri(server.id, resource.uri),
    description: `[${server.name}] ${resource.description || resource.name}`,
    _meta: { serverId: server.id, originalUri: resource.uri },
  };
}

function getConfig(server: MCPServer): FederatedTransportConfig {
  return (server.transport_config || {}) as FederatedTransportConfig;
}

function firstOpenApiServer(spec: Record<string, unknown>) {
  const first = objectValue(arrayValue(spec.servers)[0]);
  return stringValue(first.url);
}

function joinOpenApiUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

function sanitizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "tool";
}

function encodeBase64Url(value: string) {
  return btoa(unescape(encodeURIComponent(value))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return decodeURIComponent(escape(atob(padded)));
}

function objectValue(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function objectStringValues(value: unknown): Record<string, string> {
  return Object.fromEntries(Object.entries(objectValue(value)).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseMaybeJson(value: string) {
  if (!value) return null;
  try { return JSON.parse(value) as unknown; } catch { return value; }
}

function errorCode(error: unknown) {
  return error instanceof FederationError ? error.code : "INTERNAL_ERROR";
}
