import fs from "node:fs";
import path from "node:path";
import { ensureGraphOpen } from "../../../scripts/logseq/graph-bootstrap";
import { test, expect, _electron as electron } from "@playwright/test";

function loadRuntimeConfig() {
  const runtimePath = path.resolve(".logseq/e2e/runtime.json");

  if (!fs.existsSync(runtimePath)) {
    throw new Error(
      `Runtime config not found at ${runtimePath}. ` +
      "Ensure globalSetup ran successfully or LOGSEQ_EXECUTABLE is set."
    );
  }

  return JSON.parse(fs.readFileSync(runtimePath, "utf8"));
}

test.describe("Plugin Installation Verification", () => {
  test("Doc Agent plugin should be loaded and visible in toolbar", async () => {
    const runtime = loadRuntimeConfig();

    // The user has already installed and configured the plugin in the isolated environment.
    // We just need to verify its presence.

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

      // Logseq takes a while to load plugins
      console.log("Waiting for toolbar item 'open-chat'...");

      // The toolbar item is injected into the parent document (Logseq UI)
      const toolbarItem = window.locator('a[data-on-click="open-chat"]');

      // Wait for it to appear (Logseq plugin loading is async)
      await expect(toolbarItem).toBeVisible({ timeout: 30000 });

      // Also verify CSS bundle is injected
      const cssBundle = window.locator('link#logseq-doc-agent-css-bundle');
      await expect(cssBundle).toHaveAttribute('rel', 'stylesheet');

      console.log("Plugin successfully verified!");
    } finally {
      await app.close();
    }
  });
});
