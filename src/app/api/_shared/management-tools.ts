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
  finder.description = "Find account and playbook operations by keyword and return their input schemas. No playbook_id is needed for the account catalog. Supply playbook_id to also search connected servers. Call returned tools directly; omitted tools remain callable in core/full. Pinned domain views search only their allowed operations.";

  return tools;
}
