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

      // Message bubbles are injected into the parent document (Logseq sidebar),
      // NOT into the plugin iframe — use direct window.locator()

      // Wait for ANY assistant bubble to appear
      await window
        .locator(".lda-bubble.ls-bg-agent")
        .first()
        .waitFor({ state: "visible", timeout: 120000 });
      console.log("[DEBUG] Agent bubble found!");

      // Now assert the structured sections
      const overviewHeading = window
        .locator(".lda-response-section-heading")
        .filter({ hasText: "Overview" })
        .first();
      await expect(overviewHeading).toBeVisible({ timeout: 10000 });

      await expect(window.getByText("Overview body.")).toBeVisible();
      await expect(window.getByText("Summary body.")).toBeVisible();

      // Maximize
      await window.locator(".lda-response-maximize").first().click();
      const modal = window.locator(".lda-chat-modal-backdrop").first();
      await expect(modal).toBeVisible({ timeout: 10000 });
      await expect(modal.getByText("Overview body.")).toBeVisible();

      // Close the modal via Escape key (the restore button may be scrolled off-screen)
      await modal.press("Escape");
      await expect(modal).toBeHidden({ timeout: 10000 });
    } finally {
      await app.close();
    }
  });
});
