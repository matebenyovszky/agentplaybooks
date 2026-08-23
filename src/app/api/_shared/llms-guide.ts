import type { MCPServer, McpTool } from "@/lib/supabase/types";
import { federatedServerPrefix } from "@/lib/mcp/federation";

/**
 * The one-fetch guide: everything an agent needs to use a playbook, as plain
 * markdown at a stable URL.
 *
 * Two facts shaped this. First, code-executing agents collapse multi-step tool
 * chains into one script — and at least one of them (Hermes Agent's
 * programmatic tool calling) whitelists its own local tools and excludes MCP
 * tools from scripts entirely, so for that whole class of agent our plain REST
 * surface is the only scriptable door. Second, a single worked example teaches
 * a model a calling convention better than a schema does; the difference shows
 * up directly in first-attempt success. So this guide leads with the calling
 * convention, gives every tool a one-shot example derived from its own schema,
 * and fits in a single read instead of a discovery dance.
 */

type SchemaProperty = {
  type?: string | string[];
  description?: string;
  enum?: unknown[];
  items?: { type?: string };
};

type InputSchema = {
  properties?: Record<string, SchemaProperty>;
  required?: string[];
};

/**
 * A one-shot example argument object, derived from the tool's own schema:
 * required properties only, values picked from the enum when there is one, a
 * type-shaped placeholder otherwise. Deterministic, so the guide is cacheable
 * and diffs stay readable.
 */
export function exampleArgumentsFor(tool: McpTool): Record<string, unknown> {
  const schema = (tool.inputSchema || {}) as InputSchema;
  const required = schema.required ?? [];
  const example: Record<string, unknown> = {};
  for (const name of required) {
    const property = schema.properties?.[name] ?? {};
    example[name] = placeholderFor(name, property);
  }
  return example;
}

function placeholderFor(name: string, property: SchemaProperty): unknown {
  if (Array.isArray(property.enum) && property.enum.length > 0) return property.enum[0];
  const type = Array.isArray(property.type) ? property.type[0] : property.type;
  switch (type) {
    case "number":
    case "integer":
      return 10;
    case "boolean":
      return true;
    case "array":
      return property.items?.type === "string" ? [`example-${name}`] : [];
    case "object":
      return {};
    default:
      return `example-${name.replace(/_/g, "-")}`;
  }
}

/** The first sentence of a description — the guide links depth, it does not repeat it. */
function firstSentence(text: string | undefined, fallback: string): string {
  if (!text) return fallback;
  const match = text.match(/^.*?[.!?](?:\s|$)/);
  return (match ? match[0] : text).trim();
}

export function buildAgentGuide(options: {
  baseUrl: string;
  guid: string;
  playbookName: string;
  description?: string | null;
  tools: McpTool[];
  servers: MCPServer[];
}): string {
  const { baseUrl, guid, playbookName, description, tools, servers } = options;
  const endpoint = `${baseUrl}/api/mcp/${guid}`;
  const exampleTool = tools.find((tool) => tool.name === "read_memory") ?? tools[0];
  const exampleArgs = exampleTool ? JSON.stringify(exampleArgumentsFor(exampleTool)) : "{}";

  const lines: string[] = [
    `# ${playbookName} — agent access guide`,
    "",
    ...(description ? [`> ${description.trim()}`, ""] : []),
    "This playbook is reachable two ways with the same tools, the same API key,",
    "and the same audit trail: MCP for platforms that speak it natively, and",
    "plain HTTPS for anything that can run code or curl. If your platform",
    "executes scripts but does not let scripts call MCP tools, use the HTTPS",
    "surface — one POST per tool call, no handshake, no session.",
    "",
    "## Authentication",
    "",
    "Send an AgentPlaybooks API key (`apb_...`) with every request, in either",
    "header — the `Bearer ` prefix is optional in both:",
    "",
    "```text",
    "Authorization: apb_YOUR_KEY",
    "X-API-Key: apb_YOUR_KEY",
    "```",
    "",
    "Prefer `X-API-Key` when your platform reserves `Authorization` for its own",
    "authentication. Read the key from an environment variable; never write it",
    "into code or config.",
    "",
    "## Call any tool with one POST",
    "",
    "```text",
    `POST ${endpoint}/tools/TOOL_NAME`,
    "Content-Type: application/json",
    "",
    "{ ...tool arguments as JSON... }",
    "```",
    "",
    "The response is `{\"tool\": name, \"result\": ...}`. One-shot example:",
    "",
    "```bash",
    `curl -s -X POST '${endpoint}/tools/${exampleTool?.name ?? "read_memory"}' \\`,
    "  -H \"X-API-Key: $APBKS_KEY\" -H 'Content-Type: application/json' \\",
    `  -d '${exampleArgs}'`,
    "```",
    "",
    "The same from a Python sandbox:",
    "",
    "```python",
    "import os, requests",
    `BASE = "${endpoint}/tools/"`,
    "def call(tool, **arguments):",
    "    response = requests.post(BASE + tool, json=arguments,",
    "        headers={\"X-API-Key\": os.environ[\"APBKS_KEY\"]}, timeout=30)",
    "    response.raise_for_status()",
    "    return response.json()[\"result\"]",
    "",
    `result = call(${JSON.stringify(exampleTool?.name ?? "read_memory")}, **${exampleArgs})`,
    "```",
    "",
    "Chain as many calls as the task needs inside one script — intermediate",
    "results stay in your variables instead of your context window.",
    "",
    "## MCP (native)",
    "",
    "```text",
    endpoint,
    "```",
    "",
    "Streamable HTTP; no OAuth — authenticate with the API key header above.",
    "Append `?toolset=runtime|memory|admin` to narrow (and enforce) the surface;",
    "unpinned connections can discover everything through the `find_tools` tool.",
    "",
    "## Built-in tools",
    "",
    "Each entry: what it does, and a one-shot example body for",
    "`POST .../tools/<name>`. Full schemas come from MCP `tools/list` or the",
    "`find_tools` tool.",
    "",
  ];

  for (const tool of tools) {
    lines.push(`### ${tool.name}`);
    lines.push("");
    lines.push(firstSentence(tool.description, tool.name));
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(exampleArgumentsFor(tool)));
    lines.push("```");
    lines.push("");
  }

  if (servers.length > 0) {
    lines.push("## Federated tools");
    lines.push("");
    lines.push("Tools proxied from connected MCP/OpenAPI servers, called exactly like");
    lines.push("built-ins. Names and schemas come from `find_tools` or `tools/list`;");
    lines.push("the stored names are listed here, but the live catalog wins.");
    lines.push("");
    for (const server of servers) {
      const prefix = federatedServerPrefix(server, servers);
      const stored = (server.tools ?? []).map((tool) => `${prefix}${tool.name}`);
      lines.push(`- **${server.name}** — prefix \`${prefix}\`${stored.length ? `: ${stored.join(", ")}` : ""}`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}
