/**
 * Demonstration references: how a skill points at a recording of itself being
 * performed.
 *
 * A skill's portable core is its prose, but for a physical agent the decisive
 * artifact is a demonstration. Robot foundation models of the GEN-1.5 generation
 * learn a task from one or a handful of demonstrations placed directly in their
 * context — no training run — and several demonstrations can be chained into one
 * continuous behaviour. A demonstration is therefore not an attachment sitting
 * beside the skill; it is part of what the skill *is*, and the order of the list
 * is the order of execution.
 *
 * They live in the `SKILL.md` frontmatter, under `demonstrations:`:
 *
 *   ---
 *   name: open-fire-door
 *   description: Opening a fire door by its handle, two-handed
 *   demonstrations:
 *     - provider: youtube
 *       ref: dQw4w9WgXcQ
 *       fidelity: video
 *       role: demonstration
 *       segments:
 *         - { start: 134, end: 158, label: grip the handle, comment: from below }
 *   ---
 *
 * Frontmatter rather than a table of its own, because that is the one place a
 * skill can carry structured data and still survive the round trip: `apb pull`
 * writes `SKILL.md` and `apb push` sends `content` back verbatim, so anything
 * outside the document is dropped on the first pull. It also costs no migration,
 * no endpoint and no new MCP tool.
 *
 * The same shape describes a recording attached to a memory, where it lives
 * under `metadata.recording`. There the semantics differ — evidence of what
 * happened, not an instruction to repeat it — which is why the key differs too,
 * but the parser and the renderer are shared.
 */
import { parseDocument } from "yaml";
import { splitFrontmatter } from "@/lib/skill-markdown";

export const DEMONSTRATION_PROVIDERS = ["youtube", "hf_dataset", "url"] as const;
export const DEMONSTRATION_FIDELITIES = ["video", "sensorimotor"] as const;
export const DEMONSTRATION_ROLES = ["demonstration", "reference", "warning"] as const;

export type DemonstrationProvider = (typeof DEMONSTRATION_PROVIDERS)[number];
export type DemonstrationFidelity = (typeof DEMONSTRATION_FIDELITIES)[number];
export type DemonstrationRole = (typeof DEMONSTRATION_ROLES)[number];

export type DemonstrationSegment = {
  /** Seconds from the start of the recording. */
  start: number;
  end?: number;
  label?: string;
  comment?: string;
};

export type DemonstrationRef = {
  provider: DemonstrationProvider;
  ref: string;
  fidelity: DemonstrationFidelity;
  role: DemonstrationRole;
  title?: string;
  /** Lowercase hex SHA-256 of the recording's bytes; only on `url` references. */
  sha256?: string;
  segments: DemonstrationSegment[];
};

/** The frontmatter key on a skill, and the `metadata` key on a memory. */
export const SKILL_DEMONSTRATIONS_KEY = "demonstrations";
export const MEMORY_RECORDING_KEY = "recording";

export const DEMONSTRATION_LIMITS = {
  MAX_PER_SKILL: 20,
  MAX_SEGMENTS: 50,
  MAX_REF_LENGTH: 512,
  MAX_TITLE_LENGTH: 120,
  MAX_LABEL_LENGTH: 120,
  MAX_COMMENT_LENGTH: 500,
  /** 24 hours. Longer than this is a data-entry mistake, not a demonstration. */
  MAX_SECONDS: 86_400,
} as const;

// YouTube ids are 11 characters today. The range is wider so a future change to
// the id length does not reject an otherwise valid reference, but narrow enough
// that a pasted sentence or a URL that failed to normalize is still caught.
const YOUTUBE_ID = /^[A-Za-z0-9_-]{8,24}$/;
const HF_DATASET = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*(?:@[A-Za-z0-9._-]+)?$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;

export type ParseResult = {
  /** Every entry that validated, in the order the author wrote them. */
  demonstrations: DemonstrationRef[];
  /** One message per rejected entry or field, addressed to whoever wrote it. */
  errors: string[];
};

/**
 * The video id inside a YouTube URL, or the input unchanged when it is already
 * a bare id. Authors paste what the browser gave them; making them extract the
 * id by hand would be the single most common way to get this wrong.
 */
export function normalizeYouTubeRef(value: string): string {
  const trimmed = value.trim();
  if (YOUTUBE_ID.test(trimmed)) return trimmed;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return trimmed;
  }

  const host = url.hostname.replace(/^www\./, "");
  if (host === "youtu.be") return url.pathname.slice(1).split("/")[0] ?? trimmed;
  if (host !== "youtube.com" && host !== "m.youtube.com") return trimmed;

  const queryId = url.searchParams.get("v");
  if (queryId) return queryId;

  // /embed/<id>, /shorts/<id>, /live/<id>
  const [, kind, id] = url.pathname.split("/");
  if ((kind === "embed" || kind === "shorts" || kind === "live") && id) return id;
  return trimmed;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalText(
  value: unknown,
  max: number,
  field: string,
  errors: string[],
): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    errors.push(`${field}: expected text`);
    return undefined;
  }
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.length > max) {
    errors.push(`${field}: longer than ${max} characters`);
    return trimmed.slice(0, max);
  }
  return trimmed;
}

function parseSeconds(value: unknown, field: string, errors: string[]): number | undefined {
  if (value === undefined || value === null) return undefined;
  const seconds = typeof value === "string" ? Number(value.trim()) : value;
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) {
    errors.push(`${field}: expected a number of seconds`);
    return undefined;
  }
  if (seconds < 0) {
    errors.push(`${field}: cannot be negative`);
    return undefined;
  }
  if (seconds > DEMONSTRATION_LIMITS.MAX_SECONDS) {
    errors.push(`${field}: beyond the ${DEMONSTRATION_LIMITS.MAX_SECONDS}s limit`);
    return undefined;
  }
  return Math.round(seconds * 1000) / 1000;
}

function parseSegment(raw: unknown, field: string, errors: string[]): DemonstrationSegment | null {
  if (!isPlainObject(raw)) {
    errors.push(`${field}: expected an object with a start time`);
    return null;
  }

  // `start:` with nothing after it parses as null, not as a missing key, so
  // both spellings of "absent" have to be reported — otherwise the segment is
  // dropped and the write path, seeing no error, accepts the loss.
  if (raw.start === undefined || raw.start === null) {
    errors.push(`${field}.start: required`);
    return null;
  }

  const start = parseSeconds(raw.start, `${field}.start`, errors);
  if (start === undefined) return null;

  const end = parseSeconds(raw.end, `${field}.end`, errors);
  if (end !== undefined && end <= start) {
    errors.push(`${field}.end: must come after start`);
    return null;
  }

  const label = optionalText(raw.label, DEMONSTRATION_LIMITS.MAX_LABEL_LENGTH, `${field}.label`, errors);
  const comment = optionalText(raw.comment, DEMONSTRATION_LIMITS.MAX_COMMENT_LENGTH, `${field}.comment`, errors);

  return {
    start,
    ...(end !== undefined ? { end } : {}),
    ...(label ? { label } : {}),
    ...(comment ? { comment } : {}),
  };
}

function validateRef(
  provider: DemonstrationProvider,
  raw: string,
  field: string,
  errors: string[],
): string | null {
  if (provider === "youtube") {
    const id = normalizeYouTubeRef(raw);
    if (!YOUTUBE_ID.test(id)) {
      errors.push(`${field}: not a YouTube video id or watch URL`);
      return null;
    }
    return id;
  }

  if (provider === "hf_dataset") {
    const trimmed = raw.trim();
    if (!HF_DATASET.test(trimmed)) {
      errors.push(`${field}: expected owner/name or owner/name@revision`);
      return null;
    }
    return trimmed;
  }

  const trimmed = raw.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    errors.push(`${field}: not a URL`);
    return null;
  }
  // Only https: a demonstration reference is published to whoever installs the
  // skill, and an http link would be silently downgraded or blocked for them.
  if (url.protocol !== "https:") {
    errors.push(`${field}: must be an https URL`);
    return null;
  }
  return url.toString();
}

function parseOne(raw: unknown, field: string, errors: string[]): DemonstrationRef | null {
  if (!isPlainObject(raw)) {
    errors.push(`${field}: expected an object`);
    return null;
  }

  const provider = raw.provider;
  if (typeof provider !== "string" || !DEMONSTRATION_PROVIDERS.includes(provider as DemonstrationProvider)) {
    errors.push(
      `${field}.provider: unknown provider ${JSON.stringify(provider ?? null)} `
      + `(expected ${DEMONSTRATION_PROVIDERS.join(", ")})`,
    );
    return null;
  }
  const typedProvider = provider as DemonstrationProvider;

  if (typeof raw.ref !== "string" || raw.ref.trim().length === 0) {
    errors.push(`${field}.ref: required`);
    return null;
  }
  if (raw.ref.length > DEMONSTRATION_LIMITS.MAX_REF_LENGTH) {
    errors.push(`${field}.ref: longer than ${DEMONSTRATION_LIMITS.MAX_REF_LENGTH} characters`);
    return null;
  }
  const ref = validateRef(typedProvider, raw.ref, `${field}.ref`, errors);
  if (ref === null) return null;

  // A dataset reference carries actions and proprioception; a video carries
  // pixels. Defaulting from the provider means the common case needs no field.
  let fidelity: DemonstrationFidelity = typedProvider === "hf_dataset" ? "sensorimotor" : "video";
  if (raw.fidelity !== undefined && raw.fidelity !== null) {
    if (typeof raw.fidelity !== "string" || !DEMONSTRATION_FIDELITIES.includes(raw.fidelity as DemonstrationFidelity)) {
      errors.push(`${field}.fidelity: expected ${DEMONSTRATION_FIDELITIES.join(" or ")}`);
      return null;
    }
    fidelity = raw.fidelity as DemonstrationFidelity;
  }

  let role: DemonstrationRole = "demonstration";
  if (raw.role !== undefined && raw.role !== null) {
    if (typeof raw.role !== "string" || !DEMONSTRATION_ROLES.includes(raw.role as DemonstrationRole)) {
      errors.push(`${field}.role: expected ${DEMONSTRATION_ROLES.join(", ")}`);
      return null;
    }
    role = raw.role as DemonstrationRole;
  }

  const title = optionalText(raw.title, DEMONSTRATION_LIMITS.MAX_TITLE_LENGTH, `${field}.title`, errors);

  // A digest pins the bytes a `url` points at, so a recording swapped on the
  // server is detectable by whoever downloads it. YouTube re-encodes what it
  // serves, so there is nothing stable to hash; a dataset is pinned by its
  // `@revision` instead.
  let sha256: string | undefined;
  if (raw.sha256 !== undefined && raw.sha256 !== null) {
    if (typedProvider !== "url") {
      errors.push(
        typedProvider === "hf_dataset"
          ? `${field}.sha256: only for url references — pin a dataset with owner/name@revision`
          : `${field}.sha256: only for url references — YouTube re-encodes what it serves`,
      );
      return null;
    }
    const digest = typeof raw.sha256 === "string" ? raw.sha256.trim().toLowerCase() : "";
    if (!SHA256_HEX.test(digest)) {
      errors.push(`${field}.sha256: expected 64 hexadecimal characters`);
      return null;
    }
    sha256 = digest;
  }

  const segments: DemonstrationSegment[] = [];
  if (raw.segments !== undefined && raw.segments !== null) {
    if (!Array.isArray(raw.segments)) {
      errors.push(`${field}.segments: expected a list`);
      return null;
    }
    if (raw.segments.length > DEMONSTRATION_LIMITS.MAX_SEGMENTS) {
      errors.push(`${field}.segments: more than ${DEMONSTRATION_LIMITS.MAX_SEGMENTS} segments`);
      return null;
    }
    raw.segments.forEach((entry, index) => {
      const segment = parseSegment(entry, `${field}.segments[${index}]`, errors);
      if (segment) segments.push(segment);
    });
    segments.sort((a, b) => a.start - b.start);
  }

  return {
    provider: typedProvider,
    ref,
    fidelity,
    role,
    ...(title ? { title } : {}),
    ...(sha256 ? { sha256 } : {}),
    segments,
  };
}

/**
 * Validate an already-decoded `demonstrations` value.
 *
 * Both halves of the result matter: a write path rejects the skill when
 * `errors` is non-empty, while a read path renders whatever validated and
 * ignores the rest, because one malformed entry should not blank out an export.
 */
export function parseDemonstrations(raw: unknown): ParseResult {
  if (raw === undefined || raw === null) return { demonstrations: [], errors: [] };

  const errors: string[] = [];
  const list = Array.isArray(raw) ? raw : [raw];
  if (list.length > DEMONSTRATION_LIMITS.MAX_PER_SKILL) {
    return {
      demonstrations: [],
      errors: [`demonstrations: more than ${DEMONSTRATION_LIMITS.MAX_PER_SKILL} entries`],
    };
  }

  const demonstrations: DemonstrationRef[] = [];
  list.forEach((entry, index) => {
    const parsed = parseOne(entry, `demonstrations[${index}]`, errors);
    if (parsed) demonstrations.push(parsed);
  });

  return { demonstrations, errors };
}

/**
 * The `demonstrations` block of a `SKILL.md` document.
 *
 * Frontmatter that does not parse is not an error here — a skill is free to use
 * whatever YAML dialect its own client understands, and this reader only ever
 * looks for one key.
 */
export function readSkillDemonstrations(content: string | null | undefined): ParseResult {
  const { block, hasFrontmatter } = splitFrontmatter(content);
  if (!hasFrontmatter || block.trim().length === 0) return { demonstrations: [], errors: [] };

  const document = parseDocument(block, { strict: false });
  if (document.errors.length > 0) return { demonstrations: [], errors: [] };

  // `maxAliasCount` caps alias expansion, so a skill cannot be authored to
  // expand into an unbounded document on every read.
  const raw = document.toJS({ maxAliasCount: 100 }) as unknown;
  if (!isPlainObject(raw)) return { demonstrations: [], errors: [] };
  if (!(SKILL_DEMONSTRATIONS_KEY in raw)) return { demonstrations: [], errors: [] };

  return parseDemonstrations(raw[SKILL_DEMONSTRATIONS_KEY]);
}

/**
 * What is wrong with a skill document's `demonstrations` block, or null when
 * nothing is.
 *
 * Strict on the way in, lenient on the way out: a typo caught at write time is
 * one the author can still fix, while the same typo discovered during an export
 * would only take the rest of the skill down with it.
 */
export function demonstrationsError(content: string | null | undefined): string | null {
  const { errors } = readSkillDemonstrations(content);
  return errors.length === 0 ? null : `Invalid demonstrations frontmatter — ${errors.join("; ")}`;
}

/** The same check for the `recording` block on a memory's `metadata`. */
export function recordingError(metadata: unknown): string | null {
  const { errors } = readMemoryRecording(metadata);
  return errors.length === 0 ? null : `Invalid metadata.recording — ${errors.join("; ")}`;
}

/** `demonstrationsError` for callers whose failure path is an exception. */
export function assertValidDemonstrations(content: string | null | undefined): void {
  const error = demonstrationsError(content);
  if (error) throw new Error(error);
}

/** `recordingError` for callers whose failure path is an exception. */
export function assertValidRecording(metadata: unknown): void {
  const error = recordingError(metadata);
  if (error) throw new Error(error);
}

/** The `recording` block of a memory's `metadata`. */
export function readMemoryRecording(metadata: unknown): ParseResult {
  if (!isPlainObject(metadata)) return { demonstrations: [], errors: [] };
  if (!(MEMORY_RECORDING_KEY in metadata)) return { demonstrations: [], errors: [] };
  return parseDemonstrations(metadata[MEMORY_RECORDING_KEY]);
}

/** The other `metadata` key with a defined shape: `{time, location, task, outcome}`. */
export const MEMORY_EPISODE_KEY = "episode";

/**
 * `metadata.episode.time` in the one form that can be compared.
 *
 * The time filter is a text comparison on a JSON field, which is only
 * trustworthy when every value is spelled the same way: `2026-08-20T14:32:00Z`
 * and `2026-08-20T14:32:00.500Z` denote instants half a second apart but sort
 * the other way round as strings, because `.` precedes `Z`. Canonicalizing both
 * the stored value and the query bound to ISO 8601 UTC with milliseconds makes
 * the ordering match the calendar.
 */
export function canonicalEpisodeTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

export type PreparedMetadata =
  | { metadata: unknown; error: null }
  | { metadata: null; error: string };

/**
 * Check the two `metadata` keys that have a defined shape, and return the value
 * to store.
 *
 * Everything else in `metadata` is passed through untouched — it is free-form
 * by design. `episode.time` is the one field rewritten rather than merely
 * validated, because a comparable ordering is the entire reason it exists.
 */
export function prepareMemoryMetadata(metadata: unknown): PreparedMetadata {
  const recording = recordingError(metadata);
  if (recording) return { metadata: null, error: recording };

  if (!isPlainObject(metadata)) return { metadata, error: null };
  const episode = metadata[MEMORY_EPISODE_KEY];
  if (!isPlainObject(episode)) return { metadata, error: null };
  if (episode.time === undefined || episode.time === null) return { metadata, error: null };

  const time = canonicalEpisodeTime(episode.time);
  if (time === null) {
    return {
      metadata: null,
      error: `Invalid metadata.episode.time — expected an ISO 8601 timestamp, got ${JSON.stringify(episode.time)}`,
    };
  }

  return { metadata: { ...metadata, [MEMORY_EPISODE_KEY]: { ...episode, time } }, error: null };
}

/**
 * A `since` or `until` bound in the same canonical form as the stored values.
 * Throws rather than filtering on an uncomparable string, because a bound the
 * caller mistyped should not quietly return the wrong window.
 */
export function episodeTimeBound(value: string, field: string): string {
  const canonical = canonicalEpisodeTime(value);
  if (canonical === null) {
    throw new Error(`${field} must be an ISO 8601 timestamp, got ${JSON.stringify(value)}`);
  }
  return canonical;
}

/** `2:14`, or `1:03:52` once it runs past an hour. */
export function formatTimestamp(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}

/**
 * A link a person or a browsing agent can open, seeking to `atSecond` where the
 * provider supports it.
 */
export function demonstrationUrl(ref: DemonstrationRef, atSecond?: number): string {
  const seek = atSecond !== undefined && atSecond > 0 ? Math.floor(atSecond) : null;

  if (ref.provider === "youtube") {
    const url = new URL("https://www.youtube.com/watch");
    url.searchParams.set("v", ref.ref);
    if (seek !== null) url.searchParams.set("t", `${seek}s`);
    return url.toString();
  }

  if (ref.provider === "hf_dataset") {
    const [repo, revision] = ref.ref.split("@");
    const base = `https://huggingface.co/datasets/${repo}`;
    return revision ? `${base}/tree/${revision}` : base;
  }

  // A media fragment is the standard way to seek a plain video URL, and a server
  // that does not understand it simply serves the whole file. It replaces any
  // fragment already on the URL rather than appending a second `#`.
  if (seek === null) return ref.ref;
  const url = new URL(ref.ref);
  url.hash = `t=${seek}`;
  return url.toString();
}

export type ResolvedSegment = DemonstrationSegment & {
  /** The same instant as `start`, written the way a person reads it. */
  timestamp: string;
  url: string;
};

export type ResolvedDemonstration = Omit<DemonstrationRef, "segments"> & {
  url: string;
  segments: ResolvedSegment[];
};

/**
 * A demonstration with its links worked out.
 *
 * Every consumer needs the same three things — where the recording is, where
 * each moment inside it is, and how to say that moment out loud — and building
 * a provider-specific URL is exactly the step a caller gets wrong.
 */
export function resolveDemonstration(ref: DemonstrationRef): ResolvedDemonstration {
  return {
    ...ref,
    url: demonstrationUrl(ref),
    segments: ref.segments.map((segment) => ({
      ...segment,
      timestamp: formatTimestamp(segment.start),
      url: demonstrationUrl(ref, segment.start),
    })),
  };
}

const ROLE_LABELS: Record<DemonstrationRole, string> = {
  demonstration: "Demonstration",
  reference: "Reference",
  warning: "What not to do",
};

const PROVIDER_LABELS: Record<DemonstrationProvider, string> = {
  youtube: "YouTube",
  hf_dataset: "Hugging Face dataset",
  url: "Recording",
};

/**
 * Demonstrations as markdown, for every consumer that reads text and nothing
 * else.
 *
 * This is the graceful-degradation half of the design: a model that can watch a
 * video follows the links, and one that cannot still learns that the recording
 * exists, what each moment of it shows, and in what order to perform them.
 */
export function renderDemonstrationsMarkdown(
  refs: DemonstrationRef[],
  options: { heading?: string; headingLevel?: number } = {},
): string {
  if (refs.length === 0) return "";

  const level = Math.min(Math.max(options.headingLevel ?? 3, 1), 6);
  const heading = options.heading ?? "Demonstrations";
  const lines = [`${"#".repeat(level)} ${heading}`, ""];

  if (refs.length > 1) {
    lines.push("Performed in the order listed.", "");
  }

  refs.forEach((ref, index) => {
    const name = ref.title ?? `${ROLE_LABELS[ref.role]} ${index + 1}`;
    const kind = `${PROVIDER_LABELS[ref.provider]}, ${ref.fidelity}`;
    const prefix = refs.length > 1 ? `${index + 1}. ` : "";
    lines.push(`${prefix}**${name}** — [open](${demonstrationUrl(ref)}) (${kind})`);

    if (ref.role === "warning") {
      lines.push(`   This records a failure mode. Do not reproduce it.`);
    }

    if (ref.sha256) {
      lines.push(`   SHA-256: \`${ref.sha256}\``);
    }

    for (const segment of ref.segments) {
      const span = segment.end !== undefined
        ? `${formatTimestamp(segment.start)}–${formatTimestamp(segment.end)}`
        : formatTimestamp(segment.start);
      const link = `[${span}](${demonstrationUrl(ref, segment.start)})`;
      const label = segment.label ? ` **${segment.label}**` : "";
      const comment = segment.comment ? ` — ${segment.comment}` : "";
      lines.push(`   - ${link}${label}${comment}`);
    }

    lines.push("");
  });

  return lines.join("\n").trimEnd();
}

/**
 * The demonstrations of a skill, rendered — or an empty string when it has none.
 * The convenience wrapper the export paths actually want.
 */
export function skillDemonstrationsMarkdown(
  content: string | null | undefined,
  options: { headingLevel?: number } = {},
): string {
  const { demonstrations } = readSkillDemonstrations(content);
  return renderDemonstrationsMarkdown(demonstrations, options);
}
