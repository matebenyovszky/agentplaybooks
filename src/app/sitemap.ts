import type { MetadataRoute } from "next";
import { locales } from "@/i18n/config";
import { promises as fs } from "fs";
import path from "path";

const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://agentplaybooks.ai").replace(/\/$/, "");

const paths = ["", "/docs", "/explore", "/enterprise"];

function buildAlternates(url: string) {
  const languages: Record<string, string> = { "x-default": url };

  for (const locale of locales) {
    languages[locale] = url;
  }

  return { languages };
}

async function getDocSlugs(): Promise<string[]> {
  const docsDir = path.join(process.cwd(), "public", "docs");

  try {
    const entries = await fs.readdir(docsDir, { withFileTypes: true });

    return entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
      .map((entry) => {
        const base = entry.name.replace(/\.md$/i, "");
        return base.toLowerCase() === "readme" ? "readme" : base;
      });
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const baseEntries = paths.map((path) => {
    const url = `${baseUrl}${path}`;

    return {
      url,
      lastModified: now,
      alternates: buildAlternates(url),
    };
  });

  const docSlugs = await getDocSlugs();
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
