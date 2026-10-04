/** Runtime bindings take precedence; fill public build-time settings once. */
export function applyPublicBuildEnv(target: Record<string, string | undefined>, build: Record<string, string>) {
  for (const [key, value] of Object.entries(build)) target[key] ??= value;
}
