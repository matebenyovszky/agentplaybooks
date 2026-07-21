export type HumanPlaybookRole = "owner" | "editor";

/**
 * Central field-level policy for human playbook edits.
 * Editors may change content metadata, but ownership controls stay owner-only.
 */
export function buildPlaybookUpdate(
  body: Record<string, unknown>,
  role: HumanPlaybookRole
): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  if (body.name !== undefined) update.name = body.name;
  if (body.description !== undefined) update.description = body.description;
  if (body.config !== undefined) update.config = body.config;
  if (body.tags !== undefined) update.tags = body.tags;

  if (role === "owner") {
    if (body.visibility !== undefined) {
      update.visibility = body.visibility;
    } else if (body.is_public !== undefined) {
      update.visibility = body.is_public ? "public" : "private";
    }
  }

  return update;
}
