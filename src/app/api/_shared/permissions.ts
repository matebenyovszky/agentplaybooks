// Write permissions that also grant reading the same area. Editing memory,
// skills, personas, canvas or playbooks means reading them first, so a key
// that holds only `X:write` is not asked to also tick `X:read`.
//
// Secrets are left out on purpose: `secrets:read` authorizes outbound requests
// through the proxy, and a key that may only store or rotate a credential (a
// CI job that refreshes a token) must not gain the right to use it.
const WRITE_IMPLIES_READ = new Set(["memory", "skills", "personas", "canvas", "playbooks"]);

export function grantsPermission(held: readonly string[] | null | undefined, required: string): boolean {
  if (!held) return false;
  if (held.includes("full") || held.includes(required)) return true;

  const [area, action] = required.split(":");
  return action === "read" && WRITE_IMPLIES_READ.has(area) && held.includes(`${area}:write`);
}
