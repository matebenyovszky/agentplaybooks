import path from "node:path";

import { expect, type Page } from "@playwright/test";

import { orientationsOf, type ViewportCase } from "./viewports";

const fixturesDir = path.join(__dirname, "fixtures");

export const FIXTURES = {
  playbook: path.join(fixturesDir, "playbook-shell.html"),
  publicPages: path.join(fixturesDir, "public-shells.html"),
};

export async function assertNoHorizontalOverflow(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, `horizontal overflow ${scrollWidth}px > ${clientWidth}px`).toBeLessThanOrEqual(clientWidth + 1);
}

export async function assertPrimaryColumnWidth(page: Page, selector: string, viewportWidth: number) {
  const box = await page.locator(selector).first().boundingBox();
  expect(box, `${selector} should render`).toBeTruthy();
  const minWidth = viewportWidth < 768 ? viewportWidth * 0.6 : Math.min(viewportWidth * 0.5, 300);
  expect(box!.width, `${selector} width ${box!.width} at ${viewportWidth}px`).toBeGreaterThanOrEqual(minWidth);
}

export async function assertPlaybookHeaderControlsFit(page: Page) {
  const innerWidth = await page.evaluate(() => window.innerWidth);
  const headerControls = page.locator(
    '[data-testid="playbook-header"] a, [data-testid="playbook-header"] button, [data-testid="playbook-header-actions"] > *',
  );
  const headerCount = await headerControls.count();
  expect(headerCount).toBeGreaterThan(0);
  for (let index = 0; index < headerCount; index += 1) {
    const box = await headerControls.nth(index).boundingBox();
    expect(box, `header control ${index} should render`).toBeTruthy();
    const right = box!.x + box!.width;
    expect(right, `header control ${index} right ${right} > innerWidth ${innerWidth}`).toBeLessThanOrEqual(innerWidth);
    expect(box!.x, `header control ${index} left ${box!.x}`).toBeGreaterThanOrEqual(0);
  }

  const tabs = page.locator('[data-testid="playbook-tabs"] button, [data-testid="playbook-tabs"] a');
  const tabCount = await tabs.count();
  expect(tabCount).toBeGreaterThan(0);
  for (let index = 0; index < tabCount; index += 1) {
    const tab = tabs.nth(index);
    await tab.scrollIntoViewIfNeeded();
    const box = await tab.boundingBox();
    expect(box, `tab ${index} should render`).toBeTruthy();
    const right = box!.x + box!.width;
    expect(right, `tab ${index} right ${right} > innerWidth ${innerWidth}`).toBeLessThanOrEqual(innerWidth);
    expect(box!.x, `tab ${index} left ${box!.x}`).toBeGreaterThanOrEqual(0);
  }
}

export async function openFixture(page: Page, file: string, viewport: ViewportCase) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(`file://${file}`);
}

export function eachOrientation(viewports: ViewportCase[]): ViewportCase[] {
  return viewports.flatMap(orientationsOf);
}
