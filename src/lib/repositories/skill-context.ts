import type { SupabaseClient } from "@supabase/supabase-js";
import type { SkillsRow, SkillAttachmentsRow } from "@/lib/supabase/types";
import { findPlaybookSkill } from "./skills";

export const SKILL_SUMMARY_COLUMNS = "id, name, description, licence, publisher_id, priority, created_at";
const ATTACHMENT_SUMMARY_COLUMNS = "id, skill_id, filename, file_type, language, description, size_bytes, created_at, updated_at";
export const SKILL_REFERENCE_BATCH_LIMIT = 5;
export const SKILL_REFERENCE_BATCH_DEFAULT_CHARS = 4000;
export const SKILL_REFERENCE_BATCH_MAX_CHARS = 6000;

class SkillReferenceError extends Error {}

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
  if (typeof skillId !== "string" || !skillId.trim()) throw new SkillReferenceError("skill_id is required");
  if (typeof filename !== "string" || !filename || filename.length > 100) throw new SkillReferenceError("filename is required (maximum 100 characters)");
  const skill = await findPlaybookSkill<Pick<SkillsRow, "id" | "name" | "content">>(
    database, playbookId, skillId, filename === "SKILL.md" ? "id, name, content" : "id, name",
  );
  if (!skill) throw new SkillReferenceError("Skill not found");
  if (filename === "SKILL.md") return { skill_id: skill.id, filename, content: skill.content || "" };
  const { data, error } = await database.from("skill_attachments")
    .select("id, filename, content, size_bytes, updated_at")
    .eq("skill_id", skill.id).eq("filename", filename).maybeSingle();
  if (error) throw error;
  if (!data) throw new SkillReferenceError("Skill reference not found");
  return { skill_id: skill.id, ...data };
}

/** Bounded, resumable text. A section includes descendants but not sibling headings. */
export function skillReferenceWindow(content: string, args: Record<string, unknown>) {
  const integer = (name: string, fallback: number, min: number, max: number) => {
    const value = args[name] ?? fallback;
    if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
      throw new SkillReferenceError(`${name} must be an integer between ${min} and ${max}`);
    }
    return value;
  };
  const offset = integer("offset", 0, 0, Number.MAX_SAFE_INTEGER);
  const maxChars = integer("max_chars", 12000, 1, 32000);
  let selected = content;
  let sectionStartLine = 1;
  if (args.section !== undefined) {
    if (typeof args.section !== "string" || !args.section.trim()) throw new SkillReferenceError("section must be a nonempty heading");
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
    if (start < 0) throw new SkillReferenceError("Section not found; use the exact Markdown heading without # prefixes");
    selected = lines.slice(start, end).join("\n");
    sectionStartLine = start + 1;
  }
  if (offset > selected.length) throw new SkillReferenceError("offset exceeds the selected text length");
  if (offset > 0 && /[\uD800-\uDBFF]/.test(selected[offset - 1]) && /[\uDC00-\uDFFF]/.test(selected[offset] || "")) {
    throw new SkillReferenceError("offset must not split a UTF-16 character; use next_offset from the previous response");
  }
  let end = Math.min(selected.length, offset + maxChars);
  // Keep UTF-16 surrogate pairs intact; offsets use JavaScript string units.
  if (end < selected.length && /[\uD800-\uDBFF]/.test(selected[end - 1])) end--;
  if (end === offset && end < selected.length) throw new SkillReferenceError("max_chars is too small for the next character");
  return {
    content: selected.slice(offset, end), offset, next_offset: end < selected.length ? end : null,
    total_chars: selected.length, truncated: end < selected.length, section_start_line: sectionStartLine,
    ...(args.section !== undefined ? { section: args.section } : {}),
  };
}

export async function getSkillReferences(database: SupabaseClient, playbookId: string, references: unknown) {
  if (!Array.isArray(references) || references.length < 1 || references.length > SKILL_REFERENCE_BATCH_LIMIT) {
    throw new Error(`references must contain 1 to ${SKILL_REFERENCE_BATCH_LIMIT} items`);
  }

  // A single file may supply multiple headings or windows. Share its read
  // within this batch, including while the query is still in flight.
  const files = new Map<string, ReturnType<typeof getSkillReference>>();
  const results = await Promise.all(references.map(async item => {
    try {
      if (item === null || typeof item !== "object" || Array.isArray(item)) {
        throw new SkillReferenceError("Each reference must be an object");
      }
      const { skill_id, filename, max_chars = SKILL_REFERENCE_BATCH_DEFAULT_CHARS } = item;
      if (typeof skill_id !== "string" || typeof filename !== "string") {
        throw new SkillReferenceError("Each reference requires a skill_id and filename");
      }
      if (!Number.isInteger(max_chars) || max_chars < 1 || max_chars > SKILL_REFERENCE_BATCH_MAX_CHARS) {
        throw new SkillReferenceError(`max_chars must be an integer between 1 and ${SKILL_REFERENCE_BATCH_MAX_CHARS}`);
      }
      const key = JSON.stringify([skill_id, filename]);
      let fileRead = files.get(key);
      if (!fileRead) {
        fileRead = getSkillReference(database, playbookId, skill_id, filename);
        files.set(key, fileRead);
      }
      const file = await fileRead;
      return { ok: true, reference: { ...file, ...skillReferenceWindow(file.content, {
        section: item.section, offset: item.offset, max_chars,
      }) } };
    } catch (error) {
      return { ok: false, error: error instanceof SkillReferenceError ? error.message : "Could not read skill reference" };
    }
  }));
  return { results };
}
