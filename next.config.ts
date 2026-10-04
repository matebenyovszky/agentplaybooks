import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { LEGAL_REDIRECTS } from "./src/lib/legal-routes";
import { SECURITY_HEADERS } from "./src/lib/security-headers";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

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
        headers: SECURITY_HEADERS,
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
