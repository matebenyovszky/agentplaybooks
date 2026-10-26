import type { SupabaseClient } from "@supabase/supabase-js";
import type { SkillsRow, SkillAttachmentsRow } from "@/lib/supabase/types";
import { findPlaybookSkill } from "./skills";

export const SKILL_SUMMARY_COLUMNS = "id, name, description, licence, publisher_id, priority, created_at";
const ATTACHMENT_SUMMARY_COLUMNS = "id, skill_id, filename, file_type, language, description, size_bytes, created_at, updated_at";

export async function listSkillSummaries(database: SupabaseClient, playbookId: string, includeContent = false) {
  const { data, error } = await database.from("skills")
    .select(includeContent ? `${SKILL_SUMMARY_COLUMNS}, content` : SKILL_SUMMARY_COLUMNS)
    .eq("playbook_id", playbookId)
    .order("priority", { ascending: false });
  if (error) throw error;
  return ((data || []) as unknown as SkillsRow[]).map(skill => ({
    id: skill.id, name: skill.name,
    description: includeContent ? skill.description : skill.description?.slice(0, 512) ?? null,
    licence: skill.licence, publisher_id: skill.publisher_id,
    priority: skill.priority, created_at: skill.created_at,
    ...(includeContent ? { content: skill.content } : {}),
  }));
}

export async function getSkillDefinition(database: SupabaseClient, playbookId: string, skillId: string, includeAttachments = false, includeContent = true) {
  if (typeof skillId !== "string" || !skillId.trim()) throw new Error("skill_id is required");
  const columns = `${includeContent ? "*" : SKILL_SUMMARY_COLUMNS}, skill_attachments(${includeAttachments ? "*" : ATTACHMENT_SUMMARY_COLUMNS})`;
  const skill = await findPlaybookSkill<SkillsRow & { skill_attachments: Partial<SkillAttachmentsRow>[] }>(
    database, playbookId, skillId, columns,
  );
  if (!skill) throw new Error("Skill not found");
  return skill;
}

/** Resolve the parent through the authorized playbook before reading its file. */
export async function getSkillReference(database: SupabaseClient, playbookId: string, skillId: string, filename: string) {
  if (typeof skillId !== "string" || !skillId.trim()) throw new Error("skill_id is required");
  if (typeof filename !== "string" || !filename || filename.length > 100) throw new Error("filename is required (maximum 100 characters)");
  const skill = await findPlaybookSkill<Pick<SkillsRow, "id" | "name" | "content">>(
    database, playbookId, skillId, filename === "SKILL.md" ? "id, name, content" : "id, name",
  );
  if (!skill) throw new Error("Skill not found");
  if (filename === "SKILL.md") return { skill_id: skill.id, filename, content: skill.content || "" };
  const { data, error } = await database.from("skill_attachments")
    .select("id, filename, content, size_bytes, updated_at")
    .eq("skill_id", skill.id).eq("filename", filename).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Skill reference not found");
  return { skill_id: skill.id, ...data };
}

/** Bounded, resumable text. A section includes descendants but not sibling headings. */
export function skillReferenceWindow(content: string, args: Record<string, unknown>) {
  const integer = (name: string, fallback: number, min: number, max: number) => {
    const value = args[name] ?? fallback;
    if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
      throw new Error(`${name} must be an integer between ${min} and ${max}`);
    }
    return value;
  };
  const offset = integer("offset", 0, 0, Number.MAX_SAFE_INTEGER);
  const maxChars = integer("max_chars", 12000, 1, 32000);
  let selected = content;
  let sectionStartLine = 1;
  if (args.section !== undefined) {
    if (typeof args.section !== "string" || !args.section.trim()) throw new Error("section must be a nonempty heading");
    const lines = content.split("\n");
    let fence: { character: string; length: number } | undefined;
    let start = -1;
    let end = lines.length;
    let level = 0;
    for (let i = 0; i < lines.length; i++) {
      const marker = lines[i].match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
      if (marker) {
        if (!fence) fence = { character: marker[1][0], length: marker[1].length };
        else if (marker[1][0] === fence.character && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined;
        continue;
      }
      if (fence) continue;
      const heading = lines[i].match(/^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*$/);
      if (!heading) continue;
      const title = heading[2].replace(/[ \t]+#+[ \t]*$/, "").trim();
      if (start >= 0 && heading[1].length <= level) { end = i; break; }
      if (start < 0 && title.toLowerCase() === args.section.trim().toLowerCase()) {
        start = i; level = heading[1].length;
      }
    }
    if (start < 0) throw new Error("Section not found; use the exact Markdown heading without # prefixes");
    selected = lines.slice(start, end).join("\n");
    sectionStartLine = start + 1;
  }
  if (offset > selected.length) throw new Error("offset exceeds the selected text length");
  if (offset > 0 && /[\uD800-\uDBFF]/.test(selected[offset - 1]) && /[\uDC00-\uDFFF]/.test(selected[offset] || "")) {
    throw new Error("offset must not split a UTF-16 character; use next_offset from the previous response");
  }
  let end = Math.min(selected.length, offset + maxChars);
  // Keep UTF-16 surrogate pairs intact; offsets use JavaScript string units.
  if (end < selected.length && /[\uD800-\uDBFF]/.test(selected[end - 1])) end--;
  if (end === offset && end < selected.length) throw new Error("max_chars is too small for the next character");
  return {
    content: selected.slice(offset, end), offset, next_offset: end < selected.length ? end : null,
    total_chars: selected.length, truncated: end < selected.length, section_start_line: sectionStartLine,
    ...(args.section !== undefined ? { section: args.section } : {}),
  };
}
