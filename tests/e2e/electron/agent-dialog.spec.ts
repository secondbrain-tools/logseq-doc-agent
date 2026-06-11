import fs from "node:fs";
import path from "node:path";
import { ensureGraphOpen } from "../../../scripts/logseq/graph-bootstrap";
import { test, expect, _electron as electron } from "@playwright/test";
import { buildFullRemap, extractChatlogContext, remapChatlog } from "../lib/id-remapper";
import { getLogseqLaunchEnv, loadRuntimeConfig } from "./runtime";

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
    { fn },
  );
}

test.describe("Agent Chatlog Replay", () => {
  test("replays a recorded chatlog modifying a document", async () => {
    test.setTimeout(180_000);

    const graphTemplateDir = path.resolve("tests/graph-template");
    const snapshotPath = path.join(graphTemplateDir, "snapshots/Merge Content.txt");
    const chatlogPath = path.join(
      graphTemplateDir,
      "assets/storages/logseq-doc-agent/chatlogs/2026-03-27-rework-document.json",
    );

    const snapshotText = fs.readFileSync(snapshotPath, "utf-8");
    const chatlogRaw = JSON.parse(fs.readFileSync(chatlogPath, "utf-8"));
    const chatlogContextText = extractChatlogContext(chatlogRaw);

    const runtime = loadRuntimeConfig();
    const app = await electron.launch({
      executablePath: runtime.executablePath,
      args: [runtime.graphDir],
      env: getLogseqLaunchEnv(runtime),
    });

    try {
      const window = await app.firstWindow();
      window.on("console", (msg) => {
        if (
          msg.type() === "error" ||
          msg.text().includes("[ChatlogReplayAIService]") ||
          msg.text().includes("[IdRemapper]")
        ) {
          console.log(`[BROWSER][${msg.type()}] ${msg.text()}`);
        }
      });

      await window.waitForSelector("#app, .cp__header, .add-graph-btn", {
        state: "visible",
        timeout: 45000,
      });
      await ensureGraphOpen(window, runtime.graphDir);
      await window.waitForSelector("#app, .cp__header", { state: "visible", timeout: 45000 });
      const toolbarItem = window.locator('a[data-on-click="open-chat"]');

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
        `,
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
        `,
      );

      console.log(`Assertion Result: found ${result.updatedCount} blocks updated.`);
      if (result.updatedCount === 0) {
        console.log("Sample content from graph:", JSON.stringify(result.sampleContent, null, 2));
      }

      expect(result.updatedCount).toBeGreaterThanOrEqual(10);

      // ─── 11. Verify Merge Data via API ────────────────────────────────
      // Note: merge UI controls (.lda-merge-controls) are only injected on the
      // currently-displayed page. Since we can't reliably navigate to "Merge Content"
      // in E2E, we verify merge data directly through the Logseq API.
      console.log("Verifying merge block data via API...");

      const mergeStatus = await evalInPluginFrame(
        window,
        `
        var logseqApi = window.__LDA_TEST_LOGSEQ_API__ || window.logseq;
        var page = await logseqApi.getPage("Merge Content");
        var blocks = await logseqApi.getPageBlocksTree(page.name);
        var mergeBlocks = [];
        async function walk(bs) {
          for (var i = 0; i < bs.length; i++) {
            var b = bs[i];
            var mergeValue = await logseqApi.Editor.getBlockPropertyContent(
              b.uuid,
              "logseq-doc-agent.merge"
            );
            if (mergeValue) mergeBlocks.push({ id: b.id, hasMergeProp: true });
            if (b.children) await walk(b.children);
          }
        }
        await walk(blocks);
        return { mergeBlockCount: mergeBlocks.length };
      `,
      );

      console.log(`Merge block count via API: ${mergeStatus.mergeBlockCount}`);
      expect(mergeStatus.mergeBlockCount).toBeGreaterThanOrEqual(5);

      console.log("✅ Merge data verified via API!");
    } finally {
      await app.close();
    }
  });
});
