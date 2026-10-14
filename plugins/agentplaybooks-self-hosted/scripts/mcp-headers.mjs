#!/usr/bin/env node
/**
 * Claude Code runs this as the MCP server's `headersHelper`: it prints the
 * headers for one connection as a JSON object on stdout, and Claude Code runs
 * it again for every new connection.
 *
 * The key comes from the credential file the AgentPlaybooks CLI writes on
 * `login --url=<server>`, so it is never copied into Claude Code's settings or
 * the environment, and `logout` takes effect on the next connection.
 *
 * Claude Code passes the server's URL in CLAUDE_CODE_MCP_SERVER_URL. A key is
 * sent only to the server it was stored for — matched on scheme, host, and
 * port — because another port on the same host is another service. With no
 * key for that server the helper prints `{}` and says on stderr how to store
 * one, so the connection fails as unauthenticated rather than with a key meant
 * for somewhere else.
 */
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const LOGIN = "npx --yes @agentplaybooks/cli@0.6.0 login";

/** `https://Host:443/x/` and `https://host/x` are the same server; compare them as one. */
function normalizeBaseUrl(value) {
  const url = new URL(value);
  return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, "")}`;
}

/** `https://host/api/mcp/manage` → `https://host`, the form `login --url` stores. */
function baseUrlOf(serverUrl) {
  const url = new URL(serverUrl);
  return normalizeBaseUrl(`${url.origin}${url.pathname.replace(/\/api\/mcp(?:\/.*)?$/, "")}`);
}

async function readCredentials() {
  const file = path.join(os.homedir(), ".agentplaybooks", "credentials.json");
  let text;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw new Error(`Cannot read ${file}: ${error?.code ?? "unknown error"}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    // The parser's message quotes the text around the error, and the text is
    // a file of keys. Name the file, not its contents.
    throw new Error(`${file} is not valid JSON.`);
  }
}

function findApiKey(credentials, baseUrl) {
  for (const [remote, entry] of Object.entries(credentials?.remotes ?? {})) {
    let remoteBase;
    try {
      remoteBase = normalizeBaseUrl(remote);
    } catch {
      continue;
    }
    if (remoteBase === baseUrl && typeof entry?.apiKey === "string" && entry.apiKey) return entry.apiKey;
  }
  return null;
}

async function main() {
  const serverUrl = process.env.CLAUDE_CODE_MCP_SERVER_URL;
  if (!serverUrl) {
    throw new Error("CLAUDE_CODE_MCP_SERVER_URL is not set. Claude Code sets it when it runs this as an MCP headersHelper.");
  }
  let baseUrl;
  try {
    baseUrl = baseUrlOf(serverUrl);
  } catch {
    throw new Error(`"${serverUrl}" is not a URL. Set the plugin's Server URL option to your AgentPlaybooks server, such as https://playbooks.example.org.`);
  }

  const apiKey = findApiKey(await readCredentials(), baseUrl);
  if (!apiKey) {
    process.stderr.write(`No AgentPlaybooks key is stored for ${baseUrl}. Store one with: ${LOGIN} --url=${baseUrl}\n`);
    process.stdout.write("{}\n");
    return;
  }
  process.stdout.write(`${JSON.stringify({ "X-API-Key": apiKey })}\n`);
}

// A missing key is an ordinary state (not logged in yet) and yields `{}`; a URL
// or credential file that cannot be used is a misconfiguration, and fails.
main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
