import type { McpTool, MCPServer } from "@/lib/supabase/types";
import { READ_TOOL_PERMISSIONS, NO_DATA_TOOLS } from "./private-read-scopes";
import { resolvePrivatePlaybookActor, validateUserApiKey } from "./auth";
import { getPlaybookAccessRole } from "./guards";

/** A header alone is not authentication: rejected keys keep the public view. */
export async function isAnonymousPublicRequest(request: Request, playbookId: string, isPublic: boolean) {
  if (!isPublic) return false;
  if (!request.headers.has("Authorization") && !request.headers.has("X-API-Key")) return true;
  if (await resolvePrivatePlaybookActor(request, playbookId)) return false;
  // A public-playbook writer need not hold playbooks:read. Recognize that
  // valid account credential without widening the operation's own permissions.
  const userKey = await validateUserApiKey(request);
  return !userKey || !await getPlaybookAccessRole(userKey.user_id, playbookId);
}

export function isReadOnlyTool(tool: McpTool) {
  return tool.annotations?.readOnlyHint === true && tool.annotations?.destructiveHint !== true;
}

/** Permission checks exclude credential-backed reads such as use_secret.
 * read_memory is excluded too: it updates access counters on every call.
 */
export function isPublicBuiltinTool(tool: McpTool) {
  return (Object.hasOwn(READ_TOOL_PERMISSIONS, tool.name) || NO_DATA_TOOLS.has(tool.name)) && isReadOnlyTool(tool);
}

/** The owner must explicitly publish a connection before any upstream discovery. */
export function isPublicMcpServer(server: MCPServer) {
  return (server.transport_config as { access?: string } | null)?.access === "public";
}
