import { expect, test } from "@playwright/test";

import { installPublicReadMocks, runLiveOverflowSuite } from "./app-routes";
import { eachOrientation } from "./overflow-harness";
import { ALL_VIEWPORTS, DESKTOP_VIEWPORTS } from "./viewports";

const cases = [...eachOrientation(ALL_VIEWPORTS), ...DESKTOP_VIEWPORTS];

test("saved theme hydrates without replacing the Explore page", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await installPublicReadMocks(page);
  await page.addInitScript(() => localStorage.setItem("agentplaybooks-theme", "dark"));
  await page.goto("/explore");
  const toggle = page.getByRole("button", { name: "Theme: Dark" });
  await expect(toggle).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await toggle.click();
  await page.getByRole("button", { name: "Theme: System" }).click();
  await expect(page.getByRole("button", { name: "Theme: Light" })).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/light/);
  expect(errors.filter(message => /hydration|hydrating|minified react error #(418|423|425)/i.test(message))).toEqual([]);
});

for (const viewport of cases) {
  test.describe(`${viewport.name} ${viewport.width}x${viewport.height}`, () => {
    test("live app routes do not overflow", async ({ page }) => {
      test.setTimeout(120_000);
      await runLiveOverflowSuite(page, viewport);
    });

  });
}
