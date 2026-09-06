import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  expect: { timeout: 10_000 },
  fullyParallel: false,
  reporter: "line",
  testDir: "./tests/e2e",
  workers: 2,
  use: {
    screenshot: "only-on-failure",
    trace: "off",
  },
  projects: [
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "pnpm --filter @ranza/storefront dev --webpack --port 3100",
      port: 3100,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter @ranza/product-web dev --webpack --port 3101",
      port: 3101,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter @ranza/control-plane dev --webpack --port 3102",
      port: 3102,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
