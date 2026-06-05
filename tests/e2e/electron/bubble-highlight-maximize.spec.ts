import { test, expect, _electron as electron } from "@playwright/test";
import { getLogseqLaunchEnv, loadRuntimeConfig } from "./runtime";
import { ensureGraphOpen } from "../../../scripts/logseq/graph-bootstrap";

async function injectTestMessages(page: any, messages: any[]) {
  await page.waitForTimeout(5000);
  await page.evaluate((msgs: any[]) => {
    const iframes = Array.from(document.querySelectorAll("iframe"));
    const candidates = iframes.filter(
      (i) =>
        (i as HTMLIFrameElement).id && (i as HTMLIFrameElement).id.includes("logseq-doc-agent"),
    );
    for (const iframe of candidates) {
      try {
        const win = (iframe as HTMLIFrameElement).contentWindow as any;
        if (win && win.__LDA_TEST_SET_CHAT_MESSAGES__) {
          win.__LDA_TEST_SET_CHAT_MESSAGES__(msgs);
          return;
        }
      } catch {
        /* cross-origin */
      }
    }
    throw new Error("No plugin iframe with __LDA_TEST_SET_CHAT_MESSAGES__ found.");
  }, messages);
}

test.describe("Bubble Highlight & Keyboard Maximize", () => {
  test("all key combinations", async () => {
    test.setTimeout(120_000);
    const runtime = loadRuntimeConfig();
    const app = await electron.launch({
      executablePath: runtime.executablePath,
      args: [runtime.graphDir],
      env: getLogseqLaunchEnv(runtime),
    });

    try {
      const page = await app.firstWindow();
      page.on("console", (msg) => {
        if (msg.type() === "error") console.log(`[BROWSER] ${msg.text()}`);
      });

      await page.waitForSelector("#app, .cp__header, .add-graph-btn", {
        state: "visible",
        timeout: 45000,
      });
      await ensureGraphOpen(page, runtime.graphDir);
      await page.waitForSelector("#app, .cp__header", { state: "visible", timeout: 45000 });

      const toolbarItem = page.locator('a[data-on-click="open-chat"]');
      await toolbarItem.waitFor({ state: "visible", timeout: 30000 });
      await toolbarItem.click();

      const textarea = page.locator(".lda-chat-textarea").first();
      await textarea.waitFor({ state: "visible", timeout: 20000 });

      await injectTestMessages(page, [
        { id: "msg-user-1", role: "user", content: "Test user message" },
        { id: "msg-assistant-1", role: "assistant", content: "I am an assistant response." },
        { id: "msg-user-2", role: "user", content: "Another user message" },
        { id: "msg-assistant-2", role: "assistant", content: "Second assistant reply." },
      ]);

      await page.locator(".lda-bubble").first().waitFor({ state: "visible", timeout: 15000 });
      await expect(page.locator(".lda-bubble")).toHaveCount(4);

      const assistantBubble = page.locator(".lda-bubble.ls-bg-agent").first();
      const chatContainer = page.locator(".lda-chat-container").first();
      const modal = page.locator(".lda-chat-modal-backdrop").first();

      // 1. No-op when nothing highlighted
      await test.step("no-op when nothing highlighted", async () => {
        await chatContainer.press("m");
        await expect(modal).toBeHidden({ timeout: 2000 });
        await chatContainer.press("Alt+ArrowUp");
        await expect(modal).toBeHidden({ timeout: 2000 });
        await chatContainer.press("Escape");
      });

      // 2. Click highlights bubble
      await test.step("click highlights bubble", async () => {
        await assistantBubble.click();
        await expect(assistantBubble).toHaveClass(/lda-bubble-highlighted/);
        await expect(page.locator(".lda-bubble.ls-bg-user").first()).not.toHaveClass(
          /lda-bubble-highlighted/,
        );
      });

      // 3. m key maximizes
      await test.step("m maximizes highlighted bubble", async () => {
        await chatContainer.press("m");
        await expect(modal).toBeVisible({ timeout: 5000 });
        await expect(modal.getByText("I am an assistant response")).toBeVisible();
        await expect(assistantBubble).toHaveClass(/lda-bubble-highlighted/);
      });

      // 4. m toggles closed and reopens (proves focus wasn't lost)
      await test.step("m toggles closed and reopens", async () => {
        await chatContainer.press("m");
        await expect(modal).toBeHidden({ timeout: 5000 });
        await expect(assistantBubble).toHaveClass(/lda-bubble-highlighted/);

        // Press again — should reopen (focus stayed)
        await chatContainer.press("m");
        await expect(modal).toBeVisible({ timeout: 5000 });

        // Close cleanly
        await chatContainer.press("m");
        await expect(modal).toBeHidden({ timeout: 5000 });
      });

      // 5. Alt+ArrowUp maximizes
      await test.step("Alt+ArrowUp maximizes", async () => {
        await chatContainer.press("Alt+ArrowUp");
        await expect(modal).toBeVisible({ timeout: 5000 });
      });

      // 6. Alt+ArrowUp toggles closed
      await test.step("Alt+ArrowUp toggles closed", async () => {
        await chatContainer.press("Alt+ArrowUp");
        await expect(modal).toBeHidden({ timeout: 5000 });
      });

      // 7. ESC unhighlights (modal not open)
      await test.step("ESC unhighlights bubble", async () => {
        await expect(assistantBubble).toHaveClass(/lda-bubble-highlighted/);
        await chatContainer.press("Escape");
        await expect(assistantBubble).not.toHaveClass(/lda-bubble-highlighted/);
      });

      // 8. After unhighlight: m / Alt+Up no-op
      await test.step("m/Alt+Up no-op after unhighlight", async () => {
        await chatContainer.press("m");
        await expect(modal).toBeHidden({ timeout: 2000 });
        await chatContainer.press("Alt+ArrowUp");
        await expect(modal).toBeHidden({ timeout: 2000 });
      });

      // 9. Re-highlight and maximize still works
      await test.step("re-highlight works after ESC", async () => {
        await assistantBubble.click();
        await expect(assistantBubble).toHaveClass(/lda-bubble-highlighted/);
        await chatContainer.press("m");
        await expect(modal).toBeVisible({ timeout: 5000 });
        await chatContainer.press("m");
        await expect(modal).toBeHidden({ timeout: 5000 });
      });

      console.log("✅ All key combination tests passed!");
    } finally {
      await app.close();
    }
  });
});
