#!/usr/bin/env node
/**
 * Link and path check for the supplier-assessment security pack.
 *
 * Verifies:
 * - required HU + EN files exist under docs/security/
 * - relative markdown links resolve
 * - backtick paths that look like repository files exist
 * - the risk-assessment CSV has the expected header
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const requiredFiles = [
  "README.md",
  "README.hu.md",
  "whitepaper.md",
  "whitepaper.hu.md",
  "asset-inventory.md",
  "asset-inventory.hu.md",
  "risk-assessment.md",
  "risk-assessment.hu.md",
  "risk-assessment.csv",
];

const csvHeader = [
  "nist_family",
  "family_name_en",
  "family_name_hu",
  "mk_rendelet_ref",
  "nis2_ref",
  "product_support_en",
  "product_support_hu",
  "customer_responsibility_en",
  "customer_responsibility_hu",
  "evidence_or_test_en",
  "evidence_or_test_hu",
  "status",
  "source_files",
  "legal_flag",
];

const ROOT_FILES = new Set([
  "docker-compose.yml",
  "Dockerfile",
  "package.json",
  "package-lock.json",
  "permissions.md",
  "next.config.ts",
  "wrangler.jsonc",
  "open-next.config.ts",
  "LICENSE",
]);

const PATH_PREFIXES = [
  "src/",
  "supabase/",
  "scripts/",
  "packages/",
  "plugins/",
  "tests/",
  "docs/",
  "public/",
  ".github/",
];

function isRepoPath(value) {
  if (ROOT_FILES.has(value)) return true;
  return PATH_PREFIXES.some((prefix) => value.startsWith(prefix));
}

function extractMarkdownLinks(markdown) {
  const links = [];
  const inline = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;
  while ((match = inline.exec(markdown))) {
    links.push({ text: match[1], href: match[2].trim() });
  }
  return links;
}

function extractBacktickPaths(markdown) {
  const found = new Set();
  const tick = /`([^`]+)`/g;
  let match;
  while ((match = tick.exec(markdown))) {
    const value = match[1].trim();
    if (value.includes(" ") || value.includes("\n")) continue;
    const stripped = value.replace(/^\.\//, "");
    if (isRepoPath(stripped)) found.add(stripped);
  }
  return [...found];
}

function stripQueryAndFragment(href) {
  return href.split("#")[0].split("?")[0];
}

export function checkSecurityDocs(root = repoRoot) {
  const dir = join(root, "docs", "security");
  const errors = [];
  const checkedLinks = [];
  const checkedPaths = new Set();

  if (!existsSync(dir)) {
    return { ok: false, errors: [`missing directory: ${dir}`] };
  }

  for (const file of requiredFiles) {
    const full = join(dir, file);
    if (!existsSync(full)) errors.push(`missing required file: docs/security/${file}`);
  }

  const csvPath = join(dir, "risk-assessment.csv");
  if (existsSync(csvPath)) {
    const firstLine = readFileSync(csvPath, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)[0];
    const header = firstLine.split(",").map((column) => column.trim());
    if (header.join(",") !== csvHeader.join(",")) {
      errors.push(`risk-assessment.csv header mismatch. Expected: ${csvHeader.join(",")}`);
    }
    const rows = readFileSync(csvPath, "utf8").replace(/^\uFEFF/, "").trim().split(/\r?\n/).length - 1;
    if (rows < 12) errors.push(`risk-assessment.csv has only ${rows} data rows; expected control families`);
  }

  const markdownFiles = readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => join(dir, name));

  for (const file of markdownFiles) {
    const markdown = readFileSync(file, "utf8");
    const relative = `docs/security/${file.slice(dir.length + 1)}`;

    if (!markdown.toLowerCase().includes("jogi ellenőrzés szükséges")) {
      errors.push(`${relative} must mark legal interpretation with 'jogi ellenőrzés szükséges'`);
    }

    for (const link of extractMarkdownLinks(markdown)) {
      const href = stripQueryAndFragment(link.href.replace(/^<|>$/g, ""));
      if (!href || href.startsWith("http://") || href.startsWith("https://") || href.startsWith("mailto:")) {
        continue;
      }
      if (href.startsWith("#")) continue;
      const target = resolve(dirname(file), href);
      checkedLinks.push({ from: relative, href, target });
      if (!existsSync(target)) {
        errors.push(`${relative}: broken link [${link.text}](${link.href})`);
      }
    }

    for (const repoPath of extractBacktickPaths(markdown)) {
      checkedPaths.add(repoPath);
      const target = join(root, repoPath);
      if (!existsSync(target)) {
        errors.push(`${relative}: cited path does not exist: ${repoPath}`);
      } else if (statSync(target).isDirectory() && !repoPath.endsWith("/")) {
        // Directories are acceptable citations (e.g. supabase/migrations/).
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    checkedLinks: checkedLinks.length,
    checkedPaths: checkedPaths.size,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const result = checkSecurityDocs();
  if (!result.ok) {
    process.stderr.write("Security docs check failed:\n");
    for (const error of result.errors) process.stderr.write(`  - ${error}\n`);
    process.exit(1);
  }
  process.stdout.write(
    `Security docs check passed (${result.checkedLinks} relative links, ${result.checkedPaths} cited paths).\n`,
  );
}
