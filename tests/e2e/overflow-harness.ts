import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, type Page } from "@playwright/test";

import { orientationsOf, type ViewportCase } from "./viewports";

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

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

export async function openFixture(page: Page, file: string, viewport: ViewportCase) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(`file://${file}`);
}

export function eachOrientation(viewports: ViewportCase[]): ViewportCase[] {
  return viewports.flatMap(orientationsOf);
}
