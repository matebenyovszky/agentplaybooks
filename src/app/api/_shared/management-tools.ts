import { ACCOUNT_TOOLS } from "./account-tools";
import { projectPlaybookToolsForUser } from "./playbook-tools";

/** Shared credential-free catalog for HTTP and stdio discovery. */
export function managementTools() {
  const tools = [
    ...ACCOUNT_TOOLS,
    ...projectPlaybookToolsForUser(),
  ];
  // Management discovery works before a playbook is selected. Supplying a
  // playbook_id still supports the existing scoped/federated search.
  const finder = tools.find(tool => tool.name === "find_tools")!;
  finder.inputSchema = { ...finder.inputSchema, required: ["query"] };
  finder.description = "Find operations by keyword; set include_schemas=false for short summaries. Omitted include_schemas preserves the legacy full-schema response. No playbook_id is needed for built-ins; supply one for connected tools. Partial matches report missing_terms. Schemas do not register host functions: use an exposed tool or POST /api/control/{name} with the same authorized arguments. Public built-in documentation is available at /api/tools/{name}; private data and execution require authentication. Pinned domain views remain enforced.";

  return tools.map(tool => ({ ...tool, securitySchemes: tool.securitySchemes ?? [{ type: "oauth2", scopes: [] }] }));
}
