export const USER_API_KEY_PERMISSION_OPTIONS = [
  { id: "playbooks:read", label: "Read Playbooks", description: "List and view your playbooks" },
  { id: "playbooks:write", label: "Write Playbooks", description: "Create, update, and delete playbooks and connected servers" },
  { id: "personas:read", label: "Read Personas", description: "Read persona definitions" },
  { id: "personas:write", label: "Write Personas", description: "Add, update, and reset personas" },
  { id: "skills:read", label: "Read Skills", description: "Read skill definitions and versions" },
  { id: "skills:write", label: "Write Skills", description: "Add, update, rollback, and delete skills" },
  { id: "memory:read", label: "Read Memory", description: "Read and search memory entries" },
  { id: "memory:write", label: "Write Memory", description: "Write, organize, and delete memory entries" },
  { id: "canvas:read", label: "Read Canvas", description: "Read workflow runs and canvas documents" },
  { id: "canvas:write", label: "Write Canvas", description: "Create runs and revise canvas documents" },
  { id: "tools:call", label: "Call Connected Tools", description: "Call non-public tools on connected MCP servers" },
  { id: "secrets:read", label: "Use Secrets", description: "List metadata and use secrets through the zero-exposure proxy" },
  { id: "secrets:write", label: "Manage Secrets", description: "Store, rotate, and delete encrypted secrets" },
  { id: "audit:read", label: "Read Audit Logs", description: "Export and verify the playbook audit trail. Does not grant secret values." },
  { id: "full", label: "Full Access", description: "All current and future permissions" },
] as const;

// Secret permissions stay opt-in because they authorize outbound authenticated
// requests or credential mutation.
export const DEFAULT_USER_API_KEY_PERMISSIONS = [
  "playbooks:read",
  "playbooks:write",
  "personas:read",
  "personas:write",
  "skills:read",
  "skills:write",
  "memory:read",
  "memory:write",
  "canvas:read",
  "canvas:write",
  "tools:call",
];
