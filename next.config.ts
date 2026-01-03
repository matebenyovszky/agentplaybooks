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
  
  // Ignore lint errors during build to prevent failures on Cloudflare
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default withNextIntl(nextConfig);
