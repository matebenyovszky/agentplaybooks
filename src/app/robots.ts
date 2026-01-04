import type { MetadataRoute } from "next";

const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://agentplaybooks.ai").replace(/\/$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // Standard search engines
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard", "/api"],
      },
      // AI search engines and crawlers - explicitly allow
      {
        userAgent: "GPTBot",
        allow: "/",
        disallow: ["/dashboard"],
      },
      {
        userAgent: "ChatGPT-User",
        allow: "/",
        disallow: ["/dashboard"],
      },
      {
        userAgent: "Claude-Web",
        allow: "/",
        disallow: ["/dashboard"],
      },
      {
        userAgent: "PerplexityBot",
        allow: "/",
        disallow: ["/dashboard"],
      },
      {
        userAgent: "Anthropic-AI",
        allow: "/",
        disallow: ["/dashboard"],
      },
      {
        userAgent: "Google-Extended",
        allow: "/",
        disallow: ["/dashboard"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}