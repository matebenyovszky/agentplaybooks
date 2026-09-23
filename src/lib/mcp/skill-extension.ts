import { parse } from "yaml";
import type { Skill, SkillAttachment } from "@/lib/supabase/types";
import { isSafeSkillFile, skillMarkdown } from "@/lib/skill-markdown";
import { validateAgentSkillName } from "@/lib/agent-skills";

const MAX_SKILL_BYTES = 16 * 1024 * 1024;
const MAX_SKILL_FILES = 512;

type ServedFile = { uri: string; content: string; digest: string; size: number };
export type ServedSkill = {
  entry: { uri: string; frontmatter: Record<string, unknown>; resources: Array<Pick<ServedFile, "uri" | "digest" | "size">> };
  files: ServedFile[];
};

function frontmatterOf(markdown: string): Record<string, unknown> | null {
  const match = markdown.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!match) return null;
  try {
    const value: unknown = parse(match[1]);
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

async function servedFile(uri: string, content: string): Promise<ServedFile> {
  const bytes = new TextEncoder().encode(content);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return {
    uri,
    content,
    digest: `sha256:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")}`,
    size: bytes.byteLength,
  };
}

/** Materialize one immutable response snapshot so manifests and reads use identical bytes. */
export async function serveSkill(
  namespace: string,
  skill: Pick<Skill, "name" | "description" | "content" | "licence">,
  attachments: Array<Pick<SkillAttachment, "filename" | "content">>,
): Promise<ServedSkill | null> {
  if (validateAgentSkillName(skill.name)) return null;
  const markdown = skillMarkdown(skill);
  if (!markdown) return null;
  const frontmatter = frontmatterOf(markdown);
  if (!frontmatter || frontmatter.name !== skill.name || typeof frontmatter.description !== "string") return null;
  if (attachments.length + 1 > MAX_SKILL_FILES) return null;
  const root = `skill://${namespace}/${skill.name}`;
  const files = [await servedFile(`${root}/SKILL.md`, markdown)];
  const seen = new Set<string>();
  for (const attachment of attachments) {
    if (!isSafeSkillFile(attachment.filename) || seen.has(attachment.filename)) return null;
    seen.add(attachment.filename);
    files.push(await servedFile(`${root}/${attachment.filename}`, attachment.content));
  }
  if (files.reduce((total, file) => total + file.size, 0) > MAX_SKILL_BYTES) return null;
  return {
    entry: {
      uri: files[0].uri,
      frontmatter,
      resources: files.map(({ uri, digest, size }) => ({ uri, digest, size })),
    },
    files,
  };
}

export function skillResourceUri(namespace: string, uri: unknown): { name: string; path: string } | null {
  if (typeof uri !== "string" || !uri.startsWith(`skill://${namespace}/`)) return null;
  const match = uri.slice(`skill://${namespace}/`.length).match(/^([a-z0-9]+(?:-[a-z0-9]+)*)\/(SKILL\.md|(?:scripts|references|assets|examples|templates)\/[A-Za-z0-9][A-Za-z0-9._-]*)$/);
  return match ? { name: match[1], path: match[2] } : null;
}
