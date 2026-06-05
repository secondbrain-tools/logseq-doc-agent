import { defineConfig } from "@playwright/test";

export default defineConfig({
  reporter: process.env.CI ? "blob" : "html",
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  timeout: 60_000,
  globalSetup: "./tests/e2e/electron/global-setup.ts",
  use: {
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "electron",
      testDir: "./tests/e2e/electron",
    },
  ],
});
