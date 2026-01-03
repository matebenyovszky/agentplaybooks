import type { MetadataRoute } from "next";
import { locales } from "@/i18n/config";

const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://agentplaybooks.ai").replace(/\/$/, "");

const paths = ["", "/docs", "/explore", "/enterprise"];

function buildAlternates(url: string) {
  const languages: Record<string, string> = { "x-default": url };

  for (const locale of locales) {
    languages[locale] = url;
  }

  return { languages };
}

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return paths.map((path) => {
    const url = `${baseUrl}${path}`;

    return {
      url,
      lastModified: now,
      alternates: buildAlternates(url),
    };
  });
}