/** Resolve a local sign-in destination using the browser's URL semantics. */
export function postAuthPath(requested: string | null, origin: string): string {
  if (!requested?.startsWith("/") || requested.startsWith("//") || requested.includes("\\") || /[\u0000-\u0020\u007f]/.test(requested)) {
    return "/dashboard";
  }
  try {
    const destination = new URL(requested, origin);
    if (destination.origin !== origin) return "/dashboard";
    return destination.pathname + destination.search + destination.hash;
  } catch {
    return "/dashboard";
  }
}
