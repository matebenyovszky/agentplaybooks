#!/usr/bin/env node
/**
 * Every AgentPlaybooks server you have logged in to, as one MCP server.
 *
 * The plugin's `agentplaybooks-account` connector reaches agentplaybooks.ai,
 * and its address is fixed: claude.ai chat skips a connector whose URL comes
 * from a plugin option, and a plugin's server list cannot grow with the user's
 * servers. This one runs locally, in Claude Code (and in Cowork on your
 * machine), so it can reach a server inside a private network and serve any
 * number of them. The servers are the ones the AgentPlaybooks CLI holds a user
 * key for — `login --url=<server>` adds one, `logout` removes it — read from
 * `~/.agentplaybooks/credentials.json`. Keys never leave this process except
 * as the `X-API-Key` header to the server they were stored for.
 *
 * Every server runs the same product, so the tools are the same everywhere;
 * what differs is where a call goes:
 *
 * - With one server, everything passes through unchanged.
 * - With several, each tool gains an optional `server` argument.
 *   `list_playbooks` asks every server and marks each playbook with its
 *   server; a tool with a `playbook_id` goes to the server that has that
 *   playbook; `create_playbook` needs `server` to be named.
 *
 * A key is sent only over HTTPS, or over HTTP to this machine. A plain-HTTP
 * address on the network is skipped and named in the server's instructions,
 * because the key would cross the network readable.
 */
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

const VERSION = "0.9.0";
const LOGIN = "npx --yes @agentplaybooks/cli@0.9.0 login";
const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const UPSTREAM_PROTOCOL = "2025-06-18";
const LIST_TIMEOUT_MS = 15_000;
// use_secret may wait up to 60 s for the API it calls; leave it room.
const CALL_TIMEOUT_MS = 90_000;
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

const credentialsFile = path.join(os.homedir(), ".agentplaybooks", "credentials.json");

function readCredentials() {
  let text;
  try {
    text = readFileSync(credentialsFile, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return { remotes: {} };
    throw new Error(`Cannot read ${credentialsFile}: ${error?.code ?? "unknown error"}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    // The parser's message quotes the text around the error, and the text is
    // a file of keys. Name the file, not its contents.
    throw new Error(`${credentialsFile} is not valid JSON.`);
  }
}

function normalizeBaseUrl(value) {
  const url = new URL(value);
  return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, "")}`;
}

/** `https://pdapp.example.org:8443` → `pdapp.example.org:8443`: short enough to type, unique per server. */
function labelOf(baseUrl) {
  const url = new URL(baseUrl);
  return `${url.host}${url.pathname.replace(/\/+$/, "")}`;
}

/** The servers to serve, decided once at startup; a new login shows up on reconnect. */
function discoverServers(credentials) {
  const servers = [];
  const skipped = [];
  for (const [remote, entry] of Object.entries(credentials?.remotes ?? {})) {
    if (typeof entry?.apiKey !== "string" || !entry.apiKey) continue;
    let baseUrl;
    try {
      baseUrl = normalizeBaseUrl(remote);
    } catch {
      continue;
    }
    const { protocol, hostname } = new URL(baseUrl);
    if (protocol !== "https:" && !(protocol === "http:" && LOOPBACK.has(hostname))) {
      skipped.push(baseUrl);
      continue;
    }
    if (servers.some((server) => server.baseUrl === baseUrl)) continue;
    servers.push({ baseUrl, label: labelOf(baseUrl), endpoint: `${baseUrl}/api/mcp/manage`, session: undefined, tools: null });
  }
  return { servers, skipped };
}

/** Read per request, so `logout` or a rotated key takes effect on the next call. */
function currentKey(server) {
  for (const [remote, entry] of Object.entries(readCredentials().remotes ?? {})) {
    try {
      if (normalizeBaseUrl(remote) === server.baseUrl && entry?.apiKey) return entry.apiKey;
    } catch {
      // not a URL
    }
  }
  return null;
}

class UpstreamError extends Error {}

function describeFetchFailure(server, error) {
  const code = error?.cause?.code ?? error?.code ?? "";
  if (/CERT|SELF_SIGNED|UNABLE_TO_VERIFY/.test(code)) {
    return `${server.label}: its TLS certificate is not trusted (${code}). If the server uses a private CA, set NODE_EXTRA_CA_CERTS to that CA's file in the "env" block of ~/.claude/settings.json and reconnect.`;
  }
  if (error?.name === "TimeoutError") return `${server.label} did not answer in time.`;
  return `${server.label} could not be reached (${code || (error instanceof Error ? error.message : String(error))}).`;
}

let nextUpstreamId = 1;

async function post(server, message, timeoutMs) {
  const apiKey = currentKey(server);
  if (!apiKey) {
    throw new UpstreamError(`No key is stored for ${server.baseUrl} any more. Store one with: ${LOGIN} --url=${server.baseUrl}`);
  }
  const headers = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": UPSTREAM_PROTOCOL,
    "x-api-key": apiKey,
  };
  if (server.session) headers["mcp-session-id"] = server.session;
  let response;
  try {
    response = await fetch(server.endpoint, {
      method: "POST",
      // A redirect must never carry this server's stored X-API-Key elsewhere.
      redirect: "error",
      headers,
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new UpstreamError(describeFetchFailure(server, error));
  }
  if (response.status === 401 || response.status === 403) {
    throw new UpstreamError(`${server.label} refused the stored key (HTTP ${response.status}). Store a valid one with: ${LOGIN} --url=${server.baseUrl}`);
  }
  if (response.status === 404 && server.session) {
    // The server forgot the session; the caller starts a new one.
    server.session = undefined;
    throw new UpstreamError("session expired");
  }
  const session = response.headers.get("mcp-session-id");
  if (session) server.session = session;
  if (message.id === undefined) return null;
  const text = await response.text();
  if (!response.ok) throw new UpstreamError(`${server.label} answered HTTP ${response.status}.`);
  const body = (response.headers.get("content-type") ?? "").includes("text/event-stream")
    ? text.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim())
      .map((data) => JSON.parse(data)).find((reply) => reply.id === message.id)
    : JSON.parse(text);
  if (!body) throw new UpstreamError(`${server.label} sent no reply.`);
  if (body.error) throw new UpstreamError(`${server.label}: ${body.error.message ?? "error"}`);
  return body.result;
}

const initialized = new WeakMap();

function ensureInitialized(server) {
  if (!initialized.has(server)) {
    const ready = (async () => {
      await post(server, {
        jsonrpc: "2.0",
        id: nextUpstreamId++,
        method: "initialize",
        params: { protocolVersion: UPSTREAM_PROTOCOL, capabilities: {}, clientInfo: { name: "agentplaybooks-servers", version: VERSION } },
      }, LIST_TIMEOUT_MS);
      await post(server, { jsonrpc: "2.0", method: "notifications/initialized" }, LIST_TIMEOUT_MS);
    })();
    ready.catch(() => initialized.delete(server));
    initialized.set(server, ready);
  }
  return initialized.get(server);
}

async function request(server, method, params, timeoutMs) {
  for (let attempt = 0; ; attempt += 1) {
    await ensureInitialized(server);
    try {
      return await post(server, { jsonrpc: "2.0", id: nextUpstreamId++, method, params }, timeoutMs);
    } catch (error) {
      if (attempt === 0 && error instanceof UpstreamError && error.message === "session expired") {
        initialized.delete(server);
        continue;
      }
      throw error;
    }
  }
}

// --- routing ---------------------------------------------------------------

const { servers, skipped } = (() => {
  try {
    return discoverServers(readCredentials());
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return { servers: [], skipped: [] };
  }
})();
const multiple = servers.length > 1;
const playbookServers = new Map();

function resolveServer(name) {
  const wanted = String(name).trim().replace(/\/+$/, "");
  return servers.find((server) => server.label === wanted || server.baseUrl === wanted)
    ?? servers.find((server) => new URL(server.baseUrl).hostname === wanted)
    ?? null;
}

function serverChoice() {
  return servers.map((server) => server.label).join(", ");
}

function playbooksOf(result) {
  if (Array.isArray(result?.structuredContent?.playbooks)) return result.structuredContent.playbooks;
  try {
    const parsed = JSON.parse(result?.content?.find((part) => part.type === "text")?.text ?? "");
    return Array.isArray(parsed?.playbooks) ? parsed.playbooks : [];
  } catch {
    return [];
  }
}

function remember(server, playbook) {
  for (const key of [playbook?.id, playbook?.guid]) {
    if (!key) continue;
    const known = playbookServers.get(key) ?? new Set();
    known.add(server);
    playbookServers.set(key, known);
  }
}

async function listEverywhere() {
  const results = await Promise.all(servers.map(async (server) => {
    try {
      const result = await request(server, "tools/call", { name: "list_playbooks", arguments: {} }, LIST_TIMEOUT_MS);
      if (result?.isError) return { server, error: result.content?.find((part) => part.type === "text")?.text ?? "error" };
      return { server, playbooks: playbooksOf(result) };
    } catch (error) {
      return { server, error: error instanceof Error ? error.message : String(error) };
    }
  }));
  const playbooks = [];
  const unreachable = [];
  for (const { server, playbooks: found, error } of results) {
    if (error) {
      unreachable.push({ server: server.label, error });
      continue;
    }
    for (const playbook of found) {
      remember(server, playbook);
      playbooks.push({ ...playbook, server: server.label });
    }
  }
  return { playbooks, ...(unreachable.length ? { unreachable } : {}) };
}

async function locate(playbookId) {
  if (!playbookServers.has(playbookId)) await listEverywhere();
  const found = [...(playbookServers.get(playbookId) ?? [])];
  if (found.length === 1) return found[0];
  if (found.length > 1) {
    throw new UpstreamError(`Playbook ${playbookId} exists on more than one server (${found.map((s) => s.label).join(", ")}). Pass server to choose.`);
  }
  throw new UpstreamError(`None of the connected servers lists playbook ${playbookId}. Pass server to send the call anyway; servers: ${serverChoice()}.`);
}

function toolError(message) {
  return { content: [{ type: "text", text: message }], isError: true };
}

async function listTools() {
  if (servers.length === 0) return [];
  const lists = await Promise.all(servers.map(async (server) => {
    try {
      server.tools = (await request(server, "tools/list", {}, LIST_TIMEOUT_MS))?.tools ?? [];
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      server.tools = null;
    }
    return server.tools;
  }));
  if (lists.every((list) => list === null)) {
    throw new Error(`No AgentPlaybooks server answered: ${serverChoice()}. See the plugin's log for why.`);
  }
  const byName = new Map();
  for (const list of lists) for (const tool of list ?? []) if (!byName.has(tool.name)) byName.set(tool.name, tool);
  if (!multiple) return [...byName.values()];
  return [...byName.values()].map((tool) => {
    const schema = tool.inputSchema ?? { type: "object", properties: {} };
    const decorated = {
      ...tool,
      inputSchema: {
        ...schema,
        properties: {
          ...(schema.properties ?? {}),
          server: {
            type: "string",
            description: `Which AgentPlaybooks server: ${serverChoice()}. ${
              tool.name === "create_playbook" ? "Required." : "Optional when playbook_id identifies the server."}`,
          },
        },
      },
    };
    // list_playbooks gains a `server` field on every playbook, which the
    // server's own output schema does not declare.
    if (tool.name === "list_playbooks") delete decorated.outputSchema;
    return decorated;
  });
}

async function callTool(params) {
  const name = params?.name;
  if (servers.length === 0) return toolError(instructions());

  const { server: requested, ...args } = params?.arguments ?? {};
  try {
    if (!multiple) return await request(servers[0], "tools/call", params, CALL_TIMEOUT_MS);
    if (name === "list_playbooks" && !requested) {
      const merged = await listEverywhere();
      return { content: [{ type: "text", text: JSON.stringify(merged) }], structuredContent: merged };
    }
    let target;
    if (requested) {
      target = resolveServer(requested);
      if (!target) return toolError(`"${requested}" is not a connected server. Servers: ${serverChoice()}.`);
    } else if (typeof args.playbook_id === "string" && args.playbook_id) {
      target = await locate(args.playbook_id);
    } else {
      return toolError(`${name} needs a server: pass server as one of ${serverChoice()}.`);
    }
    const result = await request(target, "tools/call", { ...params, arguments: args }, CALL_TIMEOUT_MS);
    if (name === "list_playbooks") {
      const playbooks = playbooksOf(result);
      for (const playbook of playbooks) remember(target, playbook);
      const marked = { playbooks: playbooks.map((playbook) => ({ ...playbook, server: target.label })) };
      return { content: [{ type: "text", text: JSON.stringify(marked) }], structuredContent: marked };
    }
    if (name === "create_playbook" && result?.structuredContent) remember(target, result.structuredContent.playbook ?? result.structuredContent);
    return result;
  } catch (error) {
    if (error instanceof UpstreamError) return toolError(error.message);
    throw error;
  }
}

function instructions() {
  const lines = [];
  if (servers.length === 0) {
    lines.push(`No AgentPlaybooks server is connected here yet. Store a user API key with \`${LOGIN} --url=<server>\` in a terminal, then reconnect this server from /mcp.`);
  } else {
    lines.push(`AgentPlaybooks servers logged in with the AgentPlaybooks CLI: ${serverChoice()}.`);
    if (multiple) {
      lines.push("list_playbooks covers every server and marks each playbook's server. Tools with a playbook_id go to the server that has that playbook; create_playbook needs server.");
    }
    lines.push("Playbook tools require playbook_id. Use list_secrets then use_secret or use_secret_write for server-side credential injection without revealing secret values.");
  }
  if (skipped.length) {
    lines.push(`Not served, because a key would cross the network unencrypted over plain HTTP: ${skipped.join(", ")}. Log in to the server's HTTPS address instead.`);
  }
  return lines.join(" ");
}

// --- stdio transport -------------------------------------------------------

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

async function handle(message) {
  const { id, method, params } = message;
  if (id === undefined || id === null) return; // notifications: nothing to answer
  try {
    switch (method) {
      case "initialize": {
        const requested = params?.protocolVersion;
        send({
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0],
            capabilities: { tools: {} },
            serverInfo: { name: "agentplaybooks-servers", title: "AgentPlaybooks servers", version: VERSION },
            instructions: instructions(),
          },
        });
        return;
      }
      case "ping":
        send({ jsonrpc: "2.0", id, result: {} });
        return;
      case "tools/list":
        send({ jsonrpc: "2.0", id, result: { tools: await listTools() } });
        return;
      case "tools/call":
        send({ jsonrpc: "2.0", id, result: await callTool(params) });
        return;
      default:
        send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } });
    }
  } catch (error) {
    send({ jsonrpc: "2.0", id, error: { code: -32603, message: error instanceof Error ? error.message : String(error) } });
  }
}

const lines = readline.createInterface({ input: process.stdin });
lines.on("line", (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    return;
  }
  void handle(message);
});
