import path from "node:path";

function slugify(value) {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64);
  return slug || "agent-playbook";
}
function sourceRef(item) {
  return {
    source: item.source,
    platform: item.platform,
    digest: item.digest,
  };
}

// `${VAR}`, `$VAR`, and `env:VAR` are how local agent configs reference a
// credential without containing it. Collecting those references makes a
// playbook self-describing about what it needs to run, which is what lets it
// move between machines and vendors — while the values stay in the
// environment, a vault, or the platform's encrypted store.
const ENV_REFERENCE_PATTERNS = [
  /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g,
  /(?<![\w$])\$([A-Za-z_][A-Za-z0-9_]*)/g,
  /^env:([A-Za-z_][A-Za-z0-9_]*)$/g,
];

function collectEnvReferences(value, found) {
  if (typeof value === "string") {
    for (const pattern of ENV_REFERENCE_PATTERNS) {
      for (const match of value.matchAll(pattern)) found.add(match[1]);
    }
    return found;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectEnvReferences(item, found);
    return found;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectEnvReferences(item, found);
  }
  return found;
}

function secretReferences(report) {
  const found = new Set();
  for (const server of report.inventory.mcpServers) {
    collectEnvReferences(server.definition, found);
  }
  return [...found].sort().map((name) => ({ name, ref: `env:${name}`, required: true }));
}

export function createManifest(report, { displayName } = {}) {
  // The directory name is the project's name. A machine-wide manifest has no
  // project, so the caller passes what it should be called instead of the
  // playbook being named after the user's home directory.
  const projectName = displayName ?? path.basename(report.inventory.root);
  const platforms = new Set([
    ...report.inventory.instructions.map((item) => item.platform),
    ...report.inventory.skills.map((item) => item.platform),
    ...(report.inventory.agents ?? []).map((item) => item.platform),
    ...report.inventory.mcpServers.map((item) => item.platform),
  ]);

  const supportedTargets = new Set(["codex", "claude", "cursor", "copilot", "gemini"]);
  const targets = [...platforms]
    .filter((platform) => supportedTargets.has(platform))
    .sort()
    .map((platform) => ({ id: platform, type: platform, enabled: true, config: {} }));

  return {
    apiVersion: "agentplaybooks.ai/v1alpha1",
    kind: "Playbook",
    metadata: {
      name: slugify(projectName),
      displayName: projectName,
      generatedAt: new Date().toISOString(),
    },
    spec: {
      instructions: report.inventory.instructions.map(sourceRef).sort((a, b) => a.source.localeCompare(b.source)),
      skills: report.inventory.skills.map((item) => ({
        ...sourceRef({ ...item, digest: item.treeDigest ?? item.digest }),
        name: item.name,
        ...(item.description ? { description: item.description } : {}),
      })).sort((a, b) => a.name.localeCompare(b.name) || a.source.localeCompare(b.source)),
      agents: (report.inventory.agents ?? []).map((item) => ({
        ...sourceRef(item),
        name: item.name,
        description: item.description,
        ...(item.tools.length > 0 ? { tools: item.tools } : {}),
        ...(item.model ? { model: item.model } : {}),
        ...(item.extensions ? { extensions: item.extensions } : {}),
      })).sort((a, b) => a.name.localeCompare(b.name) || a.source.localeCompare(b.source)),
      connections: {
        mcp: report.inventory.mcpServers.map((server) => ({
          name: server.name,
          source: server.source,
          platform: server.platform,
          transport: server.transport,
          digest: server.digest,
        })).sort((a, b) => a.name.localeCompare(b.name) || a.source.localeCompare(b.source)),
      },
      memory: {
        mode: "disabled",
        writeBack: false,
      },
      secrets: secretReferences(report),
      targets,
      policies: {
        network: "allowlist",
        physicalActions: "deny",
        humanApproval: "on-risk",
        emergencyStopRequired: false,
        allowedTools: [],
        deniedTools: [],
      },
      governance: {
        environment: "draft",
        approvalRequired: false,
        signedArtifacts: false,
        inherits: [],
      },
    },
  };
}

export function comparableManifest(manifest) {
  const copy = structuredClone(manifest);
  delete copy.metadata?.generatedAt;
  return copy;
}
