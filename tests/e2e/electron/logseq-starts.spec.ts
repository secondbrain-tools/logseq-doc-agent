import fs from "node:fs";
import path from "node:path";
import { test, expect, _electron as electron } from "@playwright/test";

function loadRuntimeConfig() {
  const runtimePath = path.resolve(".logseq/runtime.json");

  if (!fs.existsSync(runtimePath)) {
    throw new Error(
      `Runtime config not found at ${runtimePath}. ` +
        "Playwright global setup should have created this file. " +
        "Ensure globalSetup ran successfully and did not fail early."
    );
  }

  return JSON.parse(fs.readFileSync(runtimePath, "utf8"));
}

test("Logseq starts", async () => {
  const runtime = loadRuntimeConfig();

  console.log("Launching Logseq Electron app...");
  const app = await electron.launch({
    executablePath: runtime.executablePath,
    args: [runtime.graphDir],
    env: {
      ...process.env,
      HOME: runtime.homeDir,
      XDG_CONFIG_HOME: runtime.xdgDir,
    },
  });

  try {
    console.log("Waiting for first window...");
    const window = await app.firstWindow();
    
    console.log("Waiting for main UI element (#app or .cp__header)...");
    // Wait for the main app container or header to be visible
    await window.waitForSelector("#app, .cp__header", { state: "visible", timeout: 45000 });
    
    console.log("Verifying body visibility...");
    await expect(window.locator("body")).toBeVisible();
    console.log("Logseq started successfully!");
  } catch (err: any) {
    console.error("Test failed:", err.message);
    throw err;
  } finally {
    await app.close();
  }
});