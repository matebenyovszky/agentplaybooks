import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createStdioServer } from "@/lib/mcp/stdio-server";

const { validateUserApiKey, listAccessiblePlaybooks } = vi.hoisted(() => ({
  validateUserApiKey: vi.fn(),
  listAccessiblePlaybooks: vi.fn(),
}));
vi.mock("@/app/api/_shared/auth", () => ({
  validateUserApiKey,
  getAuthenticatedUser: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/repositories/playbooks", () => ({ listAccessiblePlaybooks, createPlaybook: vi.fn() }));

const clients: Client[] = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

async function connect() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "stdio-test", version: "1.0.0" });
  clients.push(client);
  await Promise.all([createStdioServer().connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe("local AgentPlaybooks MCP transport", () => {
  it("initializes and exposes validated tool schemas without database access", async () => {
    vi.stubEnv("AGENTPLAYBOOKS_API_KEY", "");
    const client = await connect();
    expect(client.getServerVersion()?.name).toBe("agentplaybooks-management");
    await client.ping();
    const { tools } = await client.listTools();
    expect(tools.some((tool) => tool.name === "list_playbooks")).toBe(true);
    const skill = tools.find((tool) => tool.name === "get_skill");
    expect(skill?.inputSchema.required).toContain("playbook_id");
    expect(tools).toHaveLength(17);
    expect(tools.find(tool => tool.name === "find_tools")?.inputSchema.required).toEqual(["query"]);
    expect(tools.some(tool => tool.name === "delete_playbook")).toBe(false);
    expect(validateUserApiKey).not.toHaveBeenCalled();
    expect(listAccessiblePlaybooks).not.toHaveBeenCalled();
  });

  it("offers the full catalog for strict clients and rejects invalid views", async () => {
    vi.stubEnv("AGENTPLAYBOOKS_TOOLSET", "full");
    const { tools } = await (await connect()).listTools();
    expect(tools).toHaveLength(56);
    expect(tools.find(tool => tool.name === "reset_persona")?.annotations?.destructiveHint).toBe(true);
    vi.stubEnv("AGENTPLAYBOOKS_TOOLSET", "memroy");
    expect(() => createStdioServer()).toThrow("Unknown management toolset");
  });

  it("serves full schemas to a legacy stdio client that omits the new option", async () => {
    vi.stubEnv("AGENTPLAYBOOKS_API_KEY", "stdio-test-user-key");
    validateUserApiKey.mockResolvedValue({ user_id: "reader-id", permissions: ["playbooks:read"] });
    const client = await connect();
    const result = await client.callTool({ name: "find_tools", arguments: { query: "get_skill" } });
    expect(result.isError).not.toBe(true);
    const legacy = result.structuredContent as { matches: Array<{ name: string; inputSchema: { required: string[] } }> };
    expect(legacy.matches[0].name).toBe("get_skill");
    expect(legacy.matches[0].inputSchema.required).toEqual(["playbook_id", "skill_id"]);
    const compact = await client.callTool({ name: "find_tools", arguments: { query: "get_skill", include_schemas: false } });
    expect((compact.structuredContent as { matches: Array<{ inputSchema?: unknown }> }).matches[0].inputSchema).toBeUndefined();
  });

  it("returns connection diagnostics through the same authenticated handler", async () => {
    vi.stubEnv("AGENTPLAYBOOKS_API_KEY", "stdio-test-user-key");
    validateUserApiKey.mockResolvedValue({ user_id: "reader-id", permissions: ["playbooks:read"] });
    const result = await (await connect()).callTool({ name: "get_connection_info", arguments: {} });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({ toolset: "core", account_permissions: ["playbooks:read"], host_registration: "unknown_to_server" });
    expect(JSON.stringify(result)).not.toContain("stdio-test-user-key");
  });

  it("preserves structured failure reasons across stdio", async () => {
    vi.stubEnv("AGENTPLAYBOOKS_API_KEY", "stdio-test-user-key");
    validateUserApiKey.mockResolvedValue({ user_id: "reader-id", permissions: ["playbooks:read"] });
    const result = await (await connect()).callTool({ name: "list_secrets", arguments: {} });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ error: { data: { reason: "missing_playbook_id" } } });
    expect(JSON.stringify(result)).not.toContain("stdio-test-user-key");
  });

  it("pins execution as well as discovery to the selected domain", async () => {
    vi.stubEnv("AGENTPLAYBOOKS_TOOLSET", "memory");
    vi.stubEnv("AGENTPLAYBOOKS_API_KEY", "stdio-test-user-key");
    validateUserApiKey.mockResolvedValue({ user_id: "reader-id", permissions: ["playbooks:read"] });
    listAccessiblePlaybooks.mockResolvedValue([]);
    const client = await connect();
    const result = await client.callTool({ name: "delete_playbook", arguments: { playbook_id: "unused" } });
    expect(result.isError).toBe(true);
    expect(validateUserApiKey).not.toHaveBeenCalled();
    await client.callTool({ name: "list_playbooks", arguments: {} });
    expect((validateUserApiKey.mock.calls[0][0] as Request).url).toContain("toolset=memory");
  });

  it("refuses execution without configuration before importing the database handler", async () => {
    vi.stubEnv("AGENTPLAYBOOKS_API_KEY", "");
    const result = await (await connect()).callTool({ name: "list_playbooks", arguments: {} });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain("AGENTPLAYBOOKS_API_KEY");
    expect(validateUserApiKey).not.toHaveBeenCalled();
  });

  it("executes the local handler using the caller's user key and preserves its write restrictions", async () => {
    vi.stubEnv("AGENTPLAYBOOKS_API_KEY", "stdio-test-user-key");
    validateUserApiKey.mockResolvedValue({ user_id: "reader-id", permissions: ["playbooks:read"] });
    listAccessiblePlaybooks.mockResolvedValue([]);
    const client = await connect();
    const read = await client.callTool({ name: "list_playbooks", arguments: {} });
    expect(read.isError).not.toBe(true);
    expect(listAccessiblePlaybooks).toHaveBeenCalledWith("reader-id", { compact: true, limit: 50, offset: 0 });
    const request = validateUserApiKey.mock.calls[0][0] as Request;
    expect(request.headers.get("X-API-Key")).toBe("stdio-test-user-key");
    expect(request.url).toBe("http://localhost/api/mcp/manage?toolset=core");
    const write = await client.callTool({ name: "create_playbook", arguments: { name: "denied" } });
    expect(write.isError).toBe(true);
    expect(JSON.stringify(write)).toContain("Permission denied");
    expect(JSON.stringify(write)).not.toContain("stdio-test-user-key");
  });
});
