import { API_VERSION } from "@/lib/api-contract";

/** Stable, value-free diagnostics. Never put arguments, credentials or URLs here. */
export const MCP_CATALOG_REVISION = "2026-10-31.lazy-diagnostics.3";

export class McpDiagnosticError extends Error {
  constructor(message: string, readonly reason: string, readonly nextSteps: string[]) {
    super(message);
  }
}

const SECRET_FAILURES: Record<string, [string, string]> = {
  not_authorized: ["secrets_permission_required", "Check the connection’s secret read/write scope and its role in the selected playbook."],
  not_found: ["secret_not_found", "Use list_secrets to confirm the name in the selected playbook."],
  expired: ["expired", "Ask the owner or an editor to renew or clear expires_at."],
  private_destination: ["private_destination", "Use a public API destination; private and internal addresses are refused."],
  destination_not_allowed: ["destination_not_allowed", "Use a destination covered by the secret’s allowed_hosts policy."],
  method_not_allowed: ["method_not_allowed", "Use use_secret for GET/HEAD and use_secret_write for POST/PUT/PATCH/DELETE."],
  duplicate_name: ["duplicate_secret_name", "Use rotate_secret to replace an existing secret."],
  reveal_requires_owner: ["reveal_requires_owner", "Ask the owner or an editor to change reveal policy in the vault UI."],
  insert_failed: ["secret_store_failed", "Check server database availability and migrations."],
  update_failed: ["secret_update_failed", "Check server database availability and migrations."],
  delete_failed: ["secret_delete_failed", "Check server database availability and migrations."],
};

export function mcpErrorData(error: unknown, secretReason?: string | null) {
  const failure = secretReason ? SECRET_FAILURES[secretReason] : undefined;
  const diagnostic = error instanceof McpDiagnosticError ? error : failure
    ? new McpDiagnosticError("Secret operation failed", failure[0], [failure[1]]) : null;
  return {
    api_version: API_VERSION,
    catalog_revision: MCP_CATALOG_REVISION,
    phase: "server_tool_execution",
    reason: diagnostic ? diagnostic.reason : "tool_execution_failed",
    ...(diagnostic?.reason === "secrets_read_required" || diagnostic?.reason === "secrets_permission_required" || diagnostic?.reason === "secret_metadata_query_failed" ? { existence: "unknown" } : {}),
    next_steps: diagnostic ? diagnostic.nextSteps : [
      "Check the error message and connection permissions. Use get_connection_info on the account connection to inspect the server catalog; a local missing-function error means the host did not send a request.",
    ],
  };
}
