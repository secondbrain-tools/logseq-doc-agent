import { ensureGraphOpen } from "../../../scripts/logseq/graph-bootstrap";
import { test, expect, _electron as electron } from "@playwright/test";
import { loadRuntimeConfig } from "./runtime";

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
    
    console.log("Waiting for Logseq shell...");
    await window.waitForSelector("#app, .cp__header, .add-graph-btn", { state: "visible", timeout: 45000 });

    await ensureGraphOpen(window, runtime.graphDir);

    console.log("Waiting for main UI element (#app or .cp__header)...");
    await window.waitForSelector("#app, .cp__header", { state: "visible", timeout: 45000 });
    await expect(window.locator("body")).toBeVisible();
    console.log("Logseq started successfully!");
  } catch (err: any) {
    console.error("Test failed:", err.message);
    throw err;
  } finally {
    await app.close();
  }
});
