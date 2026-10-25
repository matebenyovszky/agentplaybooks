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

export function isIgnorableCspMessage(text: string): boolean {
  return /cloudflareinsights|static\.cloudflareinsights|cdn-cgi\/beacon/i.test(text);
}

export async function assertNoCspViolations(page: Page, collected: string[]) {
  const fromPage = await page.evaluate(() => (window as { __cspViolations?: string[] }).__cspViolations ?? []);
  const violations = [...collected, ...fromPage].filter((text) => !isIgnorableCspMessage(text));
  expect(violations, violations.join("\n")).toEqual([]);
}

export async function attachCspListeners(page: Page): Promise<string[]> {
  const collected: string[] = [];
  await page.addInitScript(() => {
    window.addEventListener("securitypolicyviolation", (event) => {
      const store = ((window as { __cspViolations?: string[] }).__cspViolations ??= []);
      store.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (/content.security.policy/i.test(text)) collected.push(text);
  });
  page.on("pageerror", (error) => {
    if (/content.security.policy/i.test(error.message)) collected.push(error.message);
  });
  return collected;
}

export async function assertNoVisibleElementPastRightEdge(page: Page) {
  const overflowing = await page.evaluate(() => {
    const innerWidth = window.innerWidth;
    const hits: Array<{ tag: string; className: string; right: number; text: string }> = [];
    const elements = document.body ? document.body.querySelectorAll("*") : [];
    for (const node of elements) {
      const el = node as HTMLElement;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) continue;
      const box = el.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) continue;
      if (box.right <= innerWidth + 1) continue;
      let ancestor = el.parentElement;
      let clipped = false;
      while (ancestor) {
        const overflowX = getComputedStyle(ancestor).overflowX;
        if (overflowX === "auto" || overflowX === "scroll" || overflowX === "hidden" || overflowX === "clip") {
          const parentBox = ancestor.getBoundingClientRect();
          if (parentBox.right <= innerWidth + 1) {
            clipped = true;
            break;
          }
        }
        ancestor = ancestor.parentElement;
      }
      if (!clipped) {
        hits.push({
          tag: el.tagName,
          className: typeof el.className === "string" ? el.className.slice(0, 80) : "",
          right: Math.round(box.right),
          text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 48),
        });
      }
    }
    return hits;
  });
  expect(overflowing, JSON.stringify(overflowing, null, 2)).toEqual([]);
}

export async function assertTableLayout(page: Page) {
  const { innerWidth, tables, cells } = await page.evaluate(() => {
    const tableWidths = [...document.querySelectorAll("table")].map((table, index) => ({
      index,
      width: table.getBoundingClientRect().width,
    }));
    const cellWidths = [...document.querySelectorAll("table th, table td")]
      .map((cell, index) => ({
        index,
        width: (cell as HTMLElement).getBoundingClientRect().width,
      }))
      .filter((cell) => cell.width >= 1);
    return { innerWidth: window.innerWidth, tables: tableWidths, cells: cellWidths };
  });

  const maxTableWidth = innerWidth * 3;
  for (const table of tables) {
    expect(
      table.width,
      `table ${table.index} width ${table.width}px exceeds 3x viewport ${maxTableWidth}px`,
    ).toBeLessThanOrEqual(maxTableWidth + 1);
  }
  for (const cell of cells) {
    expect(cell.width, `table cell ${cell.index} width ${cell.width}px`).toBeGreaterThanOrEqual(80);
    expect(cell.width, `table cell ${cell.index} width ${cell.width}px exceeds 400px`).toBeLessThanOrEqual(400);
  }
}
