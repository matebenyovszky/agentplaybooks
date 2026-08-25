import type { MetadataRoute } from "next";
import { locales } from "@/i18n/config";
import { getBlogPosts, type BlogPost } from "@/lib/blog-server";
import { LEGAL_CANONICAL_PATHS } from "@/lib/legal-routes";
import { SITE_URL } from "@/lib/site-url";

export const dynamic = "force-static";

const baseUrl = SITE_URL;

// `/login` and `/dashboard*` are deliberately absent: robots.txt disallows
// `/dashboard`, and listing a disallowed path in the sitemap sends crawlers
// contradictory signals about the same URL.
const paths = [
  "",
  "/docs",
  "/blog",
  "/explore",
  "/enterprise",
  ...LEGAL_CANONICAL_PATHS,
];

// This list is updated by scripts/sync-sitemap-docs.ts
const docSlugs = [
  "readme",
  "api-reference",
  "architecture",
  "cli",
  "developer-guide",
  "environment-setup",
  "getting-started",
  "management-api",
  "mcp-federation",
  "mcp-integration",
  "mcp-registry-publishing",
  "memory",
  "obsidian",
  "platform-integrations",
  "playbooks",
  "secrets-python-examples",
  "self-hosting",
  "skills",
  "team-collaboration",
  "roadmap",
];

// Locale is chosen from a cookie, not from the path, so every language really
// does live at the same URL. That makes these hreflang entries close to inert:
// a crawler only ever sees the default locale, and the hu/de/es translations in
// `public/docs` and `public/blog` have no address of their own to rank at.
// Giving each locale a real prefixed URL is the fix, and it is a routing change
// rather than a sitemap change.
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
