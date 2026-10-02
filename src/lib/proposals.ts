import type { SupabaseClient } from "@supabase/supabase-js";
import { validateAgentSkillDescription, validateAgentSkillName } from "@/lib/agent-skills";
import { memoryWriteFields } from "@/lib/memory";
import { findPlaybookSkill } from "@/lib/repositories/skills";

/**
 * Proposals: a suggested skill change or memory entry that waits for the
 * playbook's owner or an editor. This is how a team's shared knowledge grows
 * without every contributor holding write access: an agent (or a person)
 * proposes, a human reviews, and only an approval writes to the playbook.
 */

export type ProposalKind = "skill" | "memory";

export type SkillProposalPayload = {
  name: string;
  description: string;
  content: string;
};

export type MemoryProposalPayload = {
  key: string;
  value: unknown;
  summary?: string;
  description?: string;
  tier?: "working" | "contextual" | "longterm";
  tags?: string[];
};

export type ProposalInput =
  | { kind: "skill"; target: string; payload: SkillProposalPayload; rationale: string | null }
  | { kind: "memory"; target: string; payload: MemoryProposalPayload; rationale: string | null };

export type StoredProposal = {
  id: string;
  kind: ProposalKind;
  target: string;
  payload: SkillProposalPayload | MemoryProposalPayload;
};

/** A busy inbox is fine; an unbounded one is a way to fill the database. */
export const MAX_PENDING_PROPOSALS = 500;

const MAX_SKILL_CONTENT = 200_000;
const MAX_MEMORY_VALUE_BYTES = 65_536;
const MAX_RATIONALE = 4_000;
const MEMORY_TIERS = ["working", "contextual", "longterm"] as const;
const MEMORY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:\/-]{0,199}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function optionalString(value: unknown, field: string, max: number): string | undefined | { error: string } {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || value.length > max) return { error: `${field} must be a string of at most ${max} characters` };
  return value;
}

/** Validate a submission body. Returns the normalized proposal or an error message. */
export function parseProposalInput(body: unknown): ProposalInput | { error: string } {
  if (!isRecord(body)) return { error: "Body must be a JSON object" };
  const rationale = optionalString(body.rationale, "rationale", MAX_RATIONALE);
  if (isRecord(rationale)) return rationale;
  if (!isRecord(body.payload)) return { error: "payload must be an object" };
  const payload = body.payload;

  if (body.kind === "skill") {
    const nameError = validateAgentSkillName(payload.name);
    if (nameError) return { error: nameError };
    const descriptionError = validateAgentSkillDescription(payload.description);
    if (descriptionError) return { error: descriptionError };
    if (typeof payload.content !== "string" || payload.content.length === 0 || payload.content.length > MAX_SKILL_CONTENT) {
      return { error: `payload.content must be a non-empty string of at most ${MAX_SKILL_CONTENT} characters` };
    }
    return {
      kind: "skill",
      target: payload.name as string,
      payload: { name: payload.name as string, description: payload.description as string, content: payload.content },
      rationale: rationale ?? null,
    };
  }

  if (body.kind === "memory") {
    if (typeof payload.key !== "string" || !MEMORY_KEY.test(payload.key)) {
      return { error: "payload.key must be 1-200 characters: letters, digits and . _ : / -" };
    }
    if (payload.value === undefined) return { error: "payload.value is required" };
    if (new TextEncoder().encode(JSON.stringify(payload.value)).length > MAX_MEMORY_VALUE_BYTES) {
      return { error: `payload.value must be at most ${MAX_MEMORY_VALUE_BYTES} bytes as JSON` };
    }
    const summary = optionalString(payload.summary, "payload.summary", 500);
    if (isRecord(summary)) return summary;
    const description = optionalString(payload.description, "payload.description", 2_000);
    if (isRecord(description)) return description;
    if (payload.tier !== undefined && !MEMORY_TIERS.includes(payload.tier as typeof MEMORY_TIERS[number])) {
      return { error: `payload.tier must be one of ${MEMORY_TIERS.join(", ")}` };
    }
    if (payload.tags !== undefined && (!Array.isArray(payload.tags) || payload.tags.length > 20
        || payload.tags.some((tag) => typeof tag !== "string" || tag.length > 50))) {
      return { error: "payload.tags must be at most 20 strings of at most 50 characters" };
    }
    return {
      kind: "memory",
      target: payload.key,
      payload: {
        key: payload.key,
        value: payload.value,
        ...(summary !== undefined ? { summary } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(payload.tier !== undefined ? { tier: payload.tier as MemoryProposalPayload["tier"] } : {}),
        ...(payload.tags !== undefined ? { tags: payload.tags as string[] } : {}),
      },
      rationale: rationale ?? null,
    };
  }

  return { error: "kind must be 'skill' or 'memory'" };
}

/**
 * Write an approved proposal to its playbook. A skill proposal updates the
 * skill of that name (the skill_versions trigger keeps the previous text) or
 * creates it; a memory proposal upserts the key (memory_history keeps the
 * previous value). Returns what was written: the skill id or the memory key.
 */
export async function applyProposal(
  supabase: SupabaseClient,
  playbookId: string,
  proposal: StoredProposal,
): Promise<string> {
  if (proposal.kind === "skill") {
    const payload = proposal.payload as SkillProposalPayload;
    const existing = await findPlaybookSkill(supabase, playbookId, payload.name);
    if (existing) {
      const { error } = await supabase
        .from("skills")
        .update({ description: payload.description, content: payload.content })
        .eq("id", existing.id)
        .eq("playbook_id", playbookId);
      if (error) throw new Error(error.message);
      return existing.id;
    }
    const { data, error } = await supabase
      .from("skills")
      .insert({ playbook_id: playbookId, name: payload.name, description: payload.description, content: payload.content })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return (data as { id: string }).id;
  }

  const payload = proposal.payload as MemoryProposalPayload;
  const { error } = await supabase
    .from("memories")
    .upsert({
      playbook_id: playbookId,
      key: payload.key,
      value: payload.value,
      ...memoryWriteFields({ value: payload.value }),
      ...(payload.summary !== undefined ? { summary: payload.summary } : {}),
      ...(payload.description !== undefined ? { description: payload.description } : {}),
      ...(payload.tier !== undefined ? { tier: payload.tier } : {}),
      ...(payload.tags !== undefined ? { tags: payload.tags } : {}),
      metadata: { source: "proposal", proposal_id: proposal.id },
    }, { onConflict: "playbook_id,key" })
    .select("key")
    .single();
  if (error) throw new Error(error.message);
  return payload.key;
}
