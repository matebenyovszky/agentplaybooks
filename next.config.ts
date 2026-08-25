import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { LEGAL_REDIRECTS } from "./src/lib/legal-routes";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https: http:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "worker-src 'self' blob:",
].join("; ");

const nextConfig: NextConfig = {
  // Cloudflare Pages compatible settings
  output: "standalone",
  poweredByHeader: false,

  async redirects() {
    return [...LEGAL_REDIRECTS];
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },

  // Disable image optimization (use Cloudflare Images instead)
  images: {
    unoptimized: true,
  },

  // Next 16 removed the built-in lint step from `next build`, and with it the
  // `eslint` config key. Linting stays a gate, it just lives where it already
  // ran: `npm run lint` in CI.
};

export default withNextIntl(nextConfig);
