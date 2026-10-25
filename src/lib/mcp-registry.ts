export type McpTransportType = "stdio" | "http" | "sse";

export interface RegistryServer {
  registry_id: string;
  qualified_name: string;
  name: string;
  description: string;
  version: string;
  repository_url?: string;
  website_url?: string;
  icon_url?: string;
  transport_type: McpTransportType | null;
  transport_config: Record<string, unknown>;
  installable: boolean;
  install_error?: string;
  is_latest: boolean;
  published_at: string;
  updated_at: string;
  source: "official";
  publisher: {
    id: string;
    display_name: string;
    is_verified: boolean;
  };
}

interface RegistryArgument {
  type?: "positional" | "named";
  name?: string;
  value?: string;
  default?: string;
  isRequired?: boolean;
  isSecret?: boolean;
}

interface OfficialServerDetail {
  name?: string;
  title?: string;
  description?: string;
  version?: string;
  repository?: { url?: string };
  websiteUrl?: string;
  icons?: Array<{ src?: string }>;
  remotes?: Array<{
    type?: "streamable-http" | "sse";
    url?: string;
    headers?: RegistryArgument[];
    variables?: Record<string, RegistryArgument>;
  }>;
  packages?: Array<{
    registryType?: string;
    identifier?: string;
    runtimeHint?: string;
    transport?: { type?: string };
    runtimeArguments?: RegistryArgument[];
    packageArguments?: RegistryArgument[];
    environmentVariables?: RegistryArgument[];
  }>;
}

export interface OfficialRegistryEntry {
  server?: OfficialServerDetail;
  _meta?: {
    "io.modelcontextprotocol.registry/official"?: {
      status?: string;
      publishedAt?: string;
      updatedAt?: string;
      isLatest?: boolean;
    };
  };
}

export interface OfficialRegistryResponse {
  servers?: OfficialRegistryEntry[];
  metadata?: { nextCursor?: string; count?: number };
}

function namespaceFor(name: string): string {
  const slash = name.indexOf("/");
  return slash === -1 ? name : name.slice(0, slash);
}

function argumentValue(argument: RegistryArgument): string | null {
  const placeholder = argument.name
    ? `\${${argument.name.replace(/[^A-Za-z0-9_]/g, "_").toUpperCase()}}`
    : null;
  if (argument.isSecret) return argument.isRequired ? placeholder : null;
  if (typeof argument.value === "string") return argument.value;
  if (typeof argument.default === "string") return argument.default;
  if (argument.isRequired) return placeholder;
  return null;
}

function resolveUrlTemplate(
  url: string,
  variables: Record<string, RegistryArgument> | undefined,
): string | null {
  let resolved = url;
  for (const match of url.matchAll(/\{([^{}]+)\}/g)) {
    const name = match[1];
    const value = variables?.[name] ? argumentValue({ ...variables[name], name }) : null;
    if (value === null) return null;
    resolved = resolved.replaceAll(match[0], value);
  }
  return resolved;
}

function remoteTransport(remote: NonNullable<OfficialServerDetail["remotes"]>[number]) {
  if (!remote.url || (remote.type !== "streamable-http" && remote.type !== "sse")) return null;
  const url = resolveUrlTemplate(remote.url, remote.variables);
  if (!url) return null;

  const headers = Object.fromEntries(
    (remote.headers ?? []).flatMap((header) => {
      if (!header.name) return [];
      const value = argumentValue(header);
      return value === null ? [] : [[header.name, value]];
    }),
  );

  return {
    transport_type: remote.type === "sse" ? "sse" as const : "http" as const,
    transport_config: {
      url,
      timeout_ms: 15000,
      ...(Object.keys(headers).length ? { headers } : {}),
    },
  };
}

function packageTransport(pkg: NonNullable<OfficialServerDetail["packages"]>[number]) {
  if (pkg.transport?.type !== "stdio" || !pkg.identifier) return null;
  const command = pkg.runtimeHint
    ?? (pkg.registryType === "npm" ? "npx" : pkg.registryType === "pypi" ? "uvx" : null);
  if (!command) return null;

  const runtimeArgs = (pkg.runtimeArguments ?? []).map(argumentValue).filter((value): value is string => value !== null);
  const packageArgs = (pkg.packageArguments ?? []).map(argumentValue).filter((value): value is string => value !== null);
  const env = Object.fromEntries(
    (pkg.environmentVariables ?? []).flatMap((variable) => {
      if (!variable.name) return [];
      const value = argumentValue(variable);
      return value === null ? [] : [[variable.name, value]];
    }),
  );

  return {
    transport_type: "stdio" as const,
    transport_config: {
      command,
      args: [...runtimeArgs, pkg.identifier, ...packageArgs],
      ...(Object.keys(env).length ? { env } : {}),
    },
  };
}

export function normalizeRegistryServer(entry: OfficialRegistryEntry): RegistryServer | null {
  const server = entry.server;
  if (!server?.name || !server.version) return null;
  const official = entry._meta?.["io.modelcontextprotocol.registry/official"];
  const transport = server.remotes?.map(remoteTransport).find(Boolean)
    ?? server.packages?.map(packageTransport).find(Boolean)
    ?? null;
  const namespace = namespaceFor(server.name);

  return {
    registry_id: `${server.name}@${server.version}`,
    qualified_name: server.name,
    name: server.title?.trim() || server.name,
    description: server.description?.trim() || "No description provided.",
    version: server.version,
    repository_url: server.repository?.url,
    website_url: server.websiteUrl,
    icon_url: server.icons?.find((icon) => icon.src)?.src,
    transport_type: transport?.transport_type ?? null,
    transport_config: transport?.transport_config ?? {},
    installable: transport !== null,
    install_error: transport ? undefined : "No supported remote or stdio package is published for this server.",
    is_latest: official?.isLatest ?? true,
    published_at: official?.publishedAt ?? "",
    updated_at: official?.updatedAt ?? "",
    source: "official",
    publisher: {
      id: namespace,
      display_name: namespace,
      is_verified: true,
    },
  };
}

export function normalizeRegistryResponse(response: OfficialRegistryResponse) {
  return {
    servers: (response.servers ?? [])
      .map(normalizeRegistryServer)
      .filter((server): server is RegistryServer => server !== null),
    metadata: response.metadata ?? {},
  };
}

export const OFFICIAL_MCP_REGISTRY_SERVERS_URL =
  "https://registry.modelcontextprotocol.io/v0.1/servers";

/**
 * Where `GET /api/mcp-registry/search` should fetch from, or `null` to refuse.
 *
 * Unset env keeps the official registry (hosted behaviour). An empty
 * `MCP_REGISTRY_URL` disables the lookup. `NO_EGRESS=true` does the same
 * unless an operator points `MCP_REGISTRY_URL` at an internal mirror.
 */
export function resolveMcpRegistryServersUrl(
  noEgress = process.env.NO_EGRESS,
  configured = process.env.MCP_REGISTRY_URL,
): string | null {
  const trimmed = configured?.trim();
  if (trimmed) return trimmed;
  if (configured !== undefined && configured.trim() === "") return null;
  if (noEgress?.trim().toLowerCase() === "true") return null;
  return OFFICIAL_MCP_REGISTRY_SERVERS_URL;
}
