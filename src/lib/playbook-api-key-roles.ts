/**
 * Playbook-scoped API key roles and the permission sets the dashboard offers
 * for each role.
 *
 * Authorization for a non-admin, non-auditor key is the **permissions array**
 * (`grantsPermission` in `src/app/api/_shared/permissions.ts`), not the role
 * label. The create handler must therefore default omitted `permissions` from
 * this table. A previous fallback of `["memory:read", "memory:write"]` gave a
 * raw `role: "viewer"` key the right to write memory.
 */

export const PLAYBOOK_API_KEY_ROLES = [
  "viewer",
  "coworker",
  "proposer",
  "admin",
  "auditor",
] as const;

export type PlaybookApiKeyRole = (typeof PLAYBOOK_API_KEY_ROLES)[number];

export const PLAYBOOK_API_KEY_ROLE_PERMISSIONS: Record<PlaybookApiKeyRole, readonly string[]> = {
  viewer: ["memory:read", "canvas:read", "skills:read", "personas:read", "secrets:read"],
  proposer: [
    "memory:read",
    "memory:propose",
    "canvas:read",
    "skills:read",
    "skills:propose",
    "personas:read",
    "secrets:read",
  ],
  coworker: [
    "memory:read",
    "memory:write",
    "canvas:read",
    "canvas:write",
    "skills:read",
    "skills:write",
    "personas:read",
    "personas:write",
    "secrets:read",
    "secrets:write",
  ],
  auditor: ["audit:read", "playbooks:read"],
  admin: ["full"],
};

export function isPlaybookApiKeyRole(value: unknown): value is PlaybookApiKeyRole {
  return typeof value === "string" && (PLAYBOOK_API_KEY_ROLES as readonly string[]).includes(value);
}

/** Permissions stored when the caller names a role but omits `permissions`. */
export function playbookApiKeyPermissionsForRole(role: string | null | undefined): string[] {
  const key: PlaybookApiKeyRole = isPlaybookApiKeyRole(role) ? role : "viewer";
  return [...PLAYBOOK_API_KEY_ROLE_PERMISSIONS[key]];
}
