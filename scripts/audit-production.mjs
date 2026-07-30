import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const patchedBraceExpansionVersions = new Set(["2.1.4", "5.0.9"]);
const braceExpansionAdvisory = "GHSA-mh99-v99m-4gvg";

const audit = spawnSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["audit", "--omit=dev", "--audit-level=high", "--json"],
  {
    cwd: process.cwd(),
    encoding: "utf8",
  },
);

if (audit.error) {
  throw audit.error;
}

let report;
try {
  report = JSON.parse(audit.stdout);
} catch {
  process.stderr.write(audit.stderr);
  process.stderr.write(audit.stdout);
  process.exit(audit.status ?? 1);
}

if (audit.status === 0) {
  console.log("Production dependency audit passed.");
  process.exit(0);
}

const vulnerabilities = report.vulnerabilities ?? {};
const braceExpansion = vulnerabilities["brace-expansion"];
const advisories = (braceExpansion?.via ?? []).filter(
  (entry) => typeof entry === "object",
);
const onlyKnownAdvisory =
  advisories.length === 1 &&
  advisories[0].url?.endsWith(braceExpansionAdvisory);

if (!onlyKnownAdvisory || braceExpansion.nodes.length === 0) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(audit.status ?? 1);
}

for (const nodePath of braceExpansion.nodes) {
  const manifestPath = join(process.cwd(), nodePath, "package.json");
  const installed = JSON.parse(readFileSync(manifestPath, "utf8")).version;

  if (!patchedBraceExpansionVersions.has(installed)) {
    console.error(
      `Production audit failed: ${nodePath} uses brace-expansion ${installed}.`,
    );
    process.exit(audit.status ?? 1);
  }
}

const ignored = new Set(["brace-expansion"]);
let changed = true;

while (changed) {
  changed = false;

  for (const [name, vulnerability] of Object.entries(vulnerabilities)) {
    if (ignored.has(name) || vulnerability.via.length === 0) {
      continue;
    }

    const isOnlyCausedByIgnoredDependencies = vulnerability.via.every(
      (entry) => typeof entry === "string" && ignored.has(entry),
    );

    if (isOnlyCausedByIgnoredDependencies) {
      ignored.add(name);
      changed = true;
    }
  }
}

const blocking = Object.entries(vulnerabilities).filter(
  ([name, vulnerability]) =>
    !ignored.has(name) &&
    (vulnerability.severity === "high" ||
      vulnerability.severity === "critical"),
);

if (blocking.length > 0) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(audit.status ?? 1);
}

console.log(
  `Production dependency audit passed. Ignored ${braceExpansionAdvisory} ` +
    "because every reported brace-expansion instance uses a verified patched " +
    "maintenance release.",
);
