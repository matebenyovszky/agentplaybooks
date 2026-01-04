import type { MetadataRoute } from "next";
import { locales } from "@/i18n/config";

// Force static generation at build time
export const dynamic = "force-static";

const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://agentplaybooks.ai").replace(/\/$/, "");

const paths = ["", "/docs", "/explore", "/enterprise"];

// Doc slugs - update this list when adding/removing docs in public/docs/
// These correspond to .md files in public/docs/
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
  "ROADMAP",
];

function buildAlternates(url: string) {
  const languages: Record<string, string> = { "x-default": url };

  for (const locale of locales) {
    languages[locale] = url;
  }

  return { languages };
}

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const baseEntries = paths.map((p) => {
    const url = `${baseUrl}${p}`;

    return {
      url,
      lastModified: now,
      alternates: buildAlternates(url),
    };
  });

  const docEntries = docSlugs.map((slug) => {
    const url = `${baseUrl}/docs?page=${slug}`;

    return {
      url,
      lastModified: now,
      alternates: buildAlternates(url),
    };
  });

  return [...baseEntries, ...docEntries];
}
