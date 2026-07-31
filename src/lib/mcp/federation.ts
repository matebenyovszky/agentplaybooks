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
    type?: "none" | "bearer" | "api_key" | "oauth2_client_credentials";
    header?: string;
    prefix?: string;
    token_secret?: string;
    api_key_secret?: string;
    token_url?: string;
    client_id?: string;
    client_secret?: string;
    scopes?: string[];
    audience?: string;
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
const oauthCache = new Map<string, { token: string; expiresAt: number }>();
const mcpSessions = new Map<string, string | null>();

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

export function federatedToolName(server: Pick<MCPServer, "id">, originalName: string) {
  return `${federatedServerPrefix(server)}${sanitizeName(originalName)}`;
}

export function federatedServerPrefix(server: Pick<MCPServer, "id">) {
  return `ext__${server.id.replace(/-/g, "").slice(0, 12)}__`;
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
      return tools.map((tool) => namespaceTool(server, tool));
    } catch {
      // Stored schemas are a safe discovery fallback when an upstream is temporarily unavailable.
      return (server.tools || []).map((tool) => namespaceTool(server, tool));
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
  if (!mcpSessions.has(server.id) && method !== "initialize") {
    const initialized = await sendMcpRpc<Record<string, unknown>>(
      url,
      "initialize",
      {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "AgentPlaybooks Federation", version: "1.0.0" },
      },
      headers,
      config,
      options,
    );
    mcpSessions.set(server.id, initialized.sessionId);
    await timedFetch(url, {
      method: "POST",
      headers: mcpHeaders(headers, initialized.sessionId),
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    }, config.timeout_ms, options.fetch);
  }
  const response = await sendMcpRpc<T>(
    url,
    method,
    params,
    headers,
    config,
    options,
    mcpSessions.get(server.id),
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
) {
  const response = await timedFetch(url, {
    method: "POST",
    headers: mcpHeaders(headers, sessionId),
    body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method, params }),
  }, config.timeout_ms, options.fetch);
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
  const expectedPrefix = federatedServerPrefix(server);
  if (!namespacedName.startsWith(expectedPrefix)) {
    throw new FederationError(`Tool does not belong to ${server.name}`, "TOOL_NOT_FOUND", 404);
  }
  const tools = server.transport_type === "openapi"
    ? await discoverOpenApiTools(server, options)
    : await mcpListTools(server, options).catch(() => server.tools || []);
  const tool = tools.find((candidate) => federatedToolName(server, candidate.name) === namespacedName);
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
  if (auth.type === "oauth2_client_credentials") {
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
  const clientId = auth.client_id || stringValue(options.secrets?.client_id);
  const secretName = auth.client_secret || "client_secret";
  const clientSecret = stringValue(options.secrets?.[secretName]);
  if (!clientId || !clientSecret) throw new FederationError("OAuth client credentials are missing", "MISSING_SECRET", 500);
  const cacheKey = `${server.id}:${tokenUrl}:${clientId}`;
  const cached = oauthCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 10_000) return cached.token;
  const started = Date.now();
  try {
    const body = new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret });
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
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new FederationError(`Upstream timed out after ${timeout}ms`, "UPSTREAM_TIMEOUT", 504);
    }
    throw new FederationError(error instanceof Error ? error.message : "Upstream request failed", "UPSTREAM_NETWORK_ERROR");
  } finally {
    clearTimeout(timer);
  }
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

function namespaceTool(server: MCPServer, tool: McpTool): FederatedTool {
  return {
    ...tool,
    name: federatedToolName(server, tool.name),
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
