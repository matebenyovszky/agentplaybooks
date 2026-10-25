import { defineConfig } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: "list",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: process.env.CI ? 2 : undefined,
  use: {
    baseURL,
    trace: "off",
  },
  webServer: {
    command: process.env.E2E_WEB_SERVER || "npx next start --hostname 127.0.0.1 --port 3000",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      testMatch: /overflow\.chromium\.spec\.ts/,
      use: { browserName: "chromium" },
    },
    {
      name: "webkit-phones",
      testMatch: /overflow\.webkit\.spec\.ts/,
      use: { browserName: "webkit" },
    },
  ],
});
