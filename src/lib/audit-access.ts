/**
 * What each human playbook role may do. The auditor role exists for a
 * compliance officer who must read and export the trail, and enough playbook
 * metadata to name it, without reading secret values or changing anything.
 */

export const PLAYBOOK_ACCESS_ROLES = ["owner", "editor", "auditor"] as const;
export type PlaybookAccessRole = (typeof PLAYBOOK_ACCESS_ROLES)[number];

export const COLLABORATOR_ROLES = ["editor", "auditor"] as const;
export type CollaboratorRole = (typeof COLLABORATOR_ROLES)[number];

export const AUDITOR_ALLOWED_PERMISSIONS = new Set(["audit:read", "playbooks:read"]);

export function isCollaboratorRole(value: unknown): value is CollaboratorRole {
  return value === "editor" || value === "auditor";
}

export function roleMayWrite(role: PlaybookAccessRole | null | undefined): role is "owner" | "editor" {
  return role === "owner" || role === "editor";
}

export function roleMayReadAudit(role: PlaybookAccessRole | null | undefined): boolean {
  return role === "owner" || role === "auditor";
}

export function roleMayReadSecrets(role: PlaybookAccessRole | null | undefined): boolean {
  return role === "owner" || role === "editor";
}

export function roleMayPerform(
  role: PlaybookAccessRole | null | undefined,
  permission: string,
): boolean {
  if (!role) return false;
  if (role === "owner") return true;
  if (role === "auditor") return AUDITOR_ALLOWED_PERMISSIONS.has(permission);
  if (permission.startsWith("secrets:")) return roleMayReadSecrets(role);
  return true;
}

export const AUDITOR_PLAYBOOK_METADATA_FIELDS = [
  "id",
  "guid",
  "name",
  "description",
  "visibility",
  "created_at",
  "updated_at",
  "user_id",
  "tags",
] as const;

/** Strip content (persona, skills, servers, instructions) for an auditor. */
export function playbookViewForRole<T extends Record<string, unknown>>(
  playbook: T,
  role: PlaybookAccessRole,
): T | (Pick<T, Extract<keyof T, (typeof AUDITOR_PLAYBOOK_METADATA_FIELDS)[number]>> & { current_user_role: "auditor" }) {
  if (role !== "auditor") return playbook;
  const view: Record<string, unknown> = { current_user_role: "auditor" };
  for (const field of AUDITOR_PLAYBOOK_METADATA_FIELDS) {
    if (field in playbook) view[field] = playbook[field];
  }
  return view as Pick<T, Extract<keyof T, (typeof AUDITOR_PLAYBOOK_METADATA_FIELDS)[number]>> & {
    current_user_role: "auditor";
  };
}

export function auditRetentionDays(env: Record<string, string | undefined> = process.env): number | null {
  const raw = env.AUDIT_RETENTION_DAYS;
  if (raw == null || raw === "" || raw === "0") return null;
  if (raw.toLowerCase() === "forever") return null;
  const days = Number(raw);
  if (!Number.isFinite(days) || days < 1) return null;
  return Math.floor(days);
}
