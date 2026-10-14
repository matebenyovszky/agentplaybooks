/**
 * The Claude plugin's local `agentplaybooks-servers` MCP server, tested the
 * way Claude Code runs it: a separate process speaking JSON-RPC over stdio,
 * configured only through the CLI's credential file, in front of real HTTP
 * servers. Two fake AgentPlaybooks servers stand in for, say, the hosted
 * service and an organisation's own; each accepts only its own key, so a call
 * that reaches the wrong one, or carries the wrong key, fails visibly.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const script = path.resolve(__dirname, "../plugins/agentplaybooks/server/servers.mjs");

type Call = { method: string; tool?: string; args?: Record<string, unknown>; session?: string };

interface FakeServer {
  url: string;
  label: string;
  key: string;
  calls: Call[];
  close: () => Promise<void>;
}

/**
 * `sse` answers tool calls as an event stream, and `session` hands out a
 * session id on initialize and refuses later requests without it — the two
 * transport shapes a Streamable HTTP server may use.
 */
async function fakeServer(name: string, key: string, options: { sse?: boolean; session?: string } = {}): Promise<FakeServer> {
  const calls: Call[] = [];
  const playbooks = [{ id: `uuid-${name}`, guid: `guid-${name}`, name: `Playbook on ${name}` }];
  const server = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      if (request.headers["x-api-key"] !== key) {
        response.writeHead(401, { "content-type": "application/json" }).end('{"error":"unauthorized"}');
        return;
      }
      const message = JSON.parse(body);
      const session = request.headers["mcp-session-id"] as string | undefined;
      calls.push({ method: message.method, tool: message.params?.name, args: message.params?.arguments, session });
      if (options.session && message.method !== "initialize" && session !== options.session) {
        response.writeHead(400).end();
        return;
      }
      if (message.id === undefined) {
        response.writeHead(202).end();
        return;
      }
      let result: unknown;
      if (message.method === "initialize") {
        result = { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name, version: "1" } };
      } else if (message.method === "tools/list") {
        result = {
          tools: [
            { name: "list_playbooks", inputSchema: { type: "object", properties: {} }, outputSchema: { type: "object" } },
            { name: "create_playbook", inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } },
            { name: "get_playbook", inputSchema: { type: "object", properties: { playbook_id: { type: "string" } }, required: ["playbook_id"] } },
          ],
        };
      } else if (message.params?.name === "list_playbooks") {
        result = { content: [{ type: "text", text: JSON.stringify({ playbooks }) }], structuredContent: { playbooks } };
      } else {
        const answer = { answeredBy: name, args: message.params?.arguments };
        result = { content: [{ type: "text", text: JSON.stringify(answer) }], structuredContent: answer };
      }
      const reply = JSON.stringify({ jsonrpc: "2.0", id: message.id, result });
      const headers: Record<string, string> = {};
      if (options.session) headers["mcp-session-id"] = options.session;
      if (options.sse && message.method === "tools/call") {
        response.writeHead(200, { ...headers, "content-type": "text/event-stream" })
          .end(`event: message\ndata: ${reply}\n\n`);
      } else {
        response.writeHead(200, { ...headers, "content-type": "application/json" }).end(reply);
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    label: `127.0.0.1:${port}`,
    key,
    calls,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

type Json = Record<string, unknown>;
interface Tool {
  name: string;
  inputSchema: { properties: Json };
  outputSchema?: unknown;
}
interface ToolResult {
  content: Array<{ type: string; text: string }>;
  structuredContent?: Json & { playbooks?: Json[]; answeredBy?: string };
  isError?: boolean;
}
interface Reply {
  result?: { instructions?: string; tools?: Tool[] };
  error?: { code: number; message: string };
}

class Client {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<number, (reply: Reply) => void>();
  private buffer = "";
  private nextId = 1;

  constructor(home: string) {
    const env: NodeJS.ProcessEnv = { ...process.env, HOME: home, USERPROFILE: home };
    this.child = spawn(process.execPath, [script], { env });
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk: string) => {
      this.buffer += chunk;
      let newline;
      while ((newline = this.buffer.indexOf("\n")) >= 0) {
        const reply = JSON.parse(this.buffer.slice(0, newline));
        this.buffer = this.buffer.slice(newline + 1);
        this.pending.get(reply.id)?.(reply);
        this.pending.delete(reply.id);
      }
    });
  }

  request(method: string, params?: unknown): Promise<Reply> {
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  }

  async tools(): Promise<Tool[]> {
    return (await this.request("tools/list")).result?.tools ?? [];
  }

  async callTool(name: string, args: Json = {}): Promise<ToolResult> {
    return (await this.request("tools/call", { name, arguments: args })).result as ToolResult;
  }

  close() {
    this.child.kill();
  }
}

describe("Claude plugin: agentplaybooks-servers", () => {
  let hosted: FakeServer;
  let own: FakeServer;
  const homes: string[] = [];
  const clients: Client[] = [];

  beforeAll(async () => {
    hosted = await fakeServer("hosted", "apb_live_hosted", { sse: true });
    own = await fakeServer("own", "apb_live_own", { session: "session-own" });
  });
  afterAll(async () => {
    await hosted.close();
    await own.close();
  });
  afterEach(() => {
    for (const client of clients.splice(0)) client.close();
    for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
    hosted.calls.length = 0;
    own.calls.length = 0;
  });

  function writeCredentials(home: string, remotes: Record<string, { apiKey: string }>) {
    mkdirSync(path.join(home, ".agentplaybooks"), { recursive: true });
    writeFileSync(path.join(home, ".agentplaybooks", "credentials.json"), JSON.stringify({ version: 1, remotes }));
  }

  async function start(remotes: Record<string, { apiKey: string }>) {
    const home = mkdtempSync(path.join(os.tmpdir(), "apb-servers-"));
    homes.push(home);
    writeCredentials(home, remotes);
    const client = new Client(home);
    clients.push(client);
    const init = await client.request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "0" },
    });
    return { client, home, instructions: init.result?.instructions ?? "" };
  }

  const both = () => ({
    [hosted.url]: { apiKey: hosted.key },
    [`${own.url}/`]: { apiKey: own.key },
    "http://playbooks.example.org:8007": { apiKey: "apb_live_plain_http" },
  });

  it("serves every logged-in server, and not one reached over plain HTTP on the network", async () => {
    const { instructions } = await start(both());
    expect(instructions).toContain(hosted.label);
    expect(instructions).toContain(own.label);
    expect(instructions).toContain("Not served");
    expect(instructions).toContain("http://playbooks.example.org:8007");
  });

  it("offers a server argument and lists playbooks from every server", async () => {
    const { client } = await start(both());
    const tools = await client.tools();
    for (const tool of tools) expect(tool.inputSchema.properties.server, tool.name).toBeDefined();
    expect(tools.find((tool) => tool.name === "list_playbooks")?.outputSchema).toBeUndefined();

    const listed = await client.callTool("list_playbooks");
    expect(listed.structuredContent?.playbooks).toEqual(expect.arrayContaining([
      expect.objectContaining({ guid: "guid-hosted", server: hosted.label }),
      expect.objectContaining({ guid: "guid-own", server: own.label }),
    ]));
  });

  it("sends a playbook call to the server that has the playbook, with that server's key", async () => {
    const { client } = await start(both());
    const result = await client.callTool("get_playbook", { playbook_id: "guid-own" });
    expect(result.structuredContent).toEqual({ answeredBy: "own", args: { playbook_id: "guid-own" } });
    const forwarded = own.calls.find((call) => call.tool === "get_playbook");
    expect(forwarded?.args).not.toHaveProperty("server");
    expect(forwarded?.session).toBe("session-own");
    expect(hosted.calls.some((call) => call.tool === "get_playbook")).toBe(false);
  });

  it("parses a reply sent as an event stream", async () => {
    const { client } = await start(both());
    const result = await client.callTool("get_playbook", { playbook_id: "uuid-hosted" });
    expect(result.structuredContent?.answeredBy).toBe("hosted");
  });

  it("asks which server, rather than guessing, for a call with no playbook", async () => {
    const { client } = await start(both());
    const unnamed = await client.callTool("create_playbook", { name: "New" });
    expect(unnamed.isError).toBe(true);
    expect(unnamed.content[0].text).toContain(hosted.label);
    expect(unnamed.content[0].text).toContain(own.label);

    const named = await client.callTool("create_playbook", { name: "New", server: own.label });
    expect(named.structuredContent).toEqual({ answeredBy: "own", args: { name: "New" } });
  });

  it("passes everything through unchanged with a single server", async () => {
    const { client } = await start({ [own.url]: { apiKey: own.key } });
    const tools = await client.tools();
    expect(tools.some((tool) => "server" in tool.inputSchema.properties)).toBe(false);
    expect(tools.find((tool) => tool.name === "list_playbooks")?.outputSchema).toEqual({ type: "object" });
    const listed = await client.callTool("list_playbooks");
    expect(listed.structuredContent?.playbooks?.[0]).not.toHaveProperty("server");
  });

  it("names the login command when a server refuses the stored key", async () => {
    const { client } = await start({ [own.url]: { apiKey: "apb_live_wrong" } });
    const result = await client.callTool("get_playbook", { playbook_id: "guid-own" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("refused the stored key");
    expect(result.content[0].text).toContain(`login --url=${own.url}`);
    expect(result.content[0].text).not.toContain("apb_live_wrong");
  });

  it("stops using a key as soon as it is logged out", async () => {
    const { client, home } = await start(both());
    expect((await client.callTool("get_playbook", { playbook_id: "guid-own" })).isError).toBeUndefined();
    writeCredentials(home, { [hosted.url]: { apiKey: hosted.key } });
    const after = await client.callTool("get_playbook", { playbook_id: "guid-own" });
    expect(after.isError).toBe(true);
    expect(after.content[0].text).toContain("No key is stored");
  });

  it("says how to connect a server when none is logged in", async () => {
    const { client, instructions } = await start({});
    expect(instructions).toContain("login --url=<server>");
    expect(await client.tools()).toEqual([]);
  });
});
