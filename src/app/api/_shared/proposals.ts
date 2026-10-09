import type { SupabaseClient } from "@supabase/supabase-js";

// Proposals for review. A key with memory:propose or skills:propose suggests a
// change instead of making it; the owner or an editor approves or rejects it.
// Pending proposals live next to the history they would join (memory_history,
// skill_versions) with review_status set, which every data read skips — see
// supabase/migrations/20261002120000_review_proposals.sql.

export type ProposalKind = "memory" | "skill";
export type ReviewDecision = "approve" | "reject";

// Either an api_keys row (validateApiKey) or a path-bound credential
// (validatePlaybookCredential), which may also be a member's user key.
export type ProposerCredential = {
  id?: string;
  name?: string | null;
  kind?: string;
  key_prefix?: string | null;
};

type Proposer = { apiKeyId: string | null; label: string };

export type Proposal = {
  id: string;
  kind: ProposalKind;
  target: string;
  is_new: boolean;
  proposed: Record<string, unknown>;
  proposed_by: string | null;
  proposed_at: string;
};

// Fields a memory proposal may carry: what write_memory itself would store.
const MEMORY_FIELDS = [
  "value", "tags", "description", "tier", "priority", "parent_key", "summary",
  "memory_type", "status", "metadata", "memory_at", "is_archived",
] as const;

async function describeProposer(supabase: SupabaseClient, playbookId: string, credential: ProposerCredential): Promise<Proposer> {
  const prefix = credential.key_prefix && !credential.key_prefix.startsWith("session:") ? `${credential.key_prefix}…` : null;
  if (credential.kind === undefined && credential.id) {
    return { apiKeyId: credential.id, label: [credential.name, prefix].filter(Boolean).join(" ") || "API key" };
  }
  if (credential.kind === "playbook_key" && credential.key_prefix) {
    const { data } = await supabase
      .from("api_keys")
      .select("id, name")
      .eq("playbook_id", playbookId)
      .eq("key_prefix", credential.key_prefix)
      .maybeSingle();
    return { apiKeyId: (data?.id as string | undefined) ?? null, label: [data?.name, prefix].filter(Boolean).join(" ") || "API key" };
  }
  if (credential.kind === "user_key") return { apiKeyId: null, label: `user key ${prefix ?? ""}`.trim() };
  return { apiKeyId: null, label: "dashboard" };
}

const pendingResult = (kind: ProposalKind, id: string, target: string) => ({
  status: "pending_review",
  kind,
  proposal_id: id,
  target,
  message: "Saved as a proposal. The playbook owner or an editor will review it; it has no effect until approved.",
});

export async function proposeMemory(
  supabase: SupabaseClient,
  playbookId: string,
  key: string,
  fields: Record<string, unknown>,
  credential: ProposerCredential,
) {
  const proposer = await describeProposer(supabase, playbookId, credential);
  const { data: current, error: lookupError } = await supabase
    .from("memories")
    .select("id")
    .eq("playbook_id", playbookId)
    .eq("key", key)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);

  const snapshot: Record<string, unknown> = { key };
  for (const field of MEMORY_FIELDS) if (fields[field] !== undefined) snapshot[field] = fields[field];

  const { data, error } = await supabase
    .from("memory_history")
    .insert({
      memory_id: current?.id ?? null,
      playbook_id: playbookId,
      snapshot,
      memory_at: (fields.memory_at as string | undefined) ?? new Date().toISOString(),
      review_status: "pending",
      proposed_by: proposer.label,
      proposed_by_api_key_id: proposer.apiKeyId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return pendingResult("memory", data.id as string, key);
}

export async function proposeSkill(
  supabase: SupabaseClient,
  playbookId: string,
  skill: { id: string | null; name: string; description: string | null; content: string | null },
  credential: ProposerCredential,
) {
  const proposer = await describeProposer(supabase, playbookId, credential);
  const { data, error } = await supabase
    .from("skill_versions")
    .insert({
      skill_id: skill.id,
      playbook_id: playbookId,
      name: skill.name,
      description: skill.description,
      content: skill.content,
      change_type: "PROPOSAL",
      review_status: "pending",
      proposed_by: proposer.label,
      changed_by_api_key_id: proposer.apiKeyId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return pendingResult("skill", data.id as string, skill.name);
}

export async function listProposals(supabase: SupabaseClient, playbookId: string, kinds: ProposalKind[]) {
  const proposals: Proposal[] = [];
  if (kinds.includes("memory")) {
    const { data, error } = await supabase
      .from("memory_history")
      .select("id, memory_id, snapshot, proposed_by, recorded_at")
      .eq("playbook_id", playbookId)
      .eq("review_status", "pending")
      .order("recorded_at", { ascending: true });
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const { key, ...proposed } = (row.snapshot ?? {}) as Record<string, unknown>;
      proposals.push({
        id: row.id as string,
        kind: "memory",
        target: String(key ?? ""),
        is_new: row.memory_id === null,
        proposed,
        proposed_by: (row.proposed_by as string | null) ?? null,
        proposed_at: row.recorded_at as string,
      });
    }
  }
  if (kinds.includes("skill")) {
    const { data, error } = await supabase
      .from("skill_versions")
      .select("id, skill_id, name, description, content, proposed_by, recorded_at")
      .eq("playbook_id", playbookId)
      .eq("review_status", "pending")
      .order("recorded_at", { ascending: true });
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      proposals.push({
        id: row.id as string,
        kind: "skill",
        target: row.name as string,
        is_new: row.skill_id === null,
        proposed: { name: row.name, description: row.description, content: row.content },
        proposed_by: (row.proposed_by as string | null) ?? null,
        proposed_at: row.recorded_at as string,
      });
    }
  }
  return proposals;
}

async function markReviewed(supabase: SupabaseClient, table: string, id: string, status: string, extra: Record<string, unknown> = {}) {
  const { error } = await supabase
    .from(table)
    .update({ review_status: status, reviewed_at: new Date().toISOString(), ...extra })
    .eq("id", id)
    .eq("review_status", "pending");
  if (error) throw new Error(error.message);
}

export async function reviewProposal(
  supabase: SupabaseClient,
  playbookId: string,
  kind: ProposalKind,
  id: string,
  decision: ReviewDecision,
) {
  const table = kind === "memory" ? "memory_history" : "skill_versions";
  const { data: row, error } = await supabase
    .from(table)
    .select("*")
    .eq("id", id)
    .eq("playbook_id", playbookId)
    .eq("review_status", "pending")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return null;

  if (decision === "reject") {
    await markReviewed(supabase, table, id, "rejected");
    return { id, kind, status: "rejected" };
  }

  if (kind === "memory") {
    const snapshot = (row.snapshot ?? {}) as Record<string, unknown>;
    const { data, error: writeError } = await supabase
      .from("memories")
      .upsert({ ...snapshot, playbook_id: playbookId, updated_at: new Date().toISOString() }, { onConflict: "playbook_id,key" })
      .select("id, key")
      .single();
    if (writeError) throw new Error(writeError.message);
    await markReviewed(supabase, table, id, "approved", { memory_id: data.id });
    return { id, kind, status: "approved", target: data.key as string };
  }

  const fields = { name: row.name, description: row.description, content: row.content };
  let skillId = row.skill_id as string | null;
  if (skillId) {
    const { data, error: updateError } = await supabase
      .from("skills")
      .update(fields)
      .eq("id", skillId)
      .eq("playbook_id", playbookId)
      .select("id")
      .maybeSingle();
    if (updateError) throw new Error(updateError.message);
    if (!data) skillId = null;
  }
  if (!skillId) {
    const { data, error: insertError } = await supabase
      .from("skills")
      .insert({ ...fields, playbook_id: playbookId, priority: 50 })
      .select("id")
      .single();
    if (insertError) throw new Error(insertError.message);
    skillId = data.id as string;
  }
  await markReviewed(supabase, table, id, "approved", { skill_id: skillId });
  return { id, kind, status: "approved", target: row.name as string };
}
