import type { MetadataRoute } from "next";
import { locales } from "@/i18n/config";
import { getBlogPosts, type BlogPost } from "@/lib/blog-server";

export const dynamic = "force-static";

const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://agentplaybooks.ai").replace(/\/$/, "");

const paths = [
  "",
  "/docs",
  "/explore",
  "/enterprise",
  "/login",
  "/dashboard",
  "/dashboard/favorites",
  "/dashboard/settings",
];

// This list is updated by scripts/sync-sitemap-docs.ts
const docSlugs = [
  "readme",
  "api-reference",
  "architecture",
  "developer-guide",
  "environment-setup",
  "getting-started",
  "management-api",
  "mcp-integration",
  "memory",
  "platform-integrations",
  "playbooks",
  "self-hosting",
  "skills",
  "roadmap",
];

function buildAlternates(url: string) {
  const languages: Record<string, string> = { "x-default": url };

  for (const locale of locales) {
    languages[locale] = url;
  }

  return { languages };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const baseEntries = paths.map((pathItem) => {
    const url = `${baseUrl}${pathItem}`;

    return {
      url,
      lastModified: now,
      alternates: buildAlternates(url),
    };
  });

  const docEntries = docSlugs
    .filter((slug) => slug !== "readme")
    .map((slug) => {
      const url = `${baseUrl}/docs/${slug}`;

      return {
        url,
        lastModified: now,
        alternates: buildAlternates(url),
      };
    });

  const blogPosts = await getBlogPosts("en");
  const blogEntries = blogPosts.map((post: BlogPost) => {
    const url = `${baseUrl}/blog/${post.slug}`;

    return {
      url,
      lastModified: new Date(post.date),
      alternates: buildAlternates(url),
    };
  });

  return [...baseEntries, ...docEntries, ...blogEntries];
}
