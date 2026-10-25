import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: "list",
  timeout: 30_000,
  expect: { timeout: 10_000 },
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
