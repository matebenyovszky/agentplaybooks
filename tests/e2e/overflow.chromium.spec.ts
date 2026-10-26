import { test } from "@playwright/test";

import { runLiveOverflowSuite } from "./app-routes";
import { eachOrientation } from "./overflow-harness";
import { ALL_VIEWPORTS, DESKTOP_VIEWPORTS } from "./viewports";

const cases = [...eachOrientation(ALL_VIEWPORTS), ...DESKTOP_VIEWPORTS];

for (const viewport of cases) {
  test.describe(`${viewport.name} ${viewport.width}x${viewport.height}`, () => {
    test("live app routes do not overflow", async ({ page }) => {
      test.setTimeout(120_000);
      await runLiveOverflowSuite(page, viewport);
    });

  });
}
