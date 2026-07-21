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

export function createManifest(report) {
  const projectName = path.basename(report.inventory.root);
  const platforms = new Set([
    ...report.inventory.instructions.map((item) => item.platform),
    ...report.inventory.skills.map((item) => item.platform),
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
        ...sourceRef(item),
        name: item.name,
        ...(item.description ? { description: item.description } : {}),
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
      secrets: [],
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
