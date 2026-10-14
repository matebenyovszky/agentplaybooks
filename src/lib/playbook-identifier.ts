/**
 * A playbook has two identifiers: `id`, the database UUID, and `guid`, the
 * short public one in every URL. People and agents hold whichever they were
 * shown, so every endpoint accepts either, and these decide which one it is.
 */

const PLAYBOOK_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The `playbooks` column an identifier from a request refers to. */
export function playbookIdentifierColumn(identifier: string): "id" | "guid" {
  return PLAYBOOK_UUID.test(identifier) ? "id" : "guid";
}

/** Whether an identifier from a request names this playbook, by either form. */
export function matchesPlaybook(
  playbook: { id: string; guid: string } | null | undefined,
  identifier: string | undefined,
): boolean {
  return Boolean(playbook && identifier && (identifier === playbook.guid || identifier === playbook.id));
}
