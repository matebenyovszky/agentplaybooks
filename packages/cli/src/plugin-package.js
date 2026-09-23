/** Pure Agent Plugins 1.0 document builders shared by the CLI and web export. */
export const PLUGIN_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";
export const MCP_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json";

const PLUGIN_NAME = /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;

export function pluginName(value) {
  const slug = String(value).toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/\.+/g, ".")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 64)
    .replace(/[.-]+$/g, "");
  return PLUGIN_NAME.test(slug) ? slug : "agent-playbook";
}

/**
 * @param {{name?: string, version?: string, description?: string | null, author?: {name?: string, email?: string, url?: string}, homepage?: string, repository?: string, license?: string, keywords?: string[], extensions?: Record<string, object>}} options
 */
export function portablePluginManifest({ name, version = "1.0.0", description, author, homepage, repository, license, keywords, extensions } = {}) {
  return {
    $schema: PLUGIN_SCHEMA,
    name: pluginName(name ?? "agent-playbook"),
    version: String(version),
    ...(description ? { description } : {}),
    ...(author ? { author } : {}),
    ...(homepage ? { homepage } : {}),
    ...(repository ? { repository } : {}),
    ...(license ? { license } : {}),
    ...(keywords?.length ? { keywords } : {}),
    ...(extensions && Object.keys(extensions).length ? { extensions } : {}),
  };
}

export function portableMcpConfig(mcpServers) {
  return { $schema: MCP_SCHEMA, mcpServers };
}

/** Conservative client-side guard; server-side publication must validate again. */
export function containsLiteralCredential(content) {
  const patterns = [
    /\bsk-[a-zA-Z0-9_-]{20,}\b/,
    /\bgh[pousr]_[a-zA-Z0-9]{20,}\b/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /(?:api[_-]?key|access[_-]?token|auth[_-]?token|password|passwd|client[_-]?secret)[A-Za-z0-9_-]*["']?\s*[=:]\s*["']?([^\s,"'}]+)/i,
  ];
  const reference = /^(?:\$\{|\$[A-Za-z_]|\{\{|<|your[_-]|example|changeme|replace[_-]|env:|vault:|secret:|process\.env|import\.meta\.env|os\.environ|os\.getenv|System\.getenv|Deno\.env|getenv\(|ENV\[)/i;
  for (const line of String(content).split(/\r?\n/)) {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match && !reference.test((match[1] ?? match[0]).trim())) return true;
    }
  }
  return false;
}
