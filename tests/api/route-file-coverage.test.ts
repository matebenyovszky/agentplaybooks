import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every Hono sub-route needs a Next.js file to reach it.
 *
 * `createApiApp("/api/mcp/config/:serverId")` plus `app.post("/test", …)` looks
 * like a working endpoint and type-checks like one, but Next.js routes by file:
 * without `…/[serverId]/test/route.ts` the request never reaches Hono and 404s
 * with an HTML error page. The dashboard then tries to parse that as JSON and
 * reports "Unexpected non-whitespace character after JSON at position 4", which
 * says nothing about the actual cause.
 *
 * This walks the API tree, reads the base path each route registers and the
 * sub-paths it declares, and asserts a file exists for each one.
 */

const API_ROOT = path.join(process.cwd(), "src", "app", "api");

function routeFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...routeFiles(full));
    } else if (entry === "route.ts") {
      found.push(full);
    }
  }
  return found;
}

/** `createApiApp("/api/x/:id")` → the base path, if the file declares one. */
function basePathOf(source: string): string | null {
  return /createApiApp\(\s*"([^"]+)"/.exec(source)?.[1] ?? null;
}

/** Sub-paths the file registers, e.g. `app.post("/test", …)` → `/test`. */
function subPathsOf(source: string): string[] {
  const paths = new Set<string>();
  for (const match of source.matchAll(/app\.(?:get|post|put|patch|delete)\(\s*"([^"]+)"/g)) {
    if (match[1] !== "/" && match[1] !== "*") paths.add(match[1]);
  }
  return [...paths];
}

/** `/api/mcp/config/:serverId` + `/test` → the directory Next.js needs. */
function expectedDirectory(basePath: string, subPath: string): string {
  const segments = [...basePath.split("/"), ...subPath.split("/")]
    .filter(Boolean)
    .map((segment) => (segment.startsWith(":") ? `[${segment.slice(1)}]` : segment));
  return path.join(process.cwd(), "src", "app", ...segments);
}

describe("Hono sub-routes have Next.js route files", () => {
  it("finds a route file for every registered sub-path", () => {
    const missing: string[] = [];

    for (const file of routeFiles(API_ROOT)) {
      const source = readFileSync(file, "utf8");
      const basePath = basePathOf(source);
      if (!basePath) continue;

      for (const subPath of subPathsOf(source)) {
        const directory = expectedDirectory(basePath, subPath);
        let hasFile = false;
        try {
          hasFile = statSync(path.join(directory, "route.ts")).isFile();
        } catch {
          hasFile = false;
        }
        if (!hasFile) {
          missing.push(`${basePath}${subPath} — expected ${path.relative(process.cwd(), directory)}/route.ts`);
        }
      }
    }

    expect(missing).toEqual([]);
  });
});
