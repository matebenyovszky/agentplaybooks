import {
  and,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNotNull,
  sql,
} from "drizzle-orm";
import {
  getDatabaseDialect,
  getDb,
  hasDirectDatabaseConnection,
  schema,
} from "@/lib/db";
import { createServerClient } from "@/lib/supabase/client";
import type { Playbook } from "@/lib/supabase/types";
import { generateGuid } from "@/lib/utils";

export type PlaybookAccessRole = "owner" | "editor";

export type PlaybookListItem = typeof schema.playbooks.$inferSelect & {
  skill_count: number;
  mcp_server_count: number;
  memory_count: number;
  current_user_role: PlaybookAccessRole;
};

type SupabasePlaybookListItem = Playbook & {
  skill_count: number;
  mcp_server_count: number;
  memory_count: number;
  current_user_role: PlaybookAccessRole;
};

type SupabasePlaybookWithCounts = Playbook & {
  skills?: Array<{ count: number }>;
  mcp_servers?: Array<{ count: number }>;
  memories?: Array<{ count: number }>;
};

function shouldUseSupabaseDataApi(): boolean {
  return getDatabaseDialect() === "postgres" && !hasDirectDatabaseConnection();
}

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required when no direct database connection is configured.",
    );
  }
  return createServerClient(url, key);
}

function withCounts(
  rows: SupabasePlaybookWithCounts[],
  role: PlaybookAccessRole,
): SupabasePlaybookListItem[] {
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

async function listAccessiblePlaybooksViaSupabase(
  userId: string,
): Promise<SupabasePlaybookListItem[]> {
  const supabase = getServiceSupabase();
  const selection = `
    *,
    skills:skills(count),
    mcp_servers:mcp_servers(count),
    memories:memories(count)
  `;

  const { data: ownedData, error: ownedError } = await supabase
    .from("playbooks")
    .select(selection)
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
      .select(selection)
      .in("id", sharedIds)
      .order("updated_at", { ascending: false });
    if (sharedResult.error) throw new Error(sharedResult.error.message);
    sharedData = sharedResult.data || [];
  }

  return [
    ...withCounts((ownedData || []) as unknown as SupabasePlaybookWithCounts[], "owner"),
    ...withCounts((sharedData || []) as unknown as SupabasePlaybookWithCounts[], "editor"),
  ].sort(
    (left, right) =>
      new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
  );
}

const playbookListSelection = {
  ...getTableColumns(schema.playbooks),
  skill_count: sql<number>`(
    select cast(count(*) as int)
    from ${schema.skills}
    where ${schema.skills.playbook_id} = ${schema.playbooks.id}
  )`,
  mcp_server_count: sql<number>`(
    select cast(count(*) as int)
    from ${schema.mcpServers}
    where ${schema.mcpServers.playbook_id} = ${schema.playbooks.id}
  )`,
  memory_count: sql<number>`(
    select cast(count(*) as int)
    from ${schema.memories}
    where ${schema.memories.playbook_id} = ${schema.playbooks.id}
  )`,
};

export async function listAccessiblePlaybooks(
  userId: string,
): Promise<PlaybookListItem[] | SupabasePlaybookListItem[]> {
  if (shouldUseSupabaseDataApi()) {
    return listAccessiblePlaybooksViaSupabase(userId);
  }

  const db = getDb();
  const owned = await db
    .select(playbookListSelection)
    .from(schema.playbooks)
    .where(eq(schema.playbooks.user_id, userId))
    .orderBy(desc(schema.playbooks.updated_at));

  const memberships = await db
    .select({ playbook_id: schema.playbookCollaborators.playbook_id })
    .from(schema.playbookCollaborators)
    .where(and(
      eq(schema.playbookCollaborators.user_id, userId),
      isNotNull(schema.playbookCollaborators.accepted_at),
    ));

  const sharedIds = memberships.map(({ playbook_id }) => playbook_id);
  const shared = sharedIds.length === 0
    ? []
    : await db
      .select(playbookListSelection)
      .from(schema.playbooks)
      .where(inArray(schema.playbooks.id, sharedIds))
      .orderBy(desc(schema.playbooks.updated_at));

  return [
    ...owned.map((playbook) => ({
      ...playbook,
      current_user_role: "owner" as const,
    })),
    ...shared.map((playbook) => ({
      ...playbook,
      current_user_role: "editor" as const,
    })),
  ].sort(
    (left, right) =>
      right.updated_at.getTime() - left.updated_at.getTime(),
  );
}

export type CreatePlaybookInput = {
  name: string;
  description?: string | null;
  visibility?: "public" | "private" | "unlisted";
  config?: Record<string, unknown>;
};

export async function createPlaybook(
  userId: string,
  input: CreatePlaybookInput,
) {
  if (shouldUseSupabaseDataApi()) {
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
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    if (!data) throw new Error("Created playbook could not be read back.");
    return data;
  }

  const db = getDb();
  const id = crypto.randomUUID();

  await db.insert(schema.playbooks).values({
    id,
    user_id: userId,
    guid: generateGuid(),
    name: input.name,
    description: input.description || null,
    visibility: input.visibility || "private",
    config: input.config || {},
  });

  const [created] = await db
    .select()
    .from(schema.playbooks)
    .where(eq(schema.playbooks.id, id))
    .limit(1);

  if (!created) {
    throw new Error("Created playbook could not be read back.");
  }

  return created;
}
