import type { PlaybooksUpdate } from "@/lib/supabase/types";

export type HumanPlaybookRole = "owner" | "editor";

/**
 * Central field-level policy for human playbook edits.
 * Editors may change content metadata, but ownership controls stay owner-only.
 */
export function buildPlaybookUpdate(
  body: Record<string, unknown>,
  role: HumanPlaybookRole
): PlaybooksUpdate {
  const update: PlaybooksUpdate = {};
  if (body.name !== undefined) update.name = body.name as PlaybooksUpdate["name"];
  if (body.description !== undefined) update.description = body.description as PlaybooksUpdate["description"];
  if (body.config !== undefined) update.config = body.config as PlaybooksUpdate["config"];
  if (body.tags !== undefined) update.tags = body.tags as PlaybooksUpdate["tags"];
  // Project instructions are content, like the persona and skills, so editors
  // may maintain them.
  if (body.instructions !== undefined) update.instructions = body.instructions as PlaybooksUpdate["instructions"];

  if (role === "owner") {
    if (body.visibility !== undefined) {
      update.visibility = body.visibility as PlaybooksUpdate["visibility"];
    } else if (body.is_public !== undefined) {
      update.visibility = body.is_public ? "public" : "private";
    }
  }

  return update;
}
