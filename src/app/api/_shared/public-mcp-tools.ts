import type { McpTool, MCPServer } from "@/lib/supabase/types";
import { READ_TOOL_PERMISSIONS, NO_DATA_TOOLS } from "./private-read-scopes";
import { resolvePrivatePlaybookActor, validateUserApiKey } from "./auth";
import { getPlaybookAccessRole } from "./guards";
import { anonymousMayCall } from "./federation-secrets";

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
 * Connection configuration is control-plane data, even on a public playbook.
 * read_memory is excluded too: it updates access counters on every call.
 */
export function isPublicBuiltinTool(tool: McpTool) {
  return tool.name !== "list_mcp_servers"
    && (Object.hasOwn(READ_TOOL_PERMISSIONS, tool.name) || NO_DATA_TOOLS.has(tool.name)) && isReadOnlyTool(tool);
}

/** Reuse the credential-free public gate from main for discovery as well as calls. */
export function isPublicMcpServer(server: MCPServer) {
  return anonymousMayCall(server);
}
