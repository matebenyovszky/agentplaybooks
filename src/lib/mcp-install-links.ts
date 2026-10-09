/**
 * Install links for the clients that accept one, and the places in Claude a
 * user is sent to.
 *
 * Every playbook endpoint is an OAuth protected resource (see mcp-oauth.ts), so
 * a client that speaks MCP authorization needs only the URL: it discovers the
 * authorization server, registers itself, and asks the user to sign in. That is
 * what makes these links genuinely one click — there is no key to paste into the
 * dialog they open. A malformed deeplink fails by opening that dialog empty,
 * with nothing reporting why, which is why they are built here with tests
 * rather than inline in a template string.
 */

/** A remote MCP server as Cursor, VS Code, and Claude Code all spell it. */
export type HttpServerDefinition = {
  type: "http";
  url: string;
};

/**
 * Where Claude lists connectors. Claude documents no link that pre-fills the
 * "Add custom connector" dialog, so the dashboard opens this page and offers the
 * URL to copy beside it.
 */
export const CLAUDE_CONNECTORS_URL = "https://claude.ai/customize/connectors";

/** The page that explains every route into Claude, plugin included. */
export const CLAUDE_DOCS_PATH = "/docs/claude";

/** The repository marketplace, for Claude Code users who want the full CLI plugin. */
export const CLAUDE_CODE_MARKETPLACE_COMMAND = "/plugin marketplace add matebenyovszky/agentplaybooks";

/**
 * Cursor limits `server_name + tool_name` to 60 characters combined, so the entry
 * name uses the short `apb-` prefix and a truncated playbook name.
 */
export function mcpEntryName(playbookName?: string | null): string {
  const slug = playbookName
    ?.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 30)
    // Punctuation at either end, or a truncation mid-word, leaves a separator
    // behind; a name of nothing but punctuation would otherwise become `apb--`.
    .replace(/^-+|-+$/g, "");
  return `apb-${slug || "playbook"}`;
}

export function httpServerDefinition(endpoint: string): HttpServerDefinition {
  return { type: "http", url: endpoint };
}

function base64(value: string): string {
  // The dashboard runs this in the browser; tests run it under Node.
  return typeof window === "undefined"
    ? Buffer.from(value, "utf8").toString("base64")
    : window.btoa(value);
}

/** `cursor://anysphere.cursor-deeplink/mcp/install?name=…&config=<base64 json>` */
export function cursorInstallLink(name: string, definition: HttpServerDefinition): string {
  const config = base64(JSON.stringify(definition));
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent(name)}&config=${encodeURIComponent(config)}`;
}

/** `vscode:mcp/install?<url-encoded json>` — VS Code puts the name inside the object. */
export function vscodeInstallLink(name: string, definition: HttpServerDefinition): string {
  return `vscode:mcp/install?${encodeURIComponent(JSON.stringify({ name, ...definition }))}`;
}

/** `claude mcp add` for Claude Code; `/mcp` then runs the sign-in. */
export function claudeCodeAddCommand(name: string, endpoint: string): string {
  return `claude mcp add --transport http ${name} ${endpoint}`;
}
