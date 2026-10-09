import { serveWellKnownSkills, wellKnownSkillsOptions } from "@/lib/well-known-skills";
// @worker-native

/**
 * Site-wide skill discovery: every skill published by a public playbook.
 *
 *   hermes skills search https://agentplaybooks.ai --source well-known
 *   hermes skills install well-known:https://agentplaybooks.ai/.well-known/skills/<name>
 *
 * A single playbook has its own endpoint under `/playbooks/<guid>/.well-known/`,
 * which is the one to hand a team: it publishes exactly that playbook's skills,
 * with no chance of a name from another publisher shadowing one of theirs.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  const { path } = await params;
  return serveWellKnownSkills(path ?? []);
}

export function OPTIONS() {
  return wellKnownSkillsOptions();
}
