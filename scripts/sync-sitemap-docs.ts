/**
 * Sync sitemap docSlugs with actual docs in public/docs/
 * 
 * Run this script before building to ensure the sitemap includes all docs.
 * Usage: npx tsx scripts/sync-sitemap-docs.ts
 * 
 * This runs locally where fs works, and updates sitemap.ts with the current doc list.
 * Then when you commit and push to Cloudflare, the hardcoded list is already correct.
 */

import { promises as fs } from "fs";
import path from "path";

const DOCS_DIR = path.join(process.cwd(), "public", "docs");
const SITEMAP_FILE = path.join(process.cwd(), "src", "app", "sitemap.ts");

async function getDocSlugs(): Promise<string[]> {
  const entries = await fs.readdir(DOCS_DIR, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
    .map((entry) => {
      const base = entry.name.replace(/\.md$/i, "");
      // Keep original case for display, lowercase for URL consistency
      return base.toLowerCase() === "readme" ? "readme" : base;
    })
    .sort((a, b) => {
      // Sort: readme first, then ROADMAP last, rest alphabetically
      if (a === "readme") return -1;
      if (b === "readme") return 1;
      if (a === "ROADMAP") return 1;
      if (b === "ROADMAP") return -1;
      return a.localeCompare(b);
    });
}

async function updateSitemap(slugs: string[]): Promise<boolean> {
  const content = await fs.readFile(SITEMAP_FILE, "utf-8");

  // Build the new docSlugs array
  const newDocSlugs = `const docSlugs = [
${slugs.map((s) => `  "${s}",`).join("\n")}
];`;

  // Match the existing docSlugs array (multiline)
  const docSlugsRegex = /const docSlugs = \[[\s\S]*?\];/;

  if (!docSlugsRegex.test(content)) {
    console.error("Could not find docSlugs array in sitemap.ts");
    return false;
  }

  const newContent = content.replace(docSlugsRegex, newDocSlugs);

  if (newContent === content) {
    console.log("✓ Sitemap docSlugs already up to date");
    return false;
  }

  await fs.writeFile(SITEMAP_FILE, newContent, "utf-8");
  console.log("✓ Updated sitemap.ts with", slugs.length, "doc slugs:");
  slugs.forEach((s) => console.log("  -", s));
  return true;
}

async function main() {
  console.log("Syncing sitemap docs...\n");

  try {
    const slugs = await getDocSlugs();
    console.log("Found", slugs.length, "docs in public/docs/\n");

    const updated = await updateSitemap(slugs);

    if (updated) {
      console.log("\n⚠️  Remember to commit the updated sitemap.ts!");
    }
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();


