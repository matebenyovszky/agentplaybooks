import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const relative = "docs/compliance/hu-nis2-gap-assessment.md";
const full = path.join(repoRoot, relative);

const ROOT_FILES = new Set([
  "docker-compose.yml",
  "Dockerfile",
  "package.json",
  "permissions.md",
  "next.config.ts",
  "SECURITY.md",
]);

const PATH_PREFIXES = [
  "src/",
  "supabase/",
  "scripts/",
  "packages/",
  "tests/",
  "docs/",
  "public/",
  "deploy/",
  ".github/",
];

function isRepoPath(value: string): boolean {
  if (ROOT_FILES.has(value)) return true;
  return PATH_PREFIXES.some((prefix) => value.startsWith(prefix));
}

function extractBacktickPaths(markdown: string): string[] {
  const found = new Set<string>();
  const tick = /`([^`]+)`/g;
  let match: RegExpExecArray | null;
  while ((match = tick.exec(markdown))) {
    const value = match[1].trim();
    if (value.includes(" ") || value.includes("\n")) continue;
    const stripped = value.replace(/^\.\//, "");
    if (isRepoPath(stripped)) found.add(stripped);
  }
  return [...found];
}

describe("Hungary / NIS2 gap assessment", () => {
  it("ships the English assessment with the required disclaimers", () => {
    expect(existsSync(full), relative).toBe(true);
    const markdown = readFileSync(full, "utf8");
    expect(markdown.toLowerCase()).toMatch(/jogi ellenőrzés szükséges/);
    expect(markdown).toMatch(/helps meet/);
    expect(markdown).toMatch(/not legal advice/i);
    expect(markdown).toMatch(/not a certification/i);
    expect(markdown).not.toMatch(/\bcompliant\b/i);
    expect(markdown).not.toMatch(/\bcertified\b/i);
    expect(markdown).toMatch(/\| met \| 6 \|/);
    expect(markdown).toMatch(/\| partial \| 30 \|/);
    expect(markdown).toMatch(/\| missing \| 3 \|/);
    expect(markdown).toMatch(/\| operator \| 9 \|/);
  });

  it("cites repository paths that exist on this branch", () => {
    const markdown = readFileSync(full, "utf8");
    const missing: string[] = [];
    for (const repoPath of extractBacktickPaths(markdown)) {
      const target = path.join(repoRoot, repoPath);
      if (!existsSync(target)) missing.push(repoPath);
      else if (statSync(target).isDirectory() && !repoPath.endsWith("/")) {
        // Directories are acceptable citations.
      }
    }
    expect(missing, missing.join(", ")).toEqual([]);
  });
});
