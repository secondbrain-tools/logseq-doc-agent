import fs from "node:fs";
import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";
import { getLogseqLaunchEnv, loadRuntimeConfig } from "./runtime";

async function injectReplayChatlog(mainWindow: any, data: any) {
  await mainWindow.evaluate((chatlog: any) => {
    const iframes = Array.from(document.querySelectorAll("iframe"));
    const candidates = iframes.filter((i) => i.id && i.id.includes("logseq-doc-agent"));
    for (const iframe of candidates) {
      try {
        const win = (iframe as any).contentWindow;
        if (win) win.__LDA_REPLAY_CHATLOG__ = chatlog;
      } catch {}
    }
  }, data);
}

test.describe("Agent Response Structure", () => {
  test("expands structured responses and supports section collapse", async () => {
    test.setTimeout(180_000);

    const runtime = loadRuntimeConfig();
    const chatlogPath = path.join(
      "tests/graph-template/assets/storages/logseq-doc-agent/chatlogs/2026-06-04-structure-agent-responses.json",
    );
    const chatlogRaw = JSON.parse(fs.readFileSync(chatlogPath, "utf-8"));

    const app = await electron.launch({
      executablePath: runtime.executablePath,
      // Global setup primes the graph; launch without graph arg (aligned with logseq-starts.spec.ts)
      args: [],
      env: getLogseqLaunchEnv(runtime),
    });

    try {
      const window = await app.firstWindow();

      // Global setup primes the graph selection; no fallback graph-opening needed.
      await window.waitForSelector("#app, .cp__header, .add-graph-btn", {
        state: "visible",
        timeout: 45000,
      });
      await window.waitForTimeout(3000);

      // Open chat — toolbar and textarea are in the MAIN window
      const toolbarItem = window.locator('a[data-on-click="open-chat"]');
      await toolbarItem.click();
      const textarea = window.locator(".lda-chat-textarea").first();
      await textarea.waitFor({ state: "visible", timeout: 20000 });

      // Inject replay into the iframe
      await injectReplayChatlog(window, chatlogRaw);

      // Send message via main-window textarea
      await textarea.pressSequentially("trigger", { delay: 10 });
      await textarea.press("Enter");

      // Message bubbles live inside the plugin iframe — use frameLocator
      const chatFrame = window.frameLocator('iframe[id*="logseq-doc-agent"]');

      // Wait for ANY assistant bubble to appear
      await chatFrame
        .locator(".lda-bubble.ls-bg-agent")
        .first()
        .waitFor({ state: "visible", timeout: 120000 });
      console.log("[DEBUG] Agent bubble found!");

      // Now assert the structured sections
      const overviewHeading = chatFrame
        .locator(".lda-response-section-heading")
        .filter({ hasText: "Overview" })
        .first();
      await expect(overviewHeading).toBeVisible({ timeout: 10000 });

      await expect(chatFrame.getByText("Overview body.")).toBeVisible();
      await expect(chatFrame.getByText("Summary body.")).toBeVisible();

      // Maximize
      await chatFrame.locator(".lda-response-maximize").first().click();
      const modal = chatFrame.locator(".lda-chat-modal-backdrop").first();
      await expect(modal).toBeVisible({ timeout: 10000 });
      await expect(modal.getByText("Overview body.")).toBeVisible();

      // Collapse Overview
      await modal.getByRole("button", { name: /collapse overview/i }).click();
      await expect(modal.getByText("Overview body.")).toBeHidden();
      await expect(modal.getByText("Summary body.")).toBeVisible();

      // Restore
      await modal.getByRole("button", { name: /restore inline/i }).click();
      await expect(modal).toBeHidden({ timeout: 10000 });
    } finally {
      await app.close();
    }
  });
});
