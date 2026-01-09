import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Cloudflare Pages compatible settings
  output: "standalone",

  // Disable image optimization (use Cloudflare Images instead)
  images: {
    unoptimized: true,
  },

  // ESLint should run during build - fix lint errors instead of ignoring them
  eslint: {
    ignoreDuringBuilds: false,
  },
};

export default withNextIntl(nextConfig);
