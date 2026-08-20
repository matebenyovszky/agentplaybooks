import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { printDoctor, publicReport, runDoctor, runGlobalDoctor } from "./doctor.js";
import { applySync, planGlobalSync, planSync, printSyncPlan } from "./sync.js";
import {
  applyPull,
  applyPush,
  listPlaybooks,
  planGlobalPush,
  planPull,
  planPush,
  readLink,
  removeApiKey,
  resolveApiKey,
  resolveBaseUrl,
  saveApiKey,
  verifyApiKey,
} from "./remote.js";
import {
  applyRewrite,
  inventoryForAdoption,
  planAdoption,
  publicAdoption,
  readConfigForRewrite,
  rewriteConfig,
} from "./adopt.js";
import {
  assertSecretName,
  buildRunEnvironment,
  createOrRotateSecret,
  listVaultSecrets,
  readManifestSecrets,
  reconcileSecrets,
  resolvePlaybookKey,
  resolveSecretValue,
  runWithEnvironment,
  savePlaybookKey,
} from "./secrets.js";

const HELP = `AgentPlaybooks CLI

Usage:
  agentplaybooks doctor [path] [--json] [--strict] [--global] [--include-vendored]
  agentplaybooks sync [path] [--apply] [--json] [--target=<types>]
  agentplaybooks sync --global [--apply] [--json] [--target=<types>] [--include-vendored]
  agentplaybooks login [--url=<base>]
  agentplaybooks logout [--url=<base>]
  agentplaybooks playbooks [--url=<base>] [--json]
  agentplaybooks pull <id|guid> [path] [--apply] [--json] [--url=<base>]
  agentplaybooks push [path] [--apply] [--json] [--url=<base>]
  agentplaybooks push --global [--apply] [--json] [--include-vendored]
  agentplaybooks secrets login <guid> [--url=<base>]
  agentplaybooks secrets status [path] [--json] [--url=<base>]
  agentplaybooks secrets push <NAME> [--from-env=<VAR>] [--yes] [--url=<base>]
  agentplaybooks secrets run [path] -- <command> [args...]
  agentplaybooks secrets adopt [path] [--global] [--apply] [--rewrite=<files>]
                              [--prefix=<P>] [--json] [--yes]

Commands:
  doctor     Audit agent instructions, skills, MCP configuration, secrets, and drift.
  sync       Plan or apply the canonical manifest and missing platform files
             for enabled targets (claude, cursor, codex, antigravity, hermes,
             grok).
             --target=claude,codex enables targets a project does not have yet,
             which is what a freshly pulled playbook needs.
             --global works across your home-scoped stores (~/.cursor/skills,
             ~/.claude/skills, the Hermes profile) instead of one project. It
             moves skills only: a global MCP config holds credentials, so
             copying it between clients would spread them. Skills the clients
             ship with themselves are left out unless --include-vendored.
  login      Store an AgentPlaybooks user API key (apb_...) for a remote.
             Reads AGENTPLAYBOOKS_API_KEY, or prompts on stdin.
  logout     Remove the stored API key for a remote.
  playbooks  List the playbooks the stored API key can access.
  pull       Plan or apply downloading a remote playbook's skills into
             .agents/skills and link the project to that playbook.
  push       Plan or apply uploading local skills and the manifest to the
             linked (or a new) remote playbook. Secret values are never sent.
             --global uploads this machine's own skills instead of one project's,
             as a workstation playbook. MCP configuration stays local: a
             home-scoped MCP config is where auth headers live.
  secrets    Work with the playbook's encrypted vault. 'status' compares what
             the playbook needs against the vault and this shell, 'push' stores
             one value, and 'run' injects values into one child process.
             'adopt' takes a credential that is already hard-coded in an MCP
             configuration, stores it in the vault, and — only for the files you
             name with --rewrite — replaces the literal with a \${VAR} reference.
             Without --rewrite no file is touched, so a configuration that works
             today keeps working.
             Requires a playbook-scoped API key: 'secrets login <guid>'.

Safety:
  doctor is read-only and local-only.
  sync, pull, and push are plan-only unless --apply is explicitly supplied.
  Conflicting definitions are reported and skipped, never overwritten.
  Secret values are never written to disk, never printed, and never passed as
  command-line arguments. 'secrets push' reads the value from stdin or from a
  named environment variable and requires an explicit confirmation.
`;

function parse(args) {
  const command = args[0];
  const flags = new Map();
  const positional = [];
  // Everything after a bare `--` belongs to the child command, not to us.
  const separator = args.indexOf("--");
  const own = separator === -1 ? args.slice(1) : args.slice(1, separator);
  const rest = separator === -1 ? [] : args.slice(separator + 1);
  for (const arg of own) {
    if (arg.startsWith("--")) {
      const equals = arg.indexOf("=");
      if (equals === -1) flags.set(arg, true);
      else flags.set(arg.slice(0, equals), arg.slice(equals + 1));
    } else {
      positional.push(arg);
    }
  }
  return { command, flags, positional, rest };
}

async function confirm(question) {
  if (!process.stdin.isTTY) {
    throw new Error(`${question} Refusing to continue without an interactive confirmation; pass --yes if you mean it.`);
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await new Promise((resolve) => rl.question(`${question} Type 'yes' to continue: `, resolve));
    return answer.trim().toLowerCase() === "yes";
  } finally {
    rl.close();
  }
}

async function promptForKey(question) {
  if (!process.stdin.isTTY) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf8").trim();
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await new Promise((resolve) => rl.question(question, resolve))).trim();
  } finally {
    rl.close();
  }
}

async function requireApiKey(url) {
  const apiKey = await resolveApiKey(url);
  if (!apiKey) {
    throw new Error(`No API key for ${url}. Run 'agentplaybooks login' or set AGENTPLAYBOOKS_API_KEY.`);
  }
  return apiKey;
}

// File contents are useful on disk, not in a plan summary: they would bury
// the actual decisions in the JSON output.
function withoutContent(action) {
  const summary = { ...action };
  delete summary.content;
  return summary;
}

function printRemotePlan(kind, plan) {
  if (plan.actions.length === 0 && plan.conflicts.length === 0) {
    console.log(`Nothing to ${kind}; already in sync.`);
  }
  for (const action of plan.actions) {
    console.log(`  ${action.action} ${action.kind} ${action.path ?? action.name}`);
  }
  for (const item of plan.conflicts) {
    console.log(`  [conflict] ${item.kind} '${item.name}': ${item.reason}`);
  }
}

const EXPANSION_NOTE = {
  documented: "the client expands ${VAR} here (documented)",
  undocumented: "the client is reported to expand ${VAR} here, but does not document it",
  unsupported: "this configuration format is not rewritten yet",
  unknown: "unknown client — verify that it expands ${VAR} before rewriting",
};

function printAdoptionPlan(plan, requestedRewrites) {
  for (const item of plan.skipped) {
    console.log(`  [skipped] ${item.source}: ${item.reason}`);
  }
  if (plan.secrets.length === 0) {
    console.log("No hard-coded credential found in the MCP configuration.");
    return;
  }
  console.log(`Found ${plan.secrets.length} value(s) to adopt (values are never shown):`);
  for (const secret of plan.secrets) {
    console.log(`  ${secret.name} (${secret.value.length} characters)`);
    for (const occurrence of secret.occurrences) {
      const rewrite = requestedRewrites.includes(occurrence.source) ? "will rewrite" : "left as it is";
      console.log(`    ${occurrence.source} → ${occurrence.keyPath.join(".")}`);
      console.log(`      ${rewrite}; ${EXPANSION_NOTE[occurrence.expansion]}`);
    }
  }
}

async function resolveVaultAccess(url, root, flags) {
  const link = await readLink(root);
  const guid = typeof flags.get("--playbook") === "string" ? flags.get("--playbook") : link?.guid;
  if (!guid) {
    throw new Error("This project is not linked to a playbook. Run 'agentplaybooks pull <guid> --apply' first, or pass --playbook=<guid>.");
  }
  const playbookKey = await resolvePlaybookKey(url, guid);
  if (!playbookKey) {
    throw new Error(`No playbook key for ${guid}. Run 'agentplaybooks secrets login ${guid}', or set AGENTPLAYBOOKS_PLAYBOOK_KEY.`);
  }
  return { guid, playbookKey };
}

async function runSecrets(url, flags, positional, rest) {
  const subcommand = positional[0];

  if (subcommand === "login") {
    const guid = positional[1];
    if (!guid) throw new Error("Usage: agentplaybooks secrets login <playbook-guid>");
    const key = process.env.AGENTPLAYBOOKS_PLAYBOOK_KEY
      || await promptForKey(`Paste a playbook API key for ${guid} with secrets:read (apb_...): `);
    if (!key.startsWith("apb_")) throw new Error("That does not look like a playbook API key (apb_...).");
    await listVaultSecrets(url, guid, key);
    await savePlaybookKey(url, guid, key);
    console.log(`Stored a playbook key for ${guid}. It is scoped to that playbook only.`);
    return;
  }

  // Argument shape is checked before any credential lookup: a typo should be
  // reported as a typo, not as a missing key.
  if (subcommand === "push") {
    if (!positional[1]) throw new Error("Usage: agentplaybooks secrets push <NAME> [path] [--from-env=<VAR>]");
    assertSecretName(positional[1]);
  }
  if (subcommand === "run" && rest.length === 0) {
    throw new Error("Usage: agentplaybooks secrets run [path] -- <command> [args...]");
  }

  const root = flags.has("--global")
    ? os.homedir()
    : path.resolve(subcommand === "push" ? (positional[2] ?? process.cwd()) : (positional[1] ?? process.cwd()));

  // Planning an adoption reads local files and talks to nobody, so it must not
  // demand a vault credential first. Everything else here needs the vault.
  const needsVault = subcommand !== "adopt" || flags.has("--apply");
  const vault = needsVault ? await resolveVaultAccess(url, root, flags) : { guid: null, playbookKey: null };
  const { guid, playbookKey } = vault;

  if (subcommand === "status") {
    const [manifestSecrets, vaultSecrets] = await Promise.all([
      readManifestSecrets(root),
      listVaultSecrets(url, guid, playbookKey),
    ]);
    const rows = reconcileSecrets(manifestSecrets, vaultSecrets, process.env);
    if (flags.has("--json")) {
      console.log(JSON.stringify(rows, null, 2));
      return;
    }
    if (rows.length === 0) {
      console.log("This playbook declares no secrets and the vault is empty.");
      return;
    }
    console.log(`Secrets for playbook ${guid} (values are never shown):`);
    for (const row of rows) {
      const state = [
        row.inEnvironment ? "set in this shell" : "not set here",
        row.inVault ? (row.revealable ? "in vault (revealable)" : "in vault (proxy only)") : "not in vault",
        ...(row.vaultOnly ? ["not referenced by the playbook"] : []),
        ...(row.required ? [] : ["optional"]),
      ].join(", ");
      console.log(`  ${row.name}: ${state}`);
    }
    const missing = rows.filter((row) => row.required && !row.inEnvironment && !row.inVault);
    if (missing.length > 0) {
      console.log("");
      console.log(`Needed but nowhere to be found: ${missing.map((row) => row.name).join(", ")}.`);
      console.log("Store one with: <value source> | agentplaybooks secrets push NAME");
    }
    return;
  }

  if (subcommand === "push") {
    const name = positional[1];
    const fromEnv = typeof flags.get("--from-env") === "string" ? flags.get("--from-env") : null;
    const { value, origin } = await resolveSecretValue({ fromEnv });
    const vaultSecrets = await listVaultSecrets(url, guid, playbookKey);
    const existing = vaultSecrets.find((secret) => secret.name === name);

    console.log(`About to store a secret in the playbook vault at ${url}:`);
    console.log(`  playbook: ${guid}`);
    console.log(`  name:     ${name}`);
    console.log(`  source:   ${origin} (${value.length} characters, not shown)`);
    console.log(`  action:   ${existing ? "rotate the existing secret" : "create a new secret"}`);
    console.log("The value is encrypted server-side and is not written to disk by this command.");
    if (existing?.allow_api_key_reveal) {
      console.log("Note: this secret has reveal enabled, so an API key with secrets:read can read the raw value.");
    }

    if (!flags.has("--yes") && !(await confirm("Store it?"))) {
      console.log("Nothing was sent.");
      return;
    }
    await createOrRotateSecret(url, guid, playbookKey, { name, value, existing: Boolean(existing) });
    console.log(existing ? `Rotated ${name}.` : `Stored ${name}.`);
    return;
  }

  if (subcommand === "adopt") {
    const inventory = await inventoryForAdoption({ global: flags.has("--global"), root });
    const prefix = typeof flags.get("--prefix") === "string" ? flags.get("--prefix") : "";
    const plan = planAdoption(inventory, { prefix });
    const requestedRewrites = typeof flags.get("--rewrite") === "string"
      ? flags.get("--rewrite").split(",").map((value) => value.trim()).filter(Boolean)
      : [];

    if (flags.has("--json")) {
      console.log(JSON.stringify(publicAdoption(plan), null, 2));
    } else {
      printAdoptionPlan(plan, requestedRewrites);
    }
    if (plan.secrets.length === 0) return;

    if (!flags.has("--apply")) {
      if (!flags.has("--json")) {
        console.log("");
        console.log("Nothing has been uploaded and no file has been changed.");
        console.log("Run again with --apply to store the values in the vault, and add");
        console.log("--rewrite=<file> for each file whose literal should become a ${VAR} reference.");
      }
      return;
    }

    const vaultSecrets = await listVaultSecrets(url, guid, playbookKey);
    const stored = new Set(vaultSecrets.map((secret) => secret.name));
    if (!flags.has("--yes") && !(await confirm(`Store ${plan.secrets.length} value(s) in the vault of ${guid}?`))) {
      console.log("Nothing was sent.");
      return;
    }

    for (const secret of plan.secrets) {
      assertSecretName(secret.name);
      await createOrRotateSecret(url, guid, playbookKey, {
        name: secret.name,
        value: secret.value,
        existing: stored.has(secret.name),
      });
      console.log(`${stored.has(secret.name) ? "Rotated" : "Stored"} ${secret.name}.`);
    }

    const configBySource = new Map(inventory.mcpConfigs.map((config) => [config.source, config]));
    for (const requested of requestedRewrites) {
      const affected = plan.secrets
        .flatMap((secret) => secret.occurrences.map((occurrence) => ({ ...occurrence, name: secret.name })))
        .filter((occurrence) => occurrence.source === requested);
      if (affected.length === 0) {
        console.log(`No adoptable value in '${requested}'; nothing rewritten.`);
        continue;
      }
      if (affected.some((occurrence) => occurrence.expansion === "unsupported")) {
        console.log(`Refusing to rewrite ${requested}: this client's configuration format is not rewritten yet.`);
        continue;
      }
      const config = configBySource.get(requested);
      const content = rewriteConfig(
        await readConfigForRewrite(config.absolutePath),
        affected[0].format,
        affected,
        affected.map((occurrence) => occurrence.name),
      );
      if (content === null) {
        console.log(`Could not rewrite ${requested} safely; left unchanged.`);
        continue;
      }
      await applyRewrite(config.absolutePath, content);
      console.log(`Rewrote ${requested} to reference ${affected.map((item) => `\${${item.name}}`).join(", ")}.`);
    }

    console.log("");
    console.log("The values are in the vault. Rotate them: they were on disk in plain text, so");
    console.log("they may also be in git history, shell history, and editor backups.");
    if (requestedRewrites.length > 0) {
      console.log("Provide them at runtime without writing them anywhere:");
      console.log("  apb secrets run -- <your client>");
    }
    return;
  }

  if (subcommand === "run") {
    const manifestSecrets = await readManifestSecrets(root);
    const names = manifestSecrets.map((secret) => secret.name);
    if (names.length === 0) {
      console.log("The playbook declares no secrets; running the command unchanged.");
    }
    const { injected, skipped } = await buildRunEnvironment(url, guid, playbookKey, names);
    const injectedNames = Object.keys(injected);
    if (injectedNames.length > 0) {
      console.log(`Injecting into the child process only: ${injectedNames.join(", ")}`);
    }
    for (const item of skipped) {
      console.log(`  skipped ${item.name}: ${item.reason}`);
    }
    const [command, ...commandArgs] = rest;
    const result = await runWithEnvironment(command, commandArgs, injected);
    if (result.signal) throw new Error(`${command} was terminated by ${result.signal}.`);
    process.exitCode = result.code;
    return;
  }

  throw new Error("Usage: agentplaybooks secrets <login|status|push|run|adopt> ...");
}

export async function run(args) {
  const { command, flags, positional, rest } = parse(args);
  if (!command || flags.has("--help") || command === "help") {
    console.log(HELP);
    return;
  }

  if (command === "doctor") {
    const report = flags.has("--global")
      ? await runGlobalDoctor({ includeVendored: flags.has("--include-vendored") })
      : await runDoctor(path.resolve(positional[0] ?? process.cwd()));
    if (flags.has("--json")) console.log(JSON.stringify(publicReport(report), null, 2));
    else printDoctor(report);
    if (flags.has("--strict") && report.findings.some((item) => item.severity === "critical" || item.severity === "high")) {
      process.exitCode = 2;
    }
    return;
  }

  if (command === "sync") {
    const requestedTargets = typeof flags.get("--target") === "string"
      ? flags.get("--target").split(",").map((value) => value.trim()).filter(Boolean)
      : [];
    const options = { targets: requestedTargets, includeVendored: flags.has("--include-vendored") };
    const plan = flags.has("--global")
      ? await planGlobalSync(options)
      : await planSync(path.resolve(positional[0] ?? process.cwd()), options);
    if (flags.has("--json")) {
      console.log(JSON.stringify({
        action: plan.action,
        changed: plan.changed,
        manifestPath: plan.manifestPath,
        manifest: plan.manifest,
        fileActions: plan.fileActions.map(withoutContent),
        conflicts: plan.conflicts,
        suggestedTargets: plan.suggestedTargets,
      }, null, 2));
    } else {
      printSyncPlan(plan);
    }
    if (flags.has("--apply")) {
      const result = await applySync(plan);
      if (!flags.has("--json")) {
        console.log(result.applied ? "Applied sync plan." : "No changes applied.");
        for (const written of result.written) console.log(`Wrote: ${written}`);
        if (result.backupPath) console.log(`Backup: ${result.backupPath}`);
        for (const backup of result.backups) console.log(`Backup: ${backup}`);
      }
    }
    return;
  }

  const url = resolveBaseUrl(typeof flags.get("--url") === "string" ? flags.get("--url") : undefined);

  if (command === "secrets") {
    await runSecrets(url, flags, positional, rest);
    return;
  }

  if (command === "login") {
    const apiKey = process.env.AGENTPLAYBOOKS_API_KEY
      || await promptForKey(`Paste your ${url} user API key (apb_...): `);
    if (!apiKey.startsWith("apb_")) throw new Error("That does not look like an AgentPlaybooks user API key (apb_...).");
    await verifyApiKey(url, apiKey);
    await saveApiKey(url, apiKey);
    console.log(`Stored API key for ${url}.`);
    return;
  }

  if (command === "logout") {
    const removed = await removeApiKey(url);
    console.log(removed ? `Removed API key for ${url}.` : `No stored API key for ${url}.`);
    return;
  }

  if (command === "playbooks") {
    const apiKey = await requireApiKey(url);
    const playbooks = await listPlaybooks(url, apiKey);
    if (flags.has("--json")) {
      console.log(JSON.stringify(playbooks.map((p) => ({ id: p.id, guid: p.guid, name: p.name, visibility: p.visibility, skill_count: p.skill_count })), null, 2));
      return;
    }
    if (playbooks.length === 0) {
      console.log("No accessible playbooks.");
      return;
    }
    for (const playbook of playbooks) {
      console.log(`${playbook.guid}  ${playbook.name} (${playbook.visibility}, ${playbook.skill_count ?? 0} skill(s))`);
    }
    return;
  }

  if (command === "pull") {
    const ref = positional[0];
    if (!ref) throw new Error("Usage: agentplaybooks pull <id|guid> [path]");
    const root = path.resolve(positional[1] ?? process.cwd());
    const apiKey = await requireApiKey(url);
    const plan = await planPull(root, ref, { url, apiKey });
    if (flags.has("--json")) {
      console.log(JSON.stringify({
        playbook: plan.playbook,
        actions: plan.actions.map(withoutContent),
        conflicts: plan.conflicts,
      }, null, 2));
    } else {
      console.log(`Pull plan for '${plan.playbook.name}' (${plan.playbook.guid}):`);
      printRemotePlan("pull", plan);
    }
    if (flags.has("--apply")) {
      const result = await applyPull(root, plan);
      if (!flags.has("--json")) {
        for (const written of result.written) console.log(`Wrote: ${written}`);
        console.log(`Linked ${root} to playbook ${plan.playbook.guid}.`);
      }
    } else if (!flags.has("--json")) {
      console.log("No files have been changed. Run again with --apply to write these changes.");
    }
    return;
  }

  if (command === "push") {
    const global = flags.has("--global");
    const root = global ? os.homedir() : path.resolve(positional[0] ?? process.cwd());
    const apiKey = await requireApiKey(url);
    const plan = global
      ? await planGlobalPush({ url, apiKey, includeVendored: flags.has("--include-vendored") })
      : await planPush(root, { url, apiKey });
    if (flags.has("--json")) {
      console.log(JSON.stringify({
        remote: plan.remote,
        actions: plan.actions,
        conflicts: plan.conflicts,
      }, null, 2));
    } else {
      if (plan.scope === "global") {
        console.log("Scope: this machine's own skills. MCP configuration is not uploaded — a home-scoped MCP config is where auth headers live.");
      }
      console.log(plan.remote
        ? `Push plan for linked playbook '${plan.remote.name}' (${plan.remote.guid}):`
        : "Push plan (a new remote playbook will be created):");
      printRemotePlan("push", plan);
      console.log("Remote skills that no longer exist locally are left untouched.");
    }
    if (flags.has("--apply")) {
      const result = await applyPush(root, plan, { apiKey });
      if (!flags.has("--json")) {
        console.log(`Pushed to playbook '${result.name}' (${result.guid}).`);
      }
    } else if (!flags.has("--json")) {
      console.log("Nothing has been uploaded. Run again with --apply to push.");
    }
    return;
  }

  throw new Error(`Unknown command '${command}'.\n\n${HELP}`);
}
