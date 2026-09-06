import { createServerClient } from "@/lib/supabase/client";
import type { Playbook } from "@/lib/supabase/types";
import { generateGuid } from "@/lib/utils";

export type PlaybookAccessRole = "owner" | "editor";

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

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for privileged database access.",
    );
  }
  return createServerClient(url, key);
}

function withCounts(
  rows: PlaybookWithCounts[],
  role: PlaybookAccessRole,
): PlaybookListItem[] {
  return rows.map((row) => {
    const { skills, mcp_servers, memories, ...playbook } = row;
    return {
      ...playbook,
      current_user_role: role,
      skill_count: skills?.[0]?.count || 0,
      mcp_server_count: mcp_servers?.[0]?.count || 0,
      memory_count: memories?.[0]?.count || 0,
    };
  });
}

function isMissingCollaborationTable(error: { code?: string; message?: string }): boolean {
  return error.code === "42P01"
    || error.code === "PGRST205"
    || Boolean(error.message?.includes("playbook_collaborators"));
}

const playbookListSelection = `
  *,
  skills:skills(count),
  mcp_servers:mcp_servers(count),
  memories:memories(count)
`;

export async function listAccessiblePlaybooks(
  userId: string,
): Promise<PlaybookListItem[]> {
  const supabase = getServiceSupabase();

  const { data: ownedData, error: ownedError } = await supabase
    .from("playbooks")
    .select(playbookListSelection)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (ownedError) throw new Error(ownedError.message);

  const { data: memberships, error: membershipError } = await supabase
    .from("playbook_collaborators")
    .select("playbook_id")
    .eq("user_id", userId)
    .not("accepted_at", "is", null);

  // Collaboration was introduced after owned playbooks. A deployment that has
  // not applied that optional migration must still show the owner's data.
  if (membershipError && !isMissingCollaborationTable(membershipError)) {
    throw new Error(membershipError.message);
  }

  const sharedIds = (memberships || []).map(({ playbook_id }) => playbook_id);
  let sharedData: typeof ownedData = [];
  if (sharedIds.length > 0) {
    const sharedResult = await supabase
      .from("playbooks")
      .select(playbookListSelection)
      .in("id", sharedIds)
      .order("updated_at", { ascending: false });
    if (sharedResult.error) throw new Error(sharedResult.error.message);
    sharedData = sharedResult.data || [];
  }

  return [
    ...withCounts((ownedData || []) as unknown as PlaybookWithCounts[], "owner"),
    ...withCounts((sharedData || []) as unknown as PlaybookWithCounts[], "editor"),
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
) {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("playbooks")
    .insert({
      user_id: userId,
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
