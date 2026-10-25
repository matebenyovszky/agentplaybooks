import { test } from "@playwright/test";

import {
  FIXTURES,
  assertNoHorizontalOverflow,
  assertPrimaryColumnWidth,
  eachOrientation,
  openFixture,
} from "./overflow-harness";
import { ALL_VIEWPORTS } from "./viewports";

const cases = eachOrientation(ALL_VIEWPORTS);

for (const viewport of cases) {
  test.describe(`${viewport.name} ${viewport.width}x${viewport.height}`, () => {
    test("playbook view does not overflow and keeps a usable description column", async ({ page }) => {
      await openFixture(page, FIXTURES.playbook, viewport);
      await assertNoHorizontalOverflow(page);
      await assertPrimaryColumnWidth(page, '[data-testid="playbook-description"]', viewport.width);
    });

    test("home, blog, explore, and dashboard shells do not overflow", async ({ page }) => {
      await openFixture(page, FIXTURES.publicPages, viewport);
      await assertNoHorizontalOverflow(page);
      await assertPrimaryColumnWidth(page, '[data-testid="home-title"]', viewport.width);
      await assertPrimaryColumnWidth(page, '[data-testid="blog-article"]', viewport.width);
      await assertPrimaryColumnWidth(page, '[data-testid="skill-card"]', viewport.width);
      await assertPrimaryColumnWidth(page, '[data-testid="mcp-card"]', viewport.width);
      await assertPrimaryColumnWidth(page, '[data-testid="dashboard-card"]', viewport.width);
    });
  });
}
