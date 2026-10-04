import { SECURITY_HEADERS } from "../lib/security-headers";

// Only unused root namespaces/files. Do not match arbitrary API identifiers,
// canvas slugs, skills, or .well-known discovery paths containing these names.
const PROBE_NAMESPACES = /^\/(?:_ignition|_profiler|_debugbar|wp-admin|wp-content|wp-includes|\.git|\.aws|\.docker|vendor\/(?:phpunit|composer))(?:\/|$)/i;
const PROBE_FILES = /^\/(?:\.env(?:[.\w-]*)?|\.s3cfg|\.npmrc|\.htaccess|\.htpasswd|phpinfo(?:\.php)?|info\.php|config\.yaml|settings\.json|credentials\.json|secrets\.json|database\.sql|sendgrid\.env|env\.txt|env-config\.js|runtime-config\.js|app\.config\.js|hotjar\.json|Dockerfile|index\.js)$/i;

export function rejectProbeRequest(request: Request): Response | null {
  const url = new URL(request.url);
  // Decode only for matching; the request used by real route handlers is intact.
  let path: string;
  try { path = decodeURIComponent(url.pathname); } catch { return null; }
  if (!PROBE_NAMESPACES.test(path) && !PROBE_FILES.test(path)) return null;
  const headers = new Headers({ "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
  for (const { key, value } of SECURITY_HEADERS) headers.set(key, value);
  return new Response(request.method === "HEAD" ? null : "Not Found", { status: 404, headers });
}
