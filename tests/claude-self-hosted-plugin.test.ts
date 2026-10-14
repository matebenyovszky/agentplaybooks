/**
 * The self-hosted Claude plugin is the hosted one with a different connection:
 * a configurable server URL, and a key read from the CLI's credential file by a
 * `headersHelper`. Everything else — the skills and commands that tell Claude
 * how to work with playbooks — is a copy, and a copy that drifts gives Claude
 * two sets of instructions for one product. So the shared files must stay
 * byte-identical, and the helper is tested as Claude Code runs it: a separate
 * process, configured through the environment, answering on stdout.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const hosted = path.join(repoRoot, "plugins/agentplaybooks");
const selfHosted = path.join(repoRoot, "plugins/agentplaybooks-self-hosted");
const helper = path.join(selfHosted, "scripts/mcp-headers.mjs");

const SHARED_FILES = [
  "skills/playbooks/SKILL.md",
  "skills/agentplaybooks-cli/SKILL.md",
  "commands/doctor.md",
  "commands/sync.md",
  "LICENSE",
];

function readJson(file: string) {
  return JSON.parse(readFileSync(file, "utf8"));
}

describe("self-hosted Claude plugin", () => {
  it("shares its skills and commands with the hosted plugin, unchanged", () => {
    for (const file of SHARED_FILES) {
      expect(readFileSync(path.join(selfHosted, file), "utf8"), file)
        .toBe(readFileSync(path.join(hosted, file), "utf8"));
    }
  });

  it("connects to the configured server and authenticates through the helper", () => {
    const manifest = readJson(path.join(selfHosted, ".claude-plugin/plugin.json"));
    expect(manifest.version).toBe(readJson(path.join(hosted, ".claude-plugin/plugin.json")).version);
    expect(manifest.userConfig.server_url).toMatchObject({ type: "string", required: true });

    const server = manifest.mcpServers["agentplaybooks-account"];
    expect(server.url).toBe("${user_config.server_url}/api/mcp/manage");
    // A static key header would be a second credential, one `logout` does not remove.
    expect(server.headers).toBeUndefined();
    expect(server.headersHelper).toBe('node "${CLAUDE_PLUGIN_ROOT}/scripts/mcp-headers.mjs"');
  });

  it("is listed in the repository marketplace at the hosted plugin's version", () => {
    const marketplace = readJson(path.join(repoRoot, ".claude-plugin/marketplace.json"));
    const listed = marketplace.plugins.find((plugin: { name: string }) => plugin.name === "agentplaybooks-self-hosted");
    expect(listed?.source).toBe("./plugins/agentplaybooks-self-hosted");
    expect(listed?.version).toBe(readJson(path.join(selfHosted, ".claude-plugin/plugin.json")).version);
  });
});

describe("self-hosted plugin headers helper", () => {
  const homes: string[] = [];
  afterEach(() => {
    for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
  });

  function home(credentials?: unknown | string) {
    const directory = mkdtempSync(path.join(os.tmpdir(), "apb-headers-"));
    homes.push(directory);
    if (credentials !== undefined) {
      mkdirSync(path.join(directory, ".agentplaybooks"));
      writeFileSync(
        path.join(directory, ".agentplaybooks", "credentials.json"),
        typeof credentials === "string" ? credentials : JSON.stringify(credentials),
      );
    }
    return directory;
  }

  function run(homeDirectory: string, serverUrl?: string) {
    const env: NodeJS.ProcessEnv = { ...process.env, HOME: homeDirectory, USERPROFILE: homeDirectory };
    delete env.CLAUDE_CODE_MCP_SERVER_URL;
    if (serverUrl !== undefined) env.CLAUDE_CODE_MCP_SERVER_URL = serverUrl;
    const result = spawnSync(process.execPath, [helper], { env, encoding: "utf8" });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  }

  it("sends the key stored for that server as X-API-Key", () => {
    const result = run(
      home({ version: 1, remotes: { "https://playbooks.example.org": { apiKey: "apb_live_server" } } }),
      "https://playbooks.example.org/api/mcp/manage",
    );
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ "X-API-Key": "apb_live_server" });
  });

  it("matches a stored URL however it was typed", () => {
    const result = run(
      home({ version: 1, remotes: { "https://Playbooks.Example.org:443/": { apiKey: "apb_live_server" } } }),
      "https://playbooks.example.org/api/mcp/manage",
    );
    expect(JSON.parse(result.stdout)).toEqual({ "X-API-Key": "apb_live_server" });
  });

  it("keeps a server under a path prefix apart from the host's root", () => {
    const credentials = {
      version: 1,
      remotes: {
        "https://example.org": { apiKey: "apb_live_root" },
        "https://example.org/playbooks": { apiKey: "apb_live_prefixed" },
      },
    };
    expect(JSON.parse(run(home(credentials), "https://example.org/playbooks/api/mcp/manage").stdout))
      .toEqual({ "X-API-Key": "apb_live_prefixed" });
  });

  it("does not send a key stored for another port or scheme on the same host", () => {
    const credentials = {
      version: 1,
      remotes: {
        "http://playbooks.example.org:8007": { apiKey: "apb_live_http" },
        "https://playbooks.example.org:8444": { apiKey: "apb_live_other_service" },
      },
    };
    const result = run(home(credentials), "https://playbooks.example.org:8443/api/mcp/manage");
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({});
    expect(result.stderr).toContain("login --url=https://playbooks.example.org:8443");
    expect(result.stderr).not.toContain("apb_live");
  });

  it("sends no key, and says how to store one, before the first login", () => {
    const result = run(home(), "https://playbooks.example.org/api/mcp/manage");
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({});
    expect(result.stderr).toContain("npx --yes @agentplaybooks/cli@");
  });

  it("fails without quoting a credential file it cannot parse", () => {
    const result = run(home('{"remotes": {"https://playbooks.example.org": {"apiKey": "apb_live_secret"'), "https://playbooks.example.org/api/mcp/manage");
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("is not valid JSON");
    expect(result.stderr).not.toContain("apb_live_secret");
  });

  it("fails when the plugin's Server URL option was never set", () => {
    const result = run(home({ version: 1, remotes: {} }), "${user_config.server_url}/api/mcp/manage");
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Server URL");
  });
});
