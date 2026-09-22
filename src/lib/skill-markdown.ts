/**
 * Turning a stored skill back into a `SKILL.md` file.
 *
 * A hosted skill keeps the whole `SKILL.md` document in `content`, frontmatter
 * included, so a skill authored for one client keeps the fields only that client
 * understands (`version`, `platforms`, `metadata.hermes.*`) across a push and a
 * pull. Everything here therefore *preserves* an existing frontmatter block and
 * only fills in what the Agent Skills specification requires — `name` and
 * `description` — rather than regenerating it from the columns and dropping the
 * rest.
 *
 * Spec: https://agentskills.io/specification
 */

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

export type SkillDocument = {
  name: string;
  description?: string | null;
  content?: string | null;
  licence?: string | null;
};

export function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n/g, "\n");
}

/** A YAML double-quoted scalar. JSON string escaping is valid YAML here. */
function yamlString(value: string): string {
  return JSON.stringify(value.replace(/\s+/g, " ").trim());
}

/** The key of a top-level frontmatter entry, or null for anything nested. */
function topLevelKey(line: string): string | null {
  const match = line.match(/^([A-Za-z0-9_.-]+):(\s.*)?$/);
  return match ? match[1] : null;
}

function inlineValue(line: string): string {
  const index = line.indexOf(":");
  return index === -1 ? "" : line.slice(index + 1).trim();
}

/**
 * Ensure the frontmatter block carries the two required fields with the values
 * this playbook is publishing. An entry whose value continues on the following
 * lines (a block scalar) is left alone: rewriting its first line would corrupt
 * the rest of it.
 */
function patchFrontmatter(block: string, name: string, description: string): string {
  const lines = block.split("\n");
  const required: Array<[string, string]> = [
    ["name", name],
    ["description", yamlString(description)],
  ];

  for (const [key, value] of required) {
    const index = lines.findIndex((line) => topLevelKey(line) === key);
    if (index === -1) {
      lines.unshift(`${key}: ${value}`);
      continue;
    }
    const current = inlineValue(lines[index]);
    if (current.length === 0) continue;
    if (key === "name" && current.replace(/^["']|["']$/g, "") !== value) {
      // The directory name is authoritative: a mismatch makes the skill invalid
      // for every client, not just ours.
      lines[index] = `${key}: ${value}`;
    }
  }

  return lines.join("\n");
}

/**
 * The `SKILL.md` document for a stored skill, or null when it cannot be made
 * spec-valid — a skill with no description anywhere is not publishable, and
 * inventing one would be worse than leaving it out.
 */
export function skillMarkdown(skill: SkillDocument): string | null {
  const content = normalizeLineEndings(skill.content ?? "");
  const match = content.match(FRONTMATTER_PATTERN);
  const block = match ? match[1] : "";
  const body = match ? content.slice(match[0].length) : content;

  const columnDescription = (skill.description ?? "").replace(/\s+/g, " ").trim();
  const frontmatterDescription = block
    .split("\n")
    .filter((line) => topLevelKey(line) === "description")
    .map((line) => inlineValue(line).replace(/^["']|["']$/g, ""))
    .find((value) => value.length > 0) ?? "";
  const description = columnDescription || frontmatterDescription;
  if (description.length === 0) return null;

  if (match) {
    const patched = patchFrontmatter(block, skill.name, description);
    return `---\n${patched}\n---\n\n${body.replace(/^\n+/, "")}`;
  }

  const header = [
    `name: ${skill.name}`,
    `description: ${yamlString(description)}`,
    ...(skill.licence ? [`license: ${yamlString(skill.licence)}`] : []),
  ].join("\n");
  return `---\n${header}\n---\n\n${body.replace(/^\n+/, "")}`;
}

/**
 * The subdirectories a skill may bundle files under, from the Agent Skills
 * convention. One level, from this list, and nothing else.
 */
export const SKILL_FILE_DIRECTORIES = ["scripts", "references", "assets", "examples", "templates"] as const;

// Attachment filenames become URL path segments and, for anyone who downloads a
// skill, file paths. Only the shapes the spec uses are accepted: a plain name,
// or one of the standard subdirectories.
//
// This rule is enforced in three places and they have to agree: here, on the
// way out; `validateFilename` in attachment-validator.ts, on the way in; and
// the `safe_filename` CHECK on skill_attachments, in storage. Change one
// without the others and you get a file that can be stored but never served,
// or one the API accepts and the database then rejects.
const SAFE_SKILL_FILE = new RegExp(
  `^(?:(?:${SKILL_FILE_DIRECTORIES.join("|")})/)?[A-Za-z0-9][A-Za-z0-9._-]*$`,
);

export function isSafeSkillFile(filename: unknown): filename is string {
  if (typeof filename !== "string" || filename.length === 0 || filename.length > 128) return false;
  if (filename.includes("..") || filename.startsWith("/") || filename.includes("\\")) return false;
  if (filename === "SKILL.md") return false;
  return SAFE_SKILL_FILE.test(filename);
}

/** `files` for one skill: `SKILL.md` first, then whatever it bundles. */
export function skillFileList(attachments: Array<{ filename?: string | null }> | null | undefined): string[] {
  const bundled = (attachments ?? [])
    .map((attachment) => attachment?.filename)
    .filter(isSafeSkillFile);
  return ["SKILL.md", ...[...new Set(bundled)].sort()];
}

const CONTENT_TYPES: Record<string, string> = {
  md: "text/markdown; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  json: "application/json; charset=utf-8",
  yaml: "text/yaml; charset=utf-8",
  yml: "text/yaml; charset=utf-8",
  py: "text/x-python; charset=utf-8",
  sh: "text/x-shellscript; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  ts: "text/plain; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  html: "text/plain; charset=utf-8",
};

export function contentTypeFor(filename: string): string {
  const extension = filename.slice(filename.lastIndexOf(".") + 1).toLowerCase();
  return CONTENT_TYPES[extension] ?? "text/plain; charset=utf-8";
}
