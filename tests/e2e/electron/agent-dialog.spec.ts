import fs from "node:fs";
import path from "node:path";
import { test, expect, _electron as electron } from "@playwright/test";
import { buildFullRemap, extractChatlogContext, remapChatlog } from "../lib/id-remapper";

function loadRuntimeConfig() {
  const runtimePath = path.resolve(".logseq/e2e/runtime.json");
  if (!fs.existsSync(runtimePath)) {
    throw new Error(`Runtime config not found at ${runtimePath}.`);
  }
  return JSON.parse(fs.readFileSync(runtimePath, "utf8"));
}

async function evalInPluginFrame(mainWindow: any, fn: string): Promise<any> {
  return mainWindow.evaluate(
    async ({ fn }: { fn: string }) => {
      const iframes = Array.from(document.querySelectorAll("iframe"));
      const candidates = iframes.filter((i) => i.id && i.id.includes("logseq-doc-agent"));
      for (const iframe of candidates) {
        try {
          const iframeWin = iframe.contentWindow as any;
          if (iframeWin && iframeWin.logseq) {
            const asyncFn = new iframeWin.Function(`return (async () => { ${fn} })()`);
            const res = await asyncFn();
            return JSON.parse(JSON.stringify(res)); // Ensure no Beans pass through
          }
        } catch (e) {}
      }
      throw new Error("No plugin iframe with logseq API found.");
    },
    { fn }
  );
}

test.describe("Agent Chatlog Replay", () => {
  test("replays a recorded chatlog modifying a document", async () => {
    test.setTimeout(180_000);

    const graphTemplateDir = path.resolve("tests/graph-template");
    const snapshotPath = path.join(graphTemplateDir, "snapshots/Merge Content.txt");
    const chatlogPath = path.join(
      graphTemplateDir,
      "assets/storages/logseq-doc-agent/chatlogs/2026-03-27-rework-document.json"
    );

    const snapshotText = fs.readFileSync(snapshotPath, "utf-8");
    const chatlogRaw = JSON.parse(fs.readFileSync(chatlogPath, "utf-8"));
    const chatlogContextText = extractChatlogContext(chatlogRaw);

    const runtime = loadRuntimeConfig();
    const app = await electron.launch({
      executablePath: runtime.executablePath,
      args: [runtime.graphDir],
      env: { ...process.env, HOME: runtime.homeDir, XDG_CONFIG_HOME: runtime.xdgDir },
    });

    try {
      const window = await app.firstWindow();
      window.on("console", (msg) => {
          if (msg.type() === 'error' || msg.text().includes('[ChatlogReplayAIService]') || msg.text().includes('[IdRemapper]')) {
              console.log(`[BROWSER][${msg.type()}] ${msg.text()}`);
          }
      });

      await window.waitForSelector("#app, .cp__header", { state: "visible", timeout: 45000 });
      const toolbarItem = window.locator('a[data-on-click="open-chat"]');
      await expect(toolbarItem).toBeVisible({ timeout: 30000 });

      // ─── 3. Get current page tree ───────────────────────────────────────
      const currentText: string = await evalInPluginFrame(
        window,
        `
        var logseqApi = window.logseq;
        var page = await logseqApi.Editor.getPage("Merge Content");
        var blocks = await logseqApi.Editor.getPageBlocksTree(page.name);
        var out = "Selection Type: page\\nPage: " + (page.name) + " (id:" + page.id + ")\\n\\n";
        function printTree(nodes, depth) {
          depth = depth || 0;
          for (var i = 0; i < nodes.length; i++) {
            var node = nodes[i];
            var indent = ""; for (var d = 0; d < depth; d++) indent += "  ";
            out += indent + "- id:" + node.id + " " + (node.content || "").replace(/\\n/g, "\\\\n") + "\\n";
            if (node.children && node.children.length > 0) printTree(node.children, depth + 1);
          }
        }
        printTree(blocks, 0);
        return out;
        `
      );

      const idMap = buildFullRemap(chatlogContextText, snapshotText, currentText);
      console.log(`ID remap built: ${idMap.size} entries.`);
      const remappedChatlog = remapChatlog(chatlogRaw, idMap);

      await window.evaluate((data: any) => {
        const iframes = Array.from(document.querySelectorAll("iframe"));
        const candidates = iframes.filter((i) => i.id && i.id.includes("logseq-doc-agent"));
        for (const iframe of candidates) {
          const win = iframe.contentWindow as any;
          if (win) win.__LDA_REPLAY_CHATLOG__ = data;
        }
      }, remappedChatlog);

      await toolbarItem.click();
      const textarea = window.locator(".lda-chat-textarea").first();
      await textarea.waitFor({ state: "visible", timeout: 20000 });

      await textarea.focus();
      await textarea.pressSequentially("Rework document", { delay: 30 });
      await textarea.press("Enter");
      
      console.log("Waiting for completion...");
      const doneLocator = window.locator("text=/Done/i").first();
      await doneLocator.waitFor({ state: "visible", timeout: 120000 });
      
      console.log("Settling for 10s to ensure DB flush...");
      await window.waitForTimeout(10000);

      // ─── 10. Final assertions ───────────────────────────────────────────
      const result: any = await evalInPluginFrame(
        window,
        `
        var logseqApi = window.logseq;
        var page = await logseqApi.Editor.getPage("Merge Content");
        var tree = await logseqApi.Editor.getPageBlocksTree(page.name);
        
        function countMatches(nodes) {
          var count = 0;
          for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].content && nodes[i].content.includes("## Hierarchical organisation")) count++;
            if (nodes[i].children) count += countMatches(nodes[i].children);
          }
          return count;
        }
        
        return { 
          updatedCount: countMatches(tree),
          sampleContent: tree[0] && tree[0].children ? tree[0].children.slice(0,3).map(c => c.content) : []
        };
        `
      );

      console.log(`Assertion Result: found ${result.updatedCount} blocks updated.`);
      if (result.updatedCount === 0) {
          console.log("Sample content from graph:", JSON.stringify(result.sampleContent, null, 2));
      }
      
      expect(result.updatedCount).toBeGreaterThanOrEqual(10);

      // ─── 11. Test Merge UI Interactions ──────────────────────────────────
      console.log("Testing Merge UI injected into DOM...");

      // 1. Verify Block-Level Controls
      const mergeControls = window.locator('.lda-merge-controls').first();
      await expect(mergeControls).toBeVisible({ timeout: 10000 });
      
      const acceptBtn = mergeControls.locator('.lda-merge-accept');
      const diffBtn = mergeControls.locator('.lda-merge-diff');
      const revertBtn = mergeControls.locator('.lda-merge-revert');
      
      await expect(acceptBtn).toBeVisible();
      await expect(diffBtn).toBeVisible();
      await expect(revertBtn).toBeVisible();

      // 2. Test Block-Level Diff View
      console.log("Opening Block Diff View...");
      await diffBtn.click();
      const diffModal = window.locator('.lda-diff-container').first();
      await expect(diffModal).toBeVisible({ timeout: 5000 });
      
      // Close diff modal (by clicking Cancel)
      const diffCancelBtn = window.locator('.lda-diff-actions .lda-btn-secondary').first();
      await diffCancelBtn.click();
      await expect(diffModal).toBeHidden({ timeout: 5000 });

      // 3. Test Block-Level Accept/Deny
      console.log("Testing Block-Level Accept and Revert...");
      // Revert the first merge control
      await revertBtn.click();
      await window.waitForTimeout(1000); 
      
      // Accept another block (now the first one since the previous was reverted)
      const secondMergeControls = window.locator('.lda-merge-controls').first();
      await expect(secondMergeControls).toBeVisible();
      const secondAcceptBtn = secondMergeControls.locator('.lda-merge-accept');
      await secondAcceptBtn.click();
      await window.waitForTimeout(1000);

      // 4. Test Page-Level Merge Menu
      console.log("Testing Page-Level Merge Menu...");
      const pageToolbar = window.locator('.lda-page-merge-toolbar').first();
      await expect(pageToolbar).toBeVisible({ timeout: 5000 });
      
      // Click the badge to open the popover
      const badgeBtn = pageToolbar.locator('.lda-badge').first();
      await badgeBtn.click();
      
      const pagePopover = window.locator('.lda-page-merge-toolbar-popover').first();
      await expect(pagePopover).toBeVisible({ timeout: 5000 });
      
      // Test page-level diff (Review All button)
      const reviewAllBtn = pagePopover.locator('.merge-all').first();
      await reviewAllBtn.click();
      await expect(diffModal).toBeVisible({ timeout: 5000 });
      
      // Close modal again
      const diffCancelBtnGlobal = window.locator('.lda-diff-actions .lda-btn-secondary').first();
      await diffCancelBtnGlobal.click();
      await expect(diffModal).toBeHidden({ timeout: 5000 });
      
      // Re-open popover to click Accept All
      await badgeBtn.click();
      await expect(pagePopover).toBeVisible({ timeout: 5000 });
      
      const acceptAllBtn = pagePopover.locator('.accept-all').first();
      await acceptAllBtn.click();
      
      // Wait for all merges to clear
      console.log("Waiting for all merges to clear...");
      await expect(window.locator('.lda-merge-controls')).toHaveCount(0, { timeout: 15000 });
      await expect(pageToolbar).toBeHidden({ timeout: 10000 });

    } finally {
      await app.close();
    }
  });
});
