/**
 * The `/.well-known/skills/` publishing convention.
 *
 * A site publishes an index of the skills it offers, and each skill's files sit
 * next to it. There is no registry and no sign-up: an agent client is pointed at
 * a base URL and installs from it. Hermes Agent, for example, reads
 * `hermes skills install well-known:https://<base>/.well-known/skills/<name>`.
 *
 *   GET /.well-known/skills/index.json      -> { skills: [{ name, description, files }] }
 *   GET /.well-known/skills/<name>/SKILL.md -> the skill document
 *   GET /.well-known/skills/<name>/<file>   -> a bundled reference/script/asset
 *
 * Only skills of `public` playbooks are ever served. There is no credential on
 * this path — an unlisted or private playbook is reachable with `apb pull`, and
 * that is deliberate rather than an omission.
 */
import { getServerAnonSupabase } from "@/lib/supabase/server";
import {
  contentTypeFor,
  isSafeSkillFile,
  skillFileList,
  skillMarkdown,
  type SkillDocument,
} from "@/lib/skill-markdown";

const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Long enough for a real catalog, short enough that the index stays a cheap
// discovery document. A truncated index is reported in `truncated` rather than
// silently pretending to be complete.
const INDEX_LIMIT = 200;

const INDEX_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "public, max-age=300, s-maxage=300",
  "Access-Control-Allow-Origin": "*",
};

type AttachmentRow = { filename: string | null; content: string | null };
type SkillRow = SkillDocument & {
  created_at?: string | null;
  skill_attachments?: AttachmentRow[] | null;
  playbook?: { guid?: string | null } | null;
};

/**
 * The anon client, not the service-role client: these responses are public, so
 * the row-level policies are a second lock behind the visibility filter rather
 * than something to route around.
 */
const SKILL_COLUMNS = `
  name, description, content, licence, created_at,
  skill_attachments(filename, content),
  playbook:playbooks!inner(guid, visibility)
`;

async function fetchSkills(playbookGuid?: string): Promise<SkillRow[]> {
  let query = getServerAnonSupabase()
    .from("skills")
    .select(SKILL_COLUMNS)
    .eq("playbook.visibility", "public");
  if (playbookGuid) query = query.eq("playbook.guid", playbookGuid);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(INDEX_LIMIT + 1);
  if (error) throw new Error(error.message);
  return (data as unknown as SkillRow[] | null) ?? [];
}

/**
 * Skill names are directory names, so they have to be unique. Across the whole
 * site two public playbooks can both publish a `code-review`; the newest wins and
 * the rest are dropped, because serving one name twice would make the index
 * unusable for every client.
 */
function dedupeByName(rows: SkillRow[]): SkillRow[] {
  const byName = new Map<string, SkillRow>();
  for (const row of rows) {
    if (typeof row.name !== "string" || !SKILL_NAME_PATTERN.test(row.name) || row.name.length > 64) continue;
    if (!byName.has(row.name)) byName.set(row.name, row);
  }
  return [...byName.values()];
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: INDEX_HEADERS });
}

function notFound(message: string) {
  return jsonResponse({ error: message }, 404);
}

/** The `OPTIONS` half of the convention, so browser clients can read the index. */
export function wellKnownSkillsOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

/**
 * Serve one request under `/.well-known/skills/`.
 *
 * @param segments Path segments after `/.well-known/skills/`.
 * @param playbookGuid Restrict to a single public playbook's skills.
 */
export async function serveWellKnownSkills(
  segments: string[],
  playbookGuid?: string,
): Promise<Response> {
  const [first, ...rest] = segments;

  if (segments.length === 0 || first === "index.json") {
    const rows = dedupeByName(await fetchSkills(playbookGuid));
    const published = rows
      .map((row) => {
        const document = skillMarkdown(row);
        if (document === null) return null;
        return {
          name: row.name,
          description: (row.description ?? "").replace(/\s+/g, " ").trim(),
          files: skillFileList(row.skill_attachments),
        };
      })
      .filter((entry): entry is { name: string; description: string; files: string[] } => entry !== null);

    return jsonResponse({
      skills: published.slice(0, INDEX_LIMIT),
      ...(published.length > INDEX_LIMIT ? { truncated: true } : {}),
    });
  }

  if (typeof first !== "string" || !SKILL_NAME_PATTERN.test(first)) {
    return notFound("Unknown skill");
  }
  const requested = rest.join("/");
  if (requested.length === 0) return notFound("Specify SKILL.md or a bundled file");

  const rows = await fetchSkills(playbookGuid);
  const skill = dedupeByName(rows).find((row) => row.name === first);
  if (!skill) return notFound("Unknown skill");

  if (requested === "SKILL.md") {
    const document = skillMarkdown(skill);
    if (document === null) return notFound("Skill has no Agent Skills-compatible description");
    return new Response(document, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": "public, max-age=300, s-maxage=300",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  if (!isSafeSkillFile(requested)) return notFound("Unknown file");
  const attachment = (skill.skill_attachments ?? []).find((item) => item.filename === requested);
  if (!attachment || typeof attachment.content !== "string") return notFound("Unknown file");

  return new Response(attachment.content, {
    headers: {
      "Content-Type": contentTypeFor(requested),
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
