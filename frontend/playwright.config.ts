import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/playwright",
  timeout: 120_000,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  // Snapshot stability across machines: tolerate tiny sub-pixel differences.
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
      // Anti-aliasing threshold; 0.2 is Playwright's forgiving default.
      threshold: 0.2,
      animations: "disabled",
      caret: "hide",
      scale: "css",
    },
  },
  use: {
    baseURL: process.env.E2E_URL || "http://localhost:8080",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "ar-SA",
    // Deterministic timezone so relative dates render identically everywhere.
    timezoneId: "Asia/Riyadh",
    // Fixed color scheme & motion; the app's animations then respect this.
    colorScheme: "light",
    reducedMotion: "reduce",
    // Common desktop viewport used by every non-mobile project below.
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
  },
  webServer: process.env.E2E_URL
    ? undefined
    : {
        command: "bun run dev",
        url: "http://localhost:8080",
        timeout: 60_000,
        reuseExistingServer: !process.env.CI,
      },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1,
      },
    },
    {
      name: "chromium-tablet",
      testMatch: /najiz-cards-visual\.spec\.ts$/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 834, height: 1112 },
        deviceScaleFactor: 1,
        isMobile: false,
      },
    },
    {
      name: "chromium-mobile",
      testMatch: /najiz-cards-visual\.spec\.ts$/,
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
      },
    },
  ],
});
