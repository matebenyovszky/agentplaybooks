import { expect, type Page, type Request } from "@playwright/test";

import {
  assertNoCspViolations,
  assertNoHorizontalOverflow,
  assertNoVisibleElementPastRightEdge,
  assertPlaybookHeaderControlsFit,
  assertPrimaryColumnWidth,
  assertTableLayout,
  attachCspListeners,
} from "./overflow-harness";
import type { ViewportCase } from "./viewports";

export const DEMO_PLAYBOOK_ID = "11111111-1111-1111-1111-111111111111";

const DEMO_PLAYBOOK = {
  id: DEMO_PLAYBOOK_ID,
  guid: "fullstack-dev",
  name: "Full-Stack Developer",
  description:
    "Complete toolkit for modern full-stack development with Next.js, TypeScript, and Supabase",
  visibility: "public",
  user_id: "00000000-0000-0000-0000-000000000001",
  publisher_id: null,
  star_count: 1,
  tags: ["nextjs", "react", "typescript"],
  persona_name: "Full-Stack Expert",
  persona_system_prompt: "You are a full-stack expert.",
  persona_metadata: {},
  instructions: "",
  config: {},
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  current_user_role: "viewer",
  skills: [
    {
      id: "skill-1",
      playbook_id: DEMO_PLAYBOOK_ID,
      publisher_id: null,
      name: "Next.js App Router",
      description: "Build Next.js apps",
      content: "# Next.js",
      licence: "MIT",
      created_at: "2026-01-01T00:00:00.000Z",
      priority: 1,
      attachments: [],
    },
  ],
  mcp_servers: [
    {
      id: "mcp-1",
      playbook_id: DEMO_PLAYBOOK_ID,
      publisher_id: null,
      name: "Supabase",
      description: "Database tools",
      tools: [],
      resources: [],
      prompts: [],
      config: {},
      created_at: "2026-01-01T00:00:00.000Z",
    },
  ],
};

const E2E_ORIGIN = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";

export const APP_ROUTES: { path: string; name: string; waitFor?: string; locale?: string }[] = [
  { path: "/", name: "home", waitFor: "h1" },
  // Locales are cookie-based (NEXT_LOCALE), not path prefixes like /hu.
  { path: "/", name: "hu", waitFor: "h1", locale: "hu" },
  { path: "/explore", name: "explore", waitFor: "h1" },
  { path: `/dashboard/playbook/${DEMO_PLAYBOOK_ID}`, name: "playbook", waitFor: '[data-testid="playbook-header"]' },
  { path: "/login", name: "login", waitFor: "h1" },
  { path: "/blog", name: "blog", waitFor: "h1" },
  {
    path: "/blog/self-hosted-eu-cybersecurity-requirements",
    name: "blog-post",
    waitFor: "article",
  },
  { path: "/docs", name: "docs", waitFor: "article" },
  { path: "/docs/getting-started", name: "docs-getting-started", waitFor: "article" },
  { path: "/enterprise", name: "enterprise", waitFor: "h1" },
  { path: "/privacy", name: "privacy", waitFor: "h1" },
  { path: "/terms", name: "terms", waitFor: "h1" },
];

export async function installPublicReadMocks(page: Page) {
  await page.route("**/*supabase.co/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/auth/v1/settings")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ external: { email: true }, disable_signup: false }),
      });
      return;
    }
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ message: "No session" }),
    });
  });

  await page.route("**/api/public/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route("**/api/user/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route("**/api/manage/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route("**/api/playbooks/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/runs") || url.includes("/canvas") || url.includes("/star") || url.includes("/memory")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(DEMO_PLAYBOOK),
    });
  });
}

export async function assertPageFits(page: Page, label: string, viewport: ViewportCase) {
  await assertNoHorizontalOverflow(page);
  await assertNoVisibleElementPastRightEdge(page);
  await assertTableLayout(page);
  if (label === "playbook") {
    await assertPrimaryColumnWidth(page, '[data-testid="playbook-description"]', viewport.width);
  }
  if (label === "playbook" && viewport.width < 768) {
    await assertPlaybookHeaderControlsFit(page);
  }
}

async function gotoWithWebKitRetry(page: Page, path: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await page.goto(path, { waitUntil: "domcontentloaded" });
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!/webkit encountered an internal error/i.test(message) || attempt === 2) {
        throw error;
      }
      await page.waitForTimeout(250 * (attempt + 1));
    }
  }
  throw lastError;
}

export async function visitAndAssert(
  page: Page,
  route: (typeof APP_ROUTES)[number],
  viewport: ViewportCase,
  cspErrors: string[],
) {
  await page.context().addCookies([
    { name: "NEXT_LOCALE", value: route.locale ?? "en", url: E2E_ORIGIN },
  ]);
  const response = await gotoWithWebKitRetry(page, route.path);
  expect(response, `${route.name} should respond`).toBeTruthy();
  expect(response!.status(), `${route.name} status ${response!.status()}`).toBeLessThan(400);
  if (route.waitFor) {
    await expect(page.locator(route.waitFor).first()).toBeVisible();
  }
  if (route.name === "explore") {
    expect(await response!.text(), "Explore content should be in the initial HTML").toContain("Stop starting over.");
  }
  if (route.locale === "hu") {
    await expect(page.locator("h1").first()).toContainText("Egy playbook");
  }
  await assertPageFits(page, route.name, viewport);
  await assertNoCspViolations(page, cspErrors);
}

export async function runLiveOverflowSuite(page: Page, viewport: ViewportCase) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  const cspErrors = await attachCspListeners(page);
  await installPublicReadMocks(page);

  for (const route of APP_ROUTES) {
    const catalogRequests: string[] = [];
    const recordCatalogRequest = (request: Request) => {
      if (/\/api\/(public\/(playbooks|skills|mcp)|user\/starred)([/?]|$)/.test(new URL(request.url()).pathname)) {
        catalogRequests.push(request.url());
      }
    };
    if (route.name === "explore") page.on("request", recordCatalogRequest);
    await visitAndAssert(page, route, viewport, cspErrors);
    if (route.name === "explore") {
      await expect(page.locator("#workflow-title-handoff")).toBeVisible();
      await page.getByText("Turn research into a decision", { exact: true }).click();
      await expect(page.getByRole("radio", { name: "Turn research into a decision" })).toBeChecked();
      await expect(page.locator("#workflow-title-research")).toBeVisible();
      await expect(page.locator("#workflow-title-handoff")).toBeHidden();
      await assertPageFits(page, "explore-research", viewport);
      await page.getByRole("radio", { name: "Turn research into a decision" }).focus();
      await page.keyboard.press("ArrowRight");
      await expect(page.getByRole("radio", { name: "Review a change" })).toBeChecked();
      await expect(page.locator("#workflow-title-review")).toBeVisible();
      await expect(page.locator("#workflow-title-research")).toBeHidden();
      await assertPageFits(page, "explore-review", viewport);
      await page.getByRole("link", { name: "03 Get started" }).click();
      await expect(page.locator("#how-it-works")).toBeInViewport();
      await page.locator("summary").filter({ hasText: "Where do my project details belong?" }).click();
      await expect(page.getByText("In your own private playbook.", { exact: false })).toBeVisible();
      await expect(page.getByRole("link", { name: "Open starter playbook", includeHidden: true })).toHaveCount(3);
      await assertPageFits(page, "explore-guide", viewport);
      await assertNoCspViolations(page, cspErrors);
      page.off("request", recordCatalogRequest);
      expect(catalogRequests, "Explore should not load catalogs or star lists").toEqual([]);
    }
  }
}
