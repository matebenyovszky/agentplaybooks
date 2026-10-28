import { getServerServiceSupabase as getServiceSupabase } from "@/lib/supabase/server";
import type { Playbook } from "@/lib/supabase/types";
import { generateGuid } from "@/lib/utils";
import { playbookViewForRole, type PlaybookAccessRole } from "@/lib/audit-access";

export type { PlaybookAccessRole };

export type PlaybookListItem = Playbook & {
  skill_count: number;
  mcp_server_count: number;
  memory_count: number;
  current_user_role: PlaybookAccessRole;
};

type PlaybookWithCounts = Playbook & {
  skills?: Array<{ count: number }>;
  mcp_servers?: Array<{ count: number }>;
  memories?: Array<{ count: number }>;
};

/** Resolve the public profile row used by publisher_id from an Auth user ID. */
export async function getPublisherIdForAuthUser(userId: string): Promise<string> {
  const { data, error } = await getServiceSupabase()
    .from("profiles")
    .select("id")
    .eq("auth_user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`Failed to resolve publisher profile: ${error.message}`);
  if (data?.id) return data.id;

  // API-first/self-hosted signups may not have visited the profile screen yet.
  // Ignore a concurrent insert: never replace an existing publisher's details.
  const supabase = getServiceSupabase();
  const { error: creationError } = await supabase.from("profiles").upsert({
    id: userId,
    auth_user_id: userId,
    display_name: "User",
    avatar_svg: null, website_url: null, description: null,
    is_verified: false, is_virtual: false, updated_at: new Date().toISOString(),
  }, { onConflict: "auth_user_id", ignoreDuplicates: true });
  if (creationError) throw new Error(`Failed to create publisher profile: ${creationError.message}`);
  const { data: profile, error: lookupError } = await supabase.from("profiles")
    .select("id").eq("auth_user_id", userId).maybeSingle();
  if (lookupError) throw new Error(`Failed to resolve publisher profile: ${lookupError.message}`);
  if (!profile?.id) throw new Error("Publisher profile could not be resolved.");
  return profile.id;
}

function withCounts(
  rows: PlaybookWithCounts[],
  roleFor: (playbookId: string) => PlaybookAccessRole,
): PlaybookListItem[] {
  return rows.map((row) => {
    const { skills, mcp_servers, memories, ...playbook } = row;
    const role = roleFor(playbook.id);
    const listed = {
      ...playbook,
      current_user_role: role,
      skill_count: skills?.[0]?.count || 0,
      mcp_server_count: mcp_servers?.[0]?.count || 0,
      memory_count: memories?.[0]?.count || 0,
    };
    return (role === "auditor"
      ? { ...playbookViewForRole(listed as unknown as Record<string, unknown>, "auditor"), skill_count: listed.skill_count, mcp_server_count: listed.mcp_server_count, memory_count: listed.memory_count }
      : listed) as PlaybookListItem;
  });
}

function isMissingCollaborationTable(error: { code?: string; message?: string }): boolean {
  return error.code === "42P01"
    || error.code === "PGRST205"
    || Boolean(error.message?.includes("playbook_collaborators"));
}

const playbookListSelection = (summary: boolean) => `
  ${summary ? "id,guid,user_id,name,description,visibility,updated_at" : "*"},
  skills:skills(count),
  mcp_servers:mcp_servers(count),
  memories:memories(count)
`;

export type PlaybookListSummary = Pick<PlaybookListItem,
  "id" | "guid" | "user_id" | "name" | "description" | "visibility" | "updated_at"
  | "skill_count" | "mcp_server_count" | "memory_count" | "current_user_role"
>;

export function listAccessiblePlaybooks(userId: string): Promise<PlaybookListItem[]>;
export function listAccessiblePlaybooks(userId: string, summary: true): Promise<PlaybookListSummary[]>;
export async function listAccessiblePlaybooks(
  userId: string,
  summary = false,
): Promise<PlaybookListItem[] | PlaybookListSummary[]> {
  const supabase = getServiceSupabase();

  // These independent reads used to cost two sequential database round trips.
  const [ownedResult, membershipResult] = await Promise.all([
    supabase.from("playbooks")
      .select(playbookListSelection(summary))
      .eq("user_id", userId)
      .order("updated_at", { ascending: false }),
    supabase.from("playbook_collaborators")
      .select("playbook_id, role")
      .eq("user_id", userId)
      .not("accepted_at", "is", null),
  ]);
  const { data: ownedData, error: ownedError } = ownedResult;
  const { data: memberships, error: membershipError } = membershipResult;
  if (ownedError) throw new Error(ownedError.message);

  // Collaboration was introduced after owned playbooks. A deployment that has
  // not applied that optional migration must still show the owner's data.
  if (membershipError && !isMissingCollaborationTable(membershipError)) {
    throw new Error(membershipError.message);
  }

  const sharedIds = (memberships || []).map(({ playbook_id }) => playbook_id);
  const roleByPlaybook = new Map<string, PlaybookAccessRole>(
    (memberships || []).map((row) => [
      row.playbook_id,
      row.role === "auditor" ? "auditor" : "editor",
    ]),
  );
  let sharedData: typeof ownedData = [];
  if (sharedIds.length > 0) {
    const sharedResult = await supabase
      .from("playbooks")
      .select(playbookListSelection(summary))
      .in("id", sharedIds)
      .order("updated_at", { ascending: false });
    if (sharedResult.error) throw new Error(sharedResult.error.message);
    sharedData = sharedResult.data || [];
  }

  return [
    ...withCounts((ownedData || []) as unknown as PlaybookWithCounts[], () => "owner"),
    ...withCounts((sharedData || []) as unknown as PlaybookWithCounts[], (id) => roleByPlaybook.get(id) ?? "editor"),
  ].sort(
    (left, right) =>
      new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
  );
}

export type CreatePlaybookInput = {
  name: string;
  description?: string | null;
  visibility?: "public" | "private" | "unlisted";
  config?: Record<string, unknown>;
  tags?: string[];
  persona_name?: string | null;
  persona_system_prompt?: string | null;
  persona_metadata?: Record<string, unknown>;
  /** Always-on project instructions (AGENTS.md / CLAUDE.md content). */
  instructions?: string | null;
};

export type CreatePlaybookOptions = {
  /** Trusted server-side attribution override, used only when forking a playbook. */
  publisherId?: string;
};

/** Parse the canonical create payload used by REST, MCP, and the dashboard. */
export function parseCreatePlaybookInput(body: unknown):
  | { input: CreatePlaybookInput }
  | { error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Name is required" };
  }

  const value = body as Record<string, unknown>;
  if (typeof value.name !== "string" || value.name.trim().length === 0) {
    return { error: "Name is required" };
  }

  const visibility = value.visibility
    ?? (typeof value.is_public === "boolean"
      ? value.is_public ? "public" : "private"
      : "private");
  if (visibility !== "public" && visibility !== "private" && visibility !== "unlisted") {
    return { error: "Invalid visibility" };
  }

  if (value.instructions !== undefined
    && value.instructions !== null
    && typeof value.instructions !== "string") {
    return { error: "Invalid instructions" };
  }

  return {
    input: {
      name: value.name.trim(),
      description: typeof value.description === "string" ? value.description : null,
      visibility,
      config: value.config && typeof value.config === "object" && !Array.isArray(value.config)
        ? value.config as Record<string, unknown>
        : {},
      tags: Array.isArray(value.tags)
        ? value.tags.filter((tag): tag is string => typeof tag === "string")
        : [],
      persona_name: typeof value.persona_name === "string" ? value.persona_name : null,
      persona_system_prompt: typeof value.persona_system_prompt === "string"
        ? value.persona_system_prompt
        : null,
      persona_metadata: value.persona_metadata
        && typeof value.persona_metadata === "object"
        && !Array.isArray(value.persona_metadata)
        ? value.persona_metadata as Record<string, unknown>
        : {},
      instructions: typeof value.instructions === "string" ? value.instructions : null,
    },
  };
}

export async function createPlaybook(
  userId: string,
  input: CreatePlaybookInput,
  options: CreatePlaybookOptions = {},
) {
  const supabase = getServiceSupabase();
  const publisherId = options.publisherId ?? await getPublisherIdForAuthUser(userId);
  const { data, error } = await supabase
    .from("playbooks")
    .insert({
      user_id: userId,
      publisher_id: publisherId,
      guid: generateGuid(),
      name: input.name,
      description: input.description || null,
      visibility: input.visibility || "private",
      config: input.config || {},
      tags: input.tags || [],
      persona_name: input.persona_name || null,
      persona_system_prompt: input.persona_system_prompt || null,
      persona_metadata: input.persona_metadata || {},
      instructions: input.instructions || null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Created playbook could not be read back.");
  return data;
}

/** Copy content atomically, keeping attribution and assigning new ownership. */
export async function forkPlaybook(userId: string, sourceId: string): Promise<Playbook> {
  const { data, error } = await getServiceSupabase().rpc("fork_playbook_with_content", {
    p_source_id: sourceId,
    p_user_id: userId,
    p_guid: generateGuid(),
  });
  if (error) {
    if (error.code === "P0002") throw new Error("Playbook not found");
    throw new Error("Failed to copy playbook content");
  }
  if (!data || typeof data !== "object" || !("id" in data)) {
    throw new Error("Copied playbook could not be read back");
  }
  return data as Playbook;
}
