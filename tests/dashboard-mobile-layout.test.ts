import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("public playbook mobile layout", () => {
  it("stacks the dashboard shell below the md breakpoint instead of keeping a flex row", () => {
    const layout = read("src/app/dashboard/layout.tsx");
    expect(layout).toContain("flex min-h-screen min-w-0 flex-col overflow-x-clip");
    expect(layout).toContain("md:flex-row");
    expect(layout).toContain("min-w-0 w-full flex-1 overflow-x-clip overflow-y-auto p-4 md:p-8");
    expect(layout).not.toMatch(/className="min-h-screen bg-background text-foreground flex"/);
    expect(layout).not.toMatch(/<main className="flex-1 p-8 overflow-auto">/);
  });

  it("keeps the desktop sidebar out of the mobile flex flow", () => {
    const sidebar = read("src/components/ui/sidebar.tsx");
    expect(sidebar).toContain("hidden md:contents");
    expect(sidebar).toContain("hidden md:flex md:flex-col");
    expect(sidebar).toMatch(/w-full shrink-0[\s\S]*md:hidden/);
  });

  it("lets the playbook description wrap at 393px instead of shrinking to a word column", () => {
    const page = read("src/app/dashboard/playbook/[id]/page.tsx");
    expect(page).toContain('data-testid="playbook-description"');
    expect(page).toContain("min-w-0 w-full wrap-anywhere");
    expect(page).toContain("min-h-screen min-w-0 w-full");
    expect(page).toContain("flex max-w-7xl min-w-0 flex-wrap");
  });

  it("gives the blog post article a shrinking flex/grid child and wrapping text", () => {
    const blog = read("src/app/blog/BlogPostClient.tsx");
    expect(blog).toContain("min-w-0 overflow-x-clip bg-background");
    expect(blog).toContain("min-w-0 max-w-5xl overflow-x-clip");
    expect(blog).toContain("min-w-0 max-w-3xl wrap-anywhere");
  });

  it("lets explore tabs scroll instead of stretching the page, and wraps dashboard headers", () => {
    const explore = read("src/app/explore/page.tsx");
    expect(explore).toContain("min-w-0 overflow-x-clip bg-background");
    expect(explore).toContain("flex min-w-0 gap-2 overflow-x-auto");
    const dashboard = read("src/app/dashboard/page.tsx");
    expect(dashboard).toContain("flex min-w-0 flex-wrap items-center justify-between");
  });
});
