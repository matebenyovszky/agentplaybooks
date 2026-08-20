import { readFile } from "node:fs/promises";
import path from "node:path";
import { applyAdapters, planHermesMcpServerAction, planMcpServerAction } from "./adapters.js";
import { resolveBaseUrl } from "./remote.js";

/**
 * Wire a hosted playbook into a local agent tool as an MCP server.
 *
 * `sync` pushes the playbook's *contents* — instructions, skills, the MCP
 * servers it federates — into the files a tool reads. This does the other
 * direction of the same relationship: it points the tool at the playbook's own
 * endpoint, so the agent reaches memory, skills, and every federated tool
 * through one connection instead of a local copy.
 *
 * The key is never written. The config carries `${ENV_VAR}`, expanded by the
 * agent tool at launch from the environment, which is the same guarantee the
 * secrets commands make: a plaintext credential does not touch the disk. The
 * cost is that the variable has to exist in the tool's *process* — a variable
 * set after the tool started is invisible to it, which looks exactly like a
 * rejected key from the inside.
 */

const GUID_PATTERN = /^[0-9a-f]{8,}$/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_ENV_NAME = /^[A-Z_][A-Z0-9_]*$/;

/**
 * Which header carries the key.
 *
 * `X-API-Key` is the default rather than `Authorization`, because a client may
 * reserve `Authorization` for its own authentication handling and drop or
 * override what we put there. When that happens nothing reports an error: the
 * connection establishes, every listing is empty, and refreshing it fails. The
 * server accepts both, so the one less likely to be intercepted is the better
 * default.
 */
export const DEFAULT_KEY_HEADER = "X-API-Key";

export function playbookEndpoint(playbook, baseUrl) {
  return `${baseUrl}/api/mcp/${playbook}`;
}

/** `apbks-dev` → `APBKS_KEY_APBKS_DEV`, so the variable names itself after the entry. */
export function defaultKeyEnvVar(entryName) {
  return `APBKS_KEY_${entryName.replace(/[^A-Za-z0-9]+/g, "_").toUpperCase()}`;
}

/**
 * Each target gets what its own schema accepts, rather than one definition
 * pushed everywhere. Claude Code's `.mcp.json` wants an explicit
 * `"type": "http"`; Hermes' `config.yaml` accepts command/args/env/url/headers
 * and refuses anything else, so sending `type` there would have the entry
 * rejected as unrepresentable — correctly, but for a key we added ourselves.
 */
const TARGETS_WITHOUT_TYPE = new Set(["hermes"]);

export function serverDefinition({ url, keyEnvVar, keyHeader = DEFAULT_KEY_HEADER, target = "claude" }) {
  const headers = { [keyHeader]: `\${${keyEnvVar}}` };
  return TARGETS_WITHOUT_TYPE.has(target)
    ? { url, headers }
    : { type: "http", url, headers };
}

async function readIfPresent(absolutePath) {
  try {
    return await readFile(absolutePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw new Error(`Cannot read ${absolutePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function planConnect(root, options = {}) {
  const playbook = options.playbook?.trim();
  if (!playbook) {
    throw new Error("Which playbook? Pass its GUID, e.g. `agentplaybooks connect 011d8a7fa0ec4016`.");
  }
  if (!GUID_PATTERN.test(playbook) && !UUID_PATTERN.test(playbook)) {
    throw new Error(`"${playbook}" is not a playbook GUID. Copy it from the playbook's MCP endpoint URL.`);
  }

  const targets = options.targets?.length ? options.targets : ["claude"];
  const baseUrl = resolveBaseUrl(options.url, options.env ?? process.env);
  const url = playbookEndpoint(playbook, baseUrl);
  const entryName = options.name?.trim() || "agentplaybooks";
  const keyEnvVar = options.keyEnvVar?.trim() || defaultKeyEnvVar(entryName);
  if (!SAFE_ENV_NAME.test(keyEnvVar)) {
    throw new Error(`"${keyEnvVar}" is not a usable environment variable name.`);
  }
  const keyHeader = options.keyHeader?.trim() || DEFAULT_KEY_HEADER;

  const conflicts = [];
  const fileActions = [];

  for (const target of targets) {
    const definition = serverDefinition({ url, keyEnvVar, keyHeader, target });

    // Hermes keeps its MCP servers in the profile config, not in the project.
    if (target === "hermes") {
      const action = await planHermesMcpServerAction({
        name: entryName,
        definition,
        conflicts,
        env: options.env,
        homedir: options.homedir,
        platform: options.platform,
      });
      if (action) fileActions.push(action);
      continue;
    }

    const probe = planMcpServerAction({ root, target, name: entryName, definition, conflicts: [] });
    if (!probe) {
      planMcpServerAction({ root, target, name: entryName, definition, conflicts });
      continue;
    }
    const existingContent = await readIfPresent(probe.absolutePath);
    const action = planMcpServerAction({ root, target, name: entryName, definition, existingContent, conflicts });
    if (action) fileActions.push(action);
  }

  return {
    root,
    playbook,
    url,
    entryName,
    keyEnvVar,
    keyHeader,
    targets,
    fileActions,
    conflicts,
    // A variable the planning process cannot see is one the agent tool probably
    // cannot see either — worth saying out loud rather than discovering later
    // through an empty tool list.
    keyPresentInEnvironment: Boolean((options.env ?? process.env)[keyEnvVar]),
    changed: fileActions.length > 0,
  };
}

export async function applyConnect(plan) {
  if (!plan.changed) return { applied: false, written: [], backups: [] };
  const backupDirectory = path.join(plan.root, ".agentplaybooks", "backups", `connect-${Date.now()}`);
  const { written, backups } = await applyAdapters(plan.fileActions, backupDirectory);
  return { applied: true, written, backups };
}

export function printConnectPlan(plan, log = console.log) {
  log(`Playbook endpoint: ${plan.url}`);
  log(`Config entry:      ${plan.entryName}`);
  log(`Credential:        ${plan.keyHeader}: \${${plan.keyEnvVar}} (read from the environment, never written)`);

  if (plan.fileActions.length === 0) {
    log("\nNothing to write.");
  } else {
    log("");
    for (const action of plan.fileActions) {
      log(`${action.action === "create" ? "create" : "merge "} ${action.path}  (${action.target})`);
    }
  }

  if (!plan.keyPresentInEnvironment) {
    log(`\n${plan.keyEnvVar} is not set in this shell. Set it before starting the agent tool —`);
    log("a variable set afterwards is invisible to a process already running, which");
    log("looks the same from the inside as a rejected key: no tools, refresh fails.");
  }

  log("\nIf a client does not expand ${VAR} in headers, it sends the placeholder");
  log("verbatim. The endpoint reports that specifically, so a 403 will say the");
  log("reference was not expanded rather than blaming a permission.");

  for (const item of plan.conflicts) {
    log(`\nconflict (${item.target}): ${item.reason}`);
  }
}
