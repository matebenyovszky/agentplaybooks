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
    expect(tools.find((tool) => tool.name === "delete_playbook")?.annotations?.destructiveHint).toBe(true);
    expect(validateUserApiKey).not.toHaveBeenCalled();
    expect(listAccessiblePlaybooks).not.toHaveBeenCalled();
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
    expect(request.url).toBe("http://localhost/api/mcp/manage");
    const write = await client.callTool({ name: "create_playbook", arguments: { name: "denied" } });
    expect(write.isError).toBe(true);
    expect(JSON.stringify(write)).toContain("Permission denied");
    expect(JSON.stringify(write)).not.toContain("stdio-test-user-key");
  });
});
