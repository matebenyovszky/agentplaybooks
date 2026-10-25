#!/usr/bin/env node
/**
 * List the self-host stack that this repository actually declares, plus
 * whatever Docker Compose reports as running (ps / images / published ports).
 *
 * The application compose file runs the Next.js app only. A full on-prem
 * deployment also needs a self-hosted Supabase stack, which this repository
 * does not vendor. Pass extra compose files with --compose-file so the live
 * inventory covers both.
 *
 * Usage:
 *   node scripts/list-self-host-stack.mjs
 *   node scripts/list-self-host-stack.mjs --json
 *   node scripts/list-self-host-stack.mjs --declared-only
 *   node scripts/list-self-host-stack.mjs --compose-file /path/to/supabase/docker-compose.yml
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(here, "..");
export const defaultComposeFile = resolve(repoRoot, "docker-compose.yml");

/** Customer-operated Supabase Docker services. Not in this repo's compose file. */
export const expectedSupabaseServices = [
  { service: "kong", typicalPorts: ["8000", "8443"], role: "API gateway (Auth, REST, Storage, Realtime, Studio)" },
  { service: "db / postgres", typicalPorts: ["5432"], role: "PostgreSQL with auth schema; holds ciphertext, audit_logs, RLS" },
  { service: "supavisor / pooler", typicalPorts: ["5432", "6543"], role: "Connection pooler (session / transaction)" },
  { service: "auth / gotrue", typicalPorts: ["9999"], role: "Supabase Auth (JWT, OAuth / Entra, email)" },
  { service: "rest / postgrest", typicalPorts: ["3000"], role: "Data API used by every application route" },
  { service: "realtime", typicalPorts: [], role: "Realtime (optional for this app)" },
  { service: "storage", typicalPorts: [], role: "Object storage (optional; this app stores attachments in Postgres)" },
  { service: "studio", typicalPorts: ["3000"], role: "Supabase Studio admin UI" },
  { service: "meta", typicalPorts: ["8080"], role: "Postgres meta API" },
  { service: "analytics / logflare", typicalPorts: [], role: "Log analytics (optional)" },
  { service: "vector", typicalPorts: [], role: "Log router (optional)" },
  { service: "imgproxy", typicalPorts: [], role: "Image transforms (optional)" },
  { service: "functions / edge-runtime", typicalPorts: [], role: "Edge Functions (this app does not require them)" },
  { service: "inbucket", typicalPorts: ["9000"], role: "Local mail catcher for Auth emails (dev)" },
];

export const expectedAppSecrets = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_APP_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SECRETS_ENCRYPTION_KEY",
  "ALLOWED_ORIGINS",
  "SECRETS_REQUIRE_ALLOWED_HOSTS",
];

function parseArgs(argv) {
  const options = {
    json: false,
    declaredOnly: false,
    requireRunning: false,
    composeFiles: [],
    projectDir: repoRoot,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") options.json = true;
    else if (arg === "--markdown") options.json = false;
    else if (arg === "--declared-only") options.declaredOnly = true;
    else if (arg === "--require-running") options.requireRunning = true;
    else if (arg === "--compose-file" && argv[i + 1]) {
      options.composeFiles.push(resolve(argv[++i]));
    } else if (arg === "--project-dir" && argv[i + 1]) {
      options.projectDir = resolve(argv[++i]);
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

/**
 * Minimal compose-service parser. Good enough for this repository's
 * docker-compose.yml (single `app` service, published port mapping).
 * Live deployments should prefer `docker compose config --format json`.
 */
export function parseComposeServices(composeText) {
  const services = [];
  const lines = composeText.split(/\r?\n/);
  let inServices = false;
  let current = null;
  let inPorts = false;

  for (const line of lines) {
    if (/^services:\s*$/.test(line)) {
      inServices = true;
      continue;
    }
    if (!inServices) continue;
    if (/^[A-Za-z]/.test(line) && !line.startsWith(" ")) break;

    const serviceMatch = line.match(/^  ([A-Za-z0-9._-]+):\s*$/);
    if (serviceMatch) {
      current = {
        name: serviceMatch[1],
        image: null,
        build: false,
        ports: [],
        environment: [],
      };
      services.push(current);
      inPorts = false;
      continue;
    }
    if (!current) continue;

    if (/^\s+ports:\s*$/.test(line)) {
      inPorts = true;
      continue;
    }
    if (/^\s+[A-Za-z]/.test(line) && !/^\s+-/.test(line)) {
      inPorts = false;
    }

    const imageMatch = line.match(/^\s+image:\s*(.+)\s*$/);
    if (imageMatch) current.image = imageMatch[1].replace(/^["']|["']$/g, "");

    if (/^\s+build:\s*$/.test(line) || /^\s+build:\s*.+/.test(line)) {
      current.build = true;
    }

    if (inPorts) {
      const portMatch = line.match(/^\s+-\s*["']?(.+?)["']?\s*$/);
      if (portMatch) current.ports.push(portMatch[1]);
    }

    const envMatch = line.match(/^\s+([A-Z][A-Z0-9_]+):\s*(.*)$/);
    if (envMatch) current.environment.push(envMatch[1]);
  }

  return services;
}

function runCompose(projectDir, composeFiles, args) {
  const commandArgs = ["compose", "--project-directory", projectDir];
  const files = composeFiles.length > 0 ? composeFiles : [defaultComposeFile];
  for (const file of files) {
    commandArgs.push("-f", file);
  }
  commandArgs.push(...args);

  const result = spawnSync("docker", commandArgs, {
    encoding: "utf8",
    cwd: projectDir,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    args: commandArgs,
  };
}

function parseJsonOutput(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    const rows = [];
    for (const line of trimmed.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        rows.push(JSON.parse(line));
      } catch {
        return { raw: trimmed };
      }
    }
    return rows;
  }
}

function declaredInventory(composeFiles) {
  const files = composeFiles.length > 0 ? composeFiles : [defaultComposeFile];
  return files.map((file) => {
    if (!existsSync(file)) {
      return { file, error: "compose file not found", services: [] };
    }
    const text = readFileSync(file, "utf8");
    return { file, services: parseComposeServices(text) };
  });
}

export function collectInventory(options) {
  const composeFiles = options.composeFiles.length > 0
    ? options.composeFiles
    : [defaultComposeFile];

  const report = {
    generatedAt: new Date().toISOString(),
    repoRoot,
    projectDir: options.projectDir,
    composeFiles,
    declared: declaredInventory(composeFiles),
    expectedAppSecrets,
    expectedSupabaseServices,
    docker: {
      available: false,
      ps: [],
      images: [],
      config: null,
      errors: [],
    },
  };

  if (options.declaredOnly) return report;

  const ps = runCompose(options.projectDir, composeFiles, ["ps", "-a", "--format", "json"]);
  if (ps.status === 127 || /command not found/i.test(ps.stderr) || /executable file not found/i.test(ps.stderr)) {
    report.docker.errors.push("docker is not available in this environment");
    return report;
  }
  if (!ps.ok && /Cannot connect to the Docker daemon/i.test(`${ps.stdout}\n${ps.stderr}`)) {
    report.docker.errors.push("docker daemon is not running");
    return report;
  }

  report.docker.available = true;
  if (!ps.ok) {
    report.docker.errors.push(`docker compose ps failed: ${ps.stderr.trim() || ps.stdout.trim()}`);
  } else {
    report.docker.ps = parseJsonOutput(ps.stdout);
  }

  const images = runCompose(options.projectDir, composeFiles, ["images", "--format", "json"]);
  if (images.ok) report.docker.images = parseJsonOutput(images.stdout);
  else report.docker.errors.push(`docker compose images failed: ${images.stderr.trim() || images.stdout.trim()}`);

  const config = runCompose(options.projectDir, composeFiles, ["config", "--format", "json"]);
  if (config.ok) {
    try {
      report.docker.config = JSON.parse(config.stdout);
    } catch {
      report.docker.errors.push("docker compose config returned non-JSON");
    }
  }

  return report;
}

function portsFromPsRow(row) {
  if (!row || typeof row !== "object") return [];
  if (typeof row.Publishers === "object" && Array.isArray(row.Publishers)) {
    return row.Publishers.map((publisher) => {
      const published = publisher.PublishedPort || publisher.URL || "";
      const target = publisher.TargetPort || "";
      const protocol = publisher.Protocol || "";
      return [published, target, protocol].filter(Boolean).join("/");
    }).filter(Boolean);
  }
  if (typeof row.Ports === "string" && row.Ports) return [row.Ports];
  return [];
}

export function formatMarkdown(report) {
  const lines = [
    `# Self-host stack inventory`,
    ``,
    `Generated: ${report.generatedAt}`,
    `Project directory: \`${report.projectDir}\``,
    `Compose files: ${report.composeFiles.map((file) => `\`${file}\``).join(", ")}`,
    ``,
    `## Declared in compose files`,
    ``,
  ];

  for (const entry of report.declared) {
    lines.push(`### \`${entry.file}\``);
    lines.push("");
    if (entry.error) {
      lines.push(`- Error: ${entry.error}`);
      lines.push("");
      continue;
    }
    if (entry.services.length === 0) {
      lines.push("- No services parsed. Re-run with Docker available, or inspect the file.");
      lines.push("");
      continue;
    }
    lines.push("| Service | Image / build | Ports | Environment keys |");
    lines.push("|---------|---------------|-------|------------------|");
    for (const service of entry.services) {
      const image = service.image || (service.build ? "build context (Dockerfile)" : "—");
      lines.push(
        `| ${service.name} | ${image} | ${service.ports.join(", ") || "—"} | ${service.environment.join(", ") || "—"} |`,
      );
    }
    lines.push("");
  }

  lines.push("## Running containers (`docker compose ps` / `images`)");
  lines.push("");
  if (!report.docker.available) {
    lines.push(report.docker.errors.length > 0
      ? report.docker.errors.map((error) => `- ${error}`).join("\n")
      : "- Docker was not queried (`--declared-only`).");
    lines.push("");
  } else {
    const rows = Array.isArray(report.docker.ps) ? report.docker.ps : [];
    if (rows.length === 0) {
      lines.push("- No containers reported. The stack is not running, or compose files did not match a project.");
      lines.push("");
    } else {
      lines.push("| Name | Service | Image | State | Published ports |");
      lines.push("|------|---------|-------|-------|-----------------|");
      for (const row of rows) {
        const name = row.Name || row.Names || "—";
        const service = row.Service || row.ServiceName || "—";
        const image = row.Image || "—";
        const state = row.State || row.Status || "—";
        const ports = portsFromPsRow(row).join(", ") || "—";
        lines.push(`| ${name} | ${service} | ${image} | ${state} | ${ports} |`);
      }
      lines.push("");
    }

    const images = Array.isArray(report.docker.images) ? report.docker.images : [];
    if (images.length > 0) {
      lines.push("| Repository | Tag | ID | Size |");
      lines.push("|------------|-----|----|------|");
      for (const image of images) {
        lines.push(
          `| ${image.Repository || image.ID || "—"} | ${image.Tag || "—"} | ${image.ID || "—"} | ${image.Size || "—"} |`,
        );
      }
      lines.push("");
    }
    if (report.docker.errors.length > 0) {
      lines.push("Docker notes:");
      for (const error of report.docker.errors) lines.push(`- ${error}`);
      lines.push("");
    }
  }

  lines.push("## Expected customer-operated Supabase services");
  lines.push("");
  lines.push("These are **not** started by this repository's `docker-compose.yml`. Attach the customer's Supabase compose file with `--compose-file` to list the live counterparts.");
  lines.push("");
  lines.push("| Service | Typical ports | Role |");
  lines.push("|---------|---------------|------|");
  for (const service of expectedSupabaseServices) {
    lines.push(`| ${service.service} | ${service.typicalPorts.join(", ") || "—"} | ${service.role} |`);
  }
  lines.push("");
  lines.push("## Application secrets / config keys (from `docker-compose.yml`)");
  lines.push("");
  for (const key of expectedAppSecrets) lines.push(`- \`${key}\``);
  lines.push("");
  lines.push("Attach this output to [docs/security/asset-inventory.md](../docs/security/asset-inventory.md) after each deployment change.");
  lines.push("");
  return lines.join("\n");
}

function printHelp() {
  process.stdout.write(`List the AgentPlaybooks self-host stack (declared + running).

Usage:
  node scripts/list-self-host-stack.mjs [--json] [--declared-only]
       [--compose-file FILE] [--project-dir DIR] [--require-running]
`);
}

function appIsRunning(report) {
  const rows = Array.isArray(report.docker.ps) ? report.docker.ps : [];
  return rows.some((row) => {
    const service = `${row.Service || row.ServiceName || row.Name || ""}`.toLowerCase();
    const state = `${row.State || ""}`.toLowerCase();
    return service.includes("app") && (state === "running" || state.includes("up"));
  });
}

function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    printHelp();
    return;
  }

  const report = collectInventory(options);
  if (options.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else process.stdout.write(formatMarkdown(report));

  if (options.requireRunning && !appIsRunning(report)) {
    process.stderr.write("Required app service is not running.\n");
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
