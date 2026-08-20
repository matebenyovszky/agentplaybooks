import { mkdir, readFile, rename, writeFile, copyFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ADAPTER_TARGET_TYPES, applyAdapters, detectInstalledTargets, planAdapters } from "./adapters.js";
import { runDoctor, runGlobalDoctor } from "./doctor.js";
import { comparableManifest, createManifest } from "./manifest.js";

const MANIFEST_NAME = "agentplaybook.json";

async function readExisting(manifestPath) {
  try {
    return JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw new Error(`Cannot read existing ${MANIFEST_NAME}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function timestampForPath() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function atomicWrite(manifestPath, manifest) {
  const directory = path.dirname(manifestPath);
  // The global manifest lives in `~/.agentplaybooks/`, which may not exist yet.
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const tempPath = path.join(directory, `.${MANIFEST_NAME}.${process.pid}.tmp`);
  await writeFile(tempPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(tempPath, manifestPath);
}

export async function planSync(target, options = {}) {
  const report = await runDoctor(target);
  return planFrom(report, path.join(report.inventory.root, MANIFEST_NAME), options);
}

/**
 * The same plan across the user's home-scoped stores instead of one project:
 * `~/.cursor/skills`, `~/.claude/skills`, the Hermes profile, and the portable
 * `~/.agents/skills` that Hermes is pointed at.
 *
 * Two deliberate differences from a project sync:
 *
 * - **Skills only.** A global MCP config carries credentials — the header a
 *   Cursor server authenticates with is sitting in `~/.cursor/mcp.json` in plain
 *   text. Copying that into two more files would spread the secret rather than
 *   fix it, so global sync reports MCP drift (doctor already does) and leaves
 *   the configs alone.
 * - **The manifest lives in `~/.agentplaybooks/`**, not in the home directory
 *   itself: `~/agentplaybook.json` is not a file anyone asked for.
 */
export async function planGlobalSync(options = {}) {
  const homedir = options.homedir ?? os.homedir();
  const report = await runGlobalDoctor(options);
  const manifestPath = path.join(homedir, ".agentplaybooks", MANIFEST_NAME);
  return planFrom(report, manifestPath, { ...options, homedir, skipMcp: true, scope: "global" });
}

async function planFrom(report, manifestPath, options = {}) {
  const existing = await readExisting(manifestPath);
  const discovered = createManifest(report);
  const manifest = existing?.apiVersion === discovered.apiVersion && existing?.kind === discovered.kind
    ? mergeExisting(discovered, existing)
    : discovered;
  const requested = options.targets ?? [];
  enableRequestedTargets(manifest, requested);
  const manifestChanged = !existing || JSON.stringify(comparableManifest(existing)) !== JSON.stringify(comparableManifest(manifest));
  const adapters = await planAdapters(report, adapterWriteTargets(manifest, requested), options);

  // A project pulled onto a fresh machine holds only the portable store, which
  // is not a deployment target — without a hint, sync would look broken.
  const writableTargets = manifest.spec.targets
    .filter((target) => target.enabled && ADAPTER_TARGET_TYPES.includes(target.type));
  const suggestedTargets = writableTargets.length === 0
    ? (await detectInstalledTargets(options.homedir, options.env, options.platform)).filter(
      (type) => !manifest.spec.targets.some((target) => target.type === type && target.enabled),
    )
    : [];

  return {
    report,
    manifest,
    manifestPath,
    existing,
    manifestChanged,
    changed: manifestChanged || adapters.actions.length > 0,
    action: existing ? (manifestChanged ? "update" : "none") : "create",
    fileActions: adapters.actions,
    conflicts: adapters.conflicts,
    suggestedTargets,
    scope: options.scope ?? "project",
  };
}

/**
 * Newly discovered secret references are added, but an entry the user has
 * edited (a vault ref instead of an env var, `required: false`) always wins:
 * discovery only knows what the config files mention.
 */
function mergeSecrets(discovered, existing) {
  const merged = new Map(discovered.map((secret) => [secret.name, secret]));
  for (const secret of existing ?? []) merged.set(secret.name, secret);
  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function enableRequestedTargets(manifest, requested) {
  for (const type of requested) {
    if (!ADAPTER_TARGET_TYPES.includes(type)) {
      throw new Error(`Unknown target '${type}'. Known targets: ${ADAPTER_TARGET_TYPES.join(", ")}.`);
    }
    const existingTarget = manifest.spec.targets.find((target) => target.type === type);
    if (existingTarget) existingTarget.enabled = true;
    else manifest.spec.targets.push({ id: type, type, enabled: true, config: {} });
  }
}

/**
 * `--target` is the write set for this run, not a bonus on top of platforms
 * `createManifest` auto-enabled from what it found on disk. Omit the flag and
 * those detected targets stay in the write set.
 */
function adapterWriteTargets(manifest, requested) {
  if (requested.length === 0) return manifest.spec.targets;
  const requestedTypes = new Set(requested);
  return manifest.spec.targets.filter((target) => requestedTypes.has(target.type));
}

function mergeExisting(discovered, existing) {
  const detectedTargets = new Map(discovered.spec.targets.map((target) => [target.id, target]));
  for (const target of existing.spec?.targets ?? []) detectedTargets.set(target.id, target);

  return {
    ...discovered,
    metadata: {
      ...discovered.metadata,
      ...existing.metadata,
      generatedAt: discovered.metadata.generatedAt,
    },
    spec: {
      ...discovered.spec,
      memory: existing.spec?.memory ?? discovered.spec.memory,
      secrets: mergeSecrets(discovered.spec.secrets, existing.spec?.secrets),
      targets: [...detectedTargets.values()],
      policies: existing.spec?.policies ?? discovered.spec.policies,
      governance: existing.spec?.governance ?? discovered.spec.governance,
    },
  };
}

export async function applySync(plan) {
  if (!plan.changed) return { applied: false, backupPath: null, written: [], backups: [] };

  const backupDirectory = path.join(path.dirname(plan.manifestPath), ".agentplaybooks", "backups", timestampForPath());

  let backupPath = null;
  if (plan.manifestChanged && plan.existing) {
    await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
    backupPath = path.join(backupDirectory, MANIFEST_NAME);
    await copyFile(plan.manifestPath, backupPath);
  }
  if (plan.manifestChanged) {
    await atomicWrite(plan.manifestPath, plan.manifest);
  }
  const { written, backups } = await applyAdapters(plan.fileActions, backupDirectory);
  return { applied: true, backupPath, written, backups };
}

function printTargetSuggestion(plan) {
  if (plan.suggestedTargets.length === 0) return;
  console.log("");
  console.log("No deployment target is enabled, so no platform files can be written.");
  console.log(`Agent tools detected for this user: ${plan.suggestedTargets.join(", ")}.`);
  console.log(`Enable one with, for example: agentplaybooks sync --target=${plan.suggestedTargets[0]} --apply`);
}

function actionDetail(action) {
  const parts = [];
  if (action.from) parts.push(`from ${action.from}`);
  if (action.servers?.length) parts.push(`+ ${action.servers.join(", ")}`);
  // A registered skill directory is the whole point of the hermes target, so it
  // has to be visible in the plan rather than hidden inside the file diff.
  if (action.externalDirs?.length) parts.push(`external skills: ${action.externalDirs.join(", ")}`);
  return parts.length > 0 ? ` (${parts.join("; ")})` : "";
}

export function printSyncPlan(plan) {
  if (plan.scope === "global") {
    console.log("Scope: your home-scoped agent stores. MCP configuration is left alone — see 'doctor --global' for drift.");
  }
  if (!plan.changed && plan.conflicts.length === 0) {
    console.log(`${MANIFEST_NAME} and platform files are already in sync.`);
    printTargetSuggestion(plan);
    return;
  }
  if (plan.manifestChanged) {
    console.log(`Sync plan: ${plan.action} ${plan.manifestPath}`);
    console.log(`  ${plan.manifest.spec.instructions.length} instruction file(s)`);
    console.log(`  ${plan.manifest.spec.skills.length} skill(s)`);
    console.log(`  ${plan.manifest.spec.connections.mcp.length} MCP server definition(s)`);
    console.log(`  ${plan.manifest.spec.targets.length} deployment target(s)`);
    if (plan.manifest.spec.secrets.length > 0) {
      console.log(`  ${plan.manifest.spec.secrets.length} secret reference(s): ${plan.manifest.spec.secrets.map((secret) => secret.name).join(", ")}`);
    }
  }
  for (const action of plan.fileActions) {
    console.log(`  [${action.target}] ${action.action} ${action.path}${actionDetail(action)}`);
  }
  for (const item of plan.conflicts) {
    console.log(`  [conflict:${item.target}] ${item.kind} '${item.name}': ${item.reason}`);
    for (const source of item.sources) console.log(`    - ${source}`);
  }
  if (plan.changed) {
    console.log("No files have been changed. Run again with --apply to write these changes.");
  }
  printTargetSuggestion(plan);
}
