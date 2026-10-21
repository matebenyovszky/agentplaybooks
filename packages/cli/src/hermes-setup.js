import { access, readFile, stat, lstat } from "node:fs/promises";
import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { hermesProfile } from "./discovery.js";
import { planConnect } from "./connect.js";
import { applyAdapters } from "./adapters.js";
import { planPull, resolveApiKey, resolveBaseUrl } from "./remote.js";
import { assertSafeDestination } from "./snapshot.js";

const execute = promisify(execFile);
const digest = value => value === null ? null : createHash("sha256").update(value).digest("hex");
async function readOptional(file) {
  try { return await readFile(file); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

export async function writableDestination(destination) {
  let candidate = destination;
  for (;;) {
    try {
      const info = await stat(candidate);
      await access(candidate, constants.W_OK | (info.isDirectory() ? constants.X_OK : 0));
      // Replacing a file atomically also requires a writable parent.
      if (!info.isDirectory()) await access(path.dirname(candidate), constants.W_OK | constants.X_OK);
      return true;
    } catch (error) {
      if (error.code !== "ENOENT") return false;
      const parent = path.dirname(candidate);
      if (parent === candidate) return false;
      candidate = parent;
    }
  }
}

function serviceUrl(options) {
  const base = resolveBaseUrl(options.url, options.env ?? process.env);
  const url = new URL(base);
  if (url.username || url.password || url.search || url.hash || !["https:", "http:"].includes(url.protocol) ||
      (url.protocol === "http:" && !options.allowInsecureHttp && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) {
    throw new Error("Use HTTPS, localhost HTTP, or explicitly --allow-insecure-http for an intranet instance.");
  }
  return base;
}

export async function inspectHermes(root, options = {}) {
  const env = options.env ?? process.env;
  const profile = await hermesProfile(options);
  let hermesInstalled = false;
  try {
    await (options.execute ?? execute)(options.hermesBin ?? "hermes", ["--version"], {
      env: { ...env, HERMES_HOME: profile.directory }, timeout: 5000, maxBuffer: 8192,
    });
    hermesInstalled = true;
  } catch { /* Report the missing runtime without exposing process output. */ }
  const keyEnvVar = options.keyEnvVar ?? "APBKS_KEY_AGENTPLAYBOOKS";
  if (!/^[A-Z_][A-Z0-9_]*$/.test(keyEnvVar)) throw new Error("Invalid key environment variable name.");
  // Names only: a value in this file is not proof that a running gateway loaded it.
  const profileEnv = (await readOptional(path.join(profile.directory, ".env")))?.toString() ?? "";
  const declared = profileEnv.split(/\r?\n/).some(line => new RegExp(`^\\s*(?:export\\s+)?${keyEnvVar}\\s*=`).test(line));
  return {
    host: os.hostname(), profile: profile.directory, nodeSupported: Number(process.versions.node.split(".")[0]) >= 20,
    hermesInstalled, profileWritable: await (options.writable ?? writableDestination)(path.join(profile.directory, "config.yaml")),
    projectWritable: await (options.writable ?? writableDestination)(root),
    keyEnvVar, keyInProcess: Boolean(env[keyEnvVar]), keyDeclaredInProfile: declared,
    runtimeHint: "Run on the gateway host/container that owns this profile. Restart the gateway after changing its secret environment.",
  };
}

export async function planHermesSetup(root, options = {}) {
  root = path.resolve(root);
  const url = serviceUrl(options);
  const diagnostics = await inspectHermes(root, options);
  const connect = await planConnect(root, { ...options, url, targets: ["hermes"], externalDir: path.join(root, ".agents", "skills") });
  const conflicts = [...connect.conflicts];
  const fileActions = [...connect.fileActions];
  for (const [ok, name, reason] of [
    [diagnostics.nodeSupported, "node", "Node.js 20 or later is required."],
    [diagnostics.hermesInstalled, "hermes", "Hermes is unavailable on this host; run setup in the gateway host/container."],
    [diagnostics.profileWritable, "profile", `Hermes profile is not writable: ${diagnostics.profile}. Fix its service-user ownership on the gateway.`],
    [diagnostics.projectWritable, "project", `Project is not writable: ${root}.`],
  ]) if (!ok) conflicts.push({ name, reason });

  if (!options.toolsOnly) {
    const apiKey = options.apiKey ?? await resolveApiKey(url, options);
    if (!apiKey) {
      conflicts.push({ name: "login", reason: "Run apb login for skill download, or use --tools-only to connect hosted tools without restoring local files." });
    } else {
      const pull = await planPull(root, options.playbook, { url, apiKey, fetchImpl: options.fetchImpl, skillsOnly: true });
      conflicts.push(...pull.conflicts);
      for (const action of pull.actions) fileActions.push({ ...action, expectedHash: null, restore: true, absolutePath: await assertSafeDestination(root, action.path) });
      fileActions.push({ name: "remote link", path: ".agentplaybooks/remote.json", absolutePath: path.join(root, ".agentplaybooks/remote.json"),
        content: JSON.stringify({ url, playbookId: pull.playbook.id, guid: pull.playbook.guid, name: pull.playbook.name }, null, 2) + "\n" });
    }
  }
  const changed = [];
  for (const action of fileActions) {
    const old = await readOptional(action.absolutePath);
    const content = Buffer.isBuffer(action.content) ? action.content : Buffer.from(action.content);
    if ("expectedHash" in action && action.expectedHash !== digest(old)) {
      conflicts.push({ name: action.path, reason: "Destination changed while preparing setup; retry the preview." });
      continue;
    }
    if (old?.equals(content)) continue;
    changed.push({ ...action, action: old === null ? "create" : "merge", expectedHash: digest(old) });
    if (!await (options.writable ?? writableDestination)(action.absolutePath)) conflicts.push({ name: action.path, reason: "Destination is not writable." });
  }
  return { root, url, diagnostics, fileActions: changed, conflicts, entries: connect.entries, keyEnvVar: connect.keyEnvVar,
    changed: changed.length > 0, toolsOnly: Boolean(options.toolsOnly) };
}

export function publicHermesSetup(plan) {
  return { ...plan, fileActions: plan.fileActions.map(({ content: _content, ...action }) => action) };
}

export async function applyHermesSetup(plan) {
  if (plan.conflicts.length) throw new Error("Resolve setup conflicts before applying; no files were written.");
  for (const action of plan.fileActions) {
    if (action.restore) await assertSafeDestination(plan.root, action.path);
    if (action.path === ".agentplaybooks/remote.json") {
      for (const target of [path.join(plan.root, ".agentplaybooks"), action.absolutePath]) {
        const info = await lstat(target).catch(error => { if (error.code !== "ENOENT") throw error; });
        if (info?.isSymbolicLink()) throw new Error("Remote link destination is a symlink.");
      }
    }
    if (digest(await readOptional(action.absolutePath)) !== action.expectedHash) throw new Error(`Setup target changed after preview: ${action.path}.`);
    if (!await writableDestination(action.absolutePath)) throw new Error(`Setup destination is no longer writable: ${action.path}.`);
  }
  return applyAdapters(plan.fileActions, path.join(plan.diagnostics.profile, ".agentplaybooks", "backups", `setup-${Date.now()}`));
}

// Probe only the MCP handshake and tool listing. Never invoke a remote tool or
// echo response bodies/headers, which may include a credential in an error.
export async function checkHermesTools(endpoint, options = {}) {
  serviceUrl({ ...options, url: endpoint.replace(/\/api\/mcp\/[^/]+$/, "") });
  const keyEnvVar = options.keyEnvVar ?? "APBKS_KEY_AGENTPLAYBOOKS";
  const key = (options.env ?? process.env)[keyEnvVar];
  if (!key) return { ok: false, status: "missing-key-in-process", keyEnvVar };
  const headers = { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "X-API-Key": key };
  let id = 0;
  const call = async (method, params, notification = false) => {
    const response = await (options.fetchImpl ?? fetch)(endpoint, { method: "POST", headers, redirect: "error", signal: AbortSignal.timeout(5000),
      body: JSON.stringify({ jsonrpc: "2.0", ...(!notification ? { id: ++id } : {}), method, ...(params ? { params } : {}) }) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const session = response.headers.get("mcp-session-id");
    if (session) headers["Mcp-Session-Id"] = session;
    if (notification) { await response.body?.cancel(); return null; }
    const text = await response.text();
    let message;
    if (response.headers.get("content-type")?.includes("text/event-stream")) {
      message = text.split(/\r?\n\r?\n/).map(event => event.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trim()).join("\n"))
        .filter(Boolean).map(value => JSON.parse(value)).find(value => value.id === id);
    } else message = JSON.parse(text);
    if (!message || message.error || !message.result) throw new Error("MCP rejected request");
    return message.result;
  };
  try {
    const init = await call("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "agentplaybooks-check", version: "1" } });
    headers["MCP-Protocol-Version"] = init.protocolVersion ?? "2025-03-26";
    await call("notifications/initialized", undefined, true);
    const result = await call("tools/list");
    if (!Array.isArray(result.tools)) throw new Error("Invalid tools list");
    return { ok: true, status: "connected", toolCount: result.tools.length, moreTools: Boolean(result.nextCursor) };
  } catch (error) {
    return { ok: false, status: /^HTTP \d{3}$/.test(error.message) ? error.message : "connection-or-protocol-error" };
  }
}

export function printHermesSetup(plan, log = console.log) {
  const d = plan.diagnostics;
  log(`Hermes setup on ${d.host}: ${d.profile}`);
  log(d.runtimeHint);
  log(`Credential: ${plan.keyEnvVar}; available in this process: ${d.keyInProcess ? "yes" : "no"}; declared in profile .env: ${d.keyDeclaredInProfile ? "yes" : "no"}.`);
  log(plan.toolsOnly ? "Connect hosted tools; register the local skill directory." : "Restore complete skill trees and connect hosted tools; register the restored skill directory.");
  for (const action of plan.fileActions) log(`  ${action.action} ${action.absolutePath}`);
  for (const item of plan.conflicts) log(`  [conflict] ${item.name}: ${item.reason}`);
  if (!d.keyInProcess) log(`Configure a playbook-scoped key as ${plan.keyEnvVar} in the profile secret environment; never paste it into chat. Run 'apb hermes doctor <guid> --check' in that environment to verify tools.`);
}
