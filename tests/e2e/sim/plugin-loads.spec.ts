import { test, expect } from "@playwright/test";

test.describe("Plugin Loads in Sim", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the logseq-sim page
    await page.goto("/tests/logseq-sim.html");

    // Wait for the simulator to mount the app and load the plugin
    // The plugin is loaded dynamically after a small delay in logseq-sim.html
    // We'll wait for the toolbar items to appear, which indicates the plugin is loaded and setupPlugin() has run.
    // The template uses data-on-click for the key.


    await page.waitForSelector('a[data-on-click="open-chat"]', { timeout: 25000 });
  });

  test("should show chat button in toolbar", async ({ page }) => {
    const chatButton = page.locator("[data-on-click='open-chat']");
    await expect(chatButton).toBeVisible();
  });

  test("should show evaluation items slot in toolbar", async ({ page }) => {
    // Evaluation items are registered in toolbar location by InjectEvaluationsUseCase
    const evalItem = page.locator("#lda-eval-toolbar-slot");
    await expect(evalItem).toBeAttached(); // It might be hidden if no evaluations
  });

  test("should open chat panel when toolbar button is clicked", async ({ page }) => {
    await page.locator("[data-on-click='open-chat']").click();

    // The chat panel is injected into the document.
    // Services.instance.chatUseCase.openChat() is called.

    // Let's check for the chat container class
    await expect(page.locator(".lda-chat-container")).toBeVisible({ timeout: 10000 });
  });
});
