import fs from "node:fs";
import path from "node:path";
import { test, expect, _electron as electron } from "@playwright/test";

function loadRuntimeConfig() {
  const runtimePath = path.resolve(".tmp/runtime.json");

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
    const window = await app.firstWindow();
    await window.waitForLoadState("domcontentloaded");
    await expect(window.locator("body")).toBeVisible();
  } finally {
    await app.close();
  }
});