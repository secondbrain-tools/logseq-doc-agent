import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  reporter: process.env.CI ? "blob" : "html",
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  timeout: 60_000,
  use: {
    trace: "on-first-retry",
  },
});