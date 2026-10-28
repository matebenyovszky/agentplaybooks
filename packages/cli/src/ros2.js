/** Offline ROS 2 inventory. Never imports a launch file or executes ROS tools. */
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const SKIP = new Set([".git", ".tmp", ".agentplaybooks", "node_modules", "build", "install", "log", "dist", ".venv"]);

export async function inspectRos2(root) {
  const packages = [], launches = [], findings = [];
  const pending = [root];
  let visited = 0;
  while (pending.length) {
    const directory = pending.pop();
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (++visited > 20_000) throw new Error("ROS 2 scan limit reached; choose a smaller workspace.");
      if (entry.isSymbolicLink()) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP.has(entry.name)) pending.push(absolute);
        continue;
      }
      if (!entry.isFile()) continue;
      const source = path.relative(root, absolute).split(path.sep).join("/");
      if (/\.launch\.(py|xml|yaml|yml)$/.test(entry.name)) launches.push(source);
      if (entry.name !== "package.xml") continue;
      if ((await stat(absolute)).size > 2_097_152) {
        findings.push({ source, severity: "high", code: "ros2.package.too-large", message: "Package metadata exceeds the scan limit." });
        continue;
      }
      // This is a structural inventory, not a full XML schema validator. It
      // never resolves XML entities, URLs, includes, or Python launch code.
      // Preserve a separator: deleting comments outright can join malformed
      // fragments into a tag that was never present in the source document.
      const xml = (await readFile(absolute, "utf8")).replace(/<!--[\s\S]*?-->/g, " ");
      const field = tag => new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`).exec(xml)?.[1]?.trim();
      const name = field("name");
      if (!/<package(?:\s[^>]*)?>/.test(xml) || !/<\/package>/.test(xml) || !name || !/^[a-z][a-z0-9_]*$/.test(name)) {
        findings.push({ source, severity: "high", code: "ros2.package.invalid", message: "Expected package.xml with a lowercase ROS package name and a package root element." });
        continue;
      }
      packages.push({ name, source, ...(field("version") ? { version: field("version") } : {}) });
      for (const required of ["version", "license", "maintainer"]) {
        if (!field(required)) findings.push({ source, severity: "medium", code: `ros2.package.missing-${required}`, message: `ROS package metadata is missing ${required}.` });
      }
    }
  }
  const names = new Set();
  for (const pkg of packages) {
    if (names.has(pkg.name)) findings.push({ source: pkg.source, severity: "high", code: "ros2.package.duplicate", message: `Duplicate ROS package name: ${pkg.name}.` });
    names.add(pkg.name);
  }
  try {
    const manifest = JSON.parse(await readFile(path.join(root, "agentplaybook.json"), "utf8"));
    const robot = manifest.spec?.targets?.some(target => target.type === "ros2" && target.enabled);
    if (robot && manifest.spec?.policies?.physicalActions === "allowlist" && manifest.spec?.policies?.emergencyStopRequired !== true) {
      findings.push({ source: "agentplaybook.json", severity: "high", code: "ros2.policy.emergency-stop-missing", message: "A ROS 2 target that declares physical actions must declare an emergency-stop requirement. Runtime enforcement still needs to be verified separately." });
    }
  } catch (error) {
    if (error.code !== "ENOENT") findings.push({ source: "agentplaybook.json", severity: "high", code: "ros2.manifest.invalid", message: "Cannot inspect the robot policy because the playbook manifest is invalid." });
  }
  return { packages: packages.sort((a, b) => a.source.localeCompare(b.source)), launchFiles: launches.sort(), runtimeChecked: false, findings,
    limitations: ["Offline structural inventory only; dependencies, ROS graph, QoS, simulator behavior, physical limits and emergency-stop operation are not verified."] };
}
