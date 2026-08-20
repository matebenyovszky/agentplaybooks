import { LATEST_PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS } from "./mcp-protocol";

/**
 * The 2026-07-28 envelope, for an endpoint whose payload handlers are shared
 * with the older initialize-based revisions.
 *
 * What changed in that revision is how a request identifies itself, not what
 * `tools/list` returns: version, identity and capabilities moved into
 * per-request `_meta`, mirrored into headers so intermediaries can route without
 * parsing bodies. So this module is only about the envelope — reading it,
 * checking that the headers agree with it, and refusing in the exact shapes the
 * spec defines. Everything past that point is era-agnostic.
 */

const META_PREFIX = "io.modelcontextprotocol/";
const BASE64_SENTINEL = /^=\?base64\?(.*)\?=$/;

/** Methods whose `Mcp-Name` header mirrors a body field. */
const NAME_SOURCE: Record<string, "name" | "uri"> = {
  "tools/call": "name",
  "prompts/get": "name",
  "resources/read": "uri",
};

export const HEADER_MISMATCH = -32020;
export const UNSUPPORTED_PROTOCOL_VERSION = -32022;
export const METHOD_NOT_FOUND = -32601;

export type ModernMeta = {
  protocolVersion?: string;
  clientInfo?: unknown;
  clientCapabilities?: unknown;
};

export function readModernMeta(params: unknown): ModernMeta | null {
  const meta = (params as { _meta?: Record<string, unknown> } | undefined)?._meta;
  if (!meta || typeof meta !== "object") return null;
  const version = meta[`${META_PREFIX}protocolVersion`];
  if (typeof version !== "string") return null;
  return {
    protocolVersion: version,
    clientInfo: meta[`${META_PREFIX}clientInfo`],
    clientCapabilities: meta[`${META_PREFIX}clientCapabilities`],
  };
}

/**
 * Which era this request belongs to. A dual-era server picks from how the client
 * opens: per-request metadata means modern, `initialize` means legacy. A modern
 * client may also lead with `server/discover`, which has no legacy counterpart.
 */
export function isModernRequest(method: unknown, params: unknown): boolean {
  if (method === "server/discover") return true;
  return readModernMeta(params) !== null;
}

/** Header values may arrive Base64-wrapped when the plain form is not ASCII-safe. */
export function decodeHeaderValue(value: string): string {
  const match = BASE64_SENTINEL.exec(value);
  if (!match) return value;
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(match[1]), (char) => char.charCodeAt(0)));
  } catch {
    return value;
  }
}

export type EnvelopeProblem = { code: number; message: string; data?: unknown; status: 400 };

/**
 * Header and body must agree, because a load balancer may route on the header
 * while we execute on the body. The spec makes that a hard rejection rather than
 * a preference for exactly that reason.
 */
export function validateModernEnvelope(
  request: Request,
  body: { method?: unknown; params?: unknown },
): EnvelopeProblem | null {
  const meta = readModernMeta(body.params);
  const headerVersion = request.headers.get("MCP-Protocol-Version");
  const method = typeof body.method === "string" ? body.method : "";

  if (!headerVersion) {
    return { code: HEADER_MISMATCH, message: "Missing required header: MCP-Protocol-Version", status: 400 };
  }
  if (meta?.protocolVersion && headerVersion !== meta.protocolVersion) {
    return {
      code: HEADER_MISMATCH,
      message: `Header mismatch: MCP-Protocol-Version header value '${headerVersion}' does not match body value '${meta.protocolVersion}'`,
      status: 400,
    };
  }

  const headerMethod = request.headers.get("Mcp-Method");
  if (!headerMethod) {
    return { code: HEADER_MISMATCH, message: "Missing required header: Mcp-Method", status: 400 };
  }
  if (headerMethod !== method) {
    return {
      code: HEADER_MISMATCH,
      message: `Header mismatch: Mcp-Method header value '${headerMethod}' does not match body value '${method}'`,
      status: 400,
    };
  }

  const nameField = NAME_SOURCE[method];
  if (nameField) {
    const bodyName = (body.params as Record<string, unknown> | undefined)?.[nameField];
    const headerName = request.headers.get("Mcp-Name");
    if (!headerName) {
      return { code: HEADER_MISMATCH, message: "Missing required header: Mcp-Name", status: 400 };
    }
    if (typeof bodyName === "string" && decodeHeaderValue(headerName) !== bodyName) {
      return {
        code: HEADER_MISMATCH,
        message: `Header mismatch: Mcp-Name header value does not match body value '${bodyName}'`,
        status: 400,
      };
    }
  }

  const requested = meta?.protocolVersion ?? headerVersion;
  if (!SUPPORTED_PROTOCOL_VERSIONS.has(requested)) {
    // The `supported` list is the whole point: without it a client has nothing
    // to retry with, which is how the previous 400 stranded Claude's connector.
    return {
      code: UNSUPPORTED_PROTOCOL_VERSION,
      message: "Unsupported protocol version",
      data: { supported: [...SUPPORTED_PROTOCOL_VERSIONS], requested },
      status: 400,
    };
  }

  return null;
}

/**
 * `server/discover` is the one RPC a modern server MUST answer: it is how a
 * client learns our versions, capabilities and identity before committing to
 * anything.
 */
export function discoverResult(serverInfo: { name: string; version: string }, options: {
  capabilities?: Record<string, unknown>;
  instructions?: string;
} = {}) {
  return {
    resultType: "complete",
    supportedVersions: [...SUPPORTED_PROTOCOL_VERSIONS].sort().reverse(),
    capabilities: options.capabilities ?? { tools: {}, resources: {} },
    _meta: { [`${META_PREFIX}serverInfo`]: serverInfo },
    ...(options.instructions ? { instructions: options.instructions } : {}),
  };
}

export { LATEST_PROTOCOL_VERSION };
