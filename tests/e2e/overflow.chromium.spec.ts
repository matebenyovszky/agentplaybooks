import { test } from "@playwright/test";

import { runLiveOverflowSuite } from "./app-routes";
import {
  FIXTURES,
  assertNoHorizontalOverflow,
  assertPlaybookHeaderControlsFit,
  assertPrimaryColumnWidth,
  eachOrientation,
  openFixture,
} from "./overflow-harness";
import { ALL_VIEWPORTS, DESKTOP_VIEWPORTS } from "./viewports";

const cases = [...eachOrientation(ALL_VIEWPORTS), ...DESKTOP_VIEWPORTS];

for (const viewport of cases) {
  test.describe(`${viewport.name} ${viewport.width}x${viewport.height}`, () => {
    test("live app routes do not overflow", async ({ page }) => {
      test.setTimeout(120_000);
      await runLiveOverflowSuite(page, viewport);
    });

    test("fixture shells still fit", async ({ page }) => {
      await openFixture(page, FIXTURES.playbook, viewport);
      await assertNoHorizontalOverflow(page);
      await assertPrimaryColumnWidth(page, '[data-testid="playbook-description"]', viewport.width);
      if (viewport.width < 768) {
        await assertPlaybookHeaderControlsFit(page);
      }
      await openFixture(page, FIXTURES.publicPages, viewport);
      await assertNoHorizontalOverflow(page);
    });
  });
}
