import { serveWellKnownSkills, wellKnownSkillsOptions } from "@/lib/well-known-skills";
// @worker-native

/**
 * One public playbook as its own skill source. The `/.well-known/skills/` part of
 * the path is what the convention requires; everything before it is the base URL
 * a client is pointed at:
 *
 *   hermes skills search https://agentplaybooks.ai/playbooks/<guid> --source well-known
 *   hermes skills install well-known:https://agentplaybooks.ai/playbooks/<guid>/.well-known/skills/<name>
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ guid: string; path?: string[] }> },
) {
  const { guid, path } = await params;
  return serveWellKnownSkills(path ?? [], guid);
}

export function OPTIONS() {
  return wellKnownSkillsOptions();
}
