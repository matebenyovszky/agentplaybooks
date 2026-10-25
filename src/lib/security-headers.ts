/**
 * Browser security headers applied by Next.js (`next.config.ts`) and by the
 * Cloudflare Worker path handlers.
 *
 * CSP is enforcing. `connect-src` always allows the hosted Auth wildcard and,
 * when `NEXT_PUBLIC_SUPABASE_URL` is set, that origin (and its websocket
 * scheme) so a self-hosted Auth host is not blocked. `'unsafe-inline'` /
 * `'unsafe-eval'` remain until Next.js can be moved onto nonces (P2).
 */

export function connectSrcFor(supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL): string {
  const parts = ["'self'", "https://*.supabase.co", "wss://*.supabase.co"];
  if (supabaseUrl) {
    try {
      const parsed = new URL(supabaseUrl);
      if (parsed.origin && !parts.includes(parsed.origin)) parts.push(parsed.origin);
      const ws = `${parsed.protocol === "http:" ? "ws:" : "wss:"}//${parsed.host}`;
      if (!parts.includes(ws)) parts.push(ws);
    } catch {
      // Invalid URL: keep the hosted wildcard only.
    }
  }
  return parts.join(" ");
}

export function contentSecurityPolicy(supabaseUrl?: string): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https: http:",
    "font-src 'self' data:",
    `connect-src ${connectSrcFor(supabaseUrl)}`,
    "worker-src 'self' blob:",
  ].join("; ");
}

export function securityHeaders(supabaseUrl?: string): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(supabaseUrl) },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-DNS-Prefetch-Control", value: "off" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
    { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  ];
}

export const SECURITY_HEADERS = securityHeaders();
