# E2E Test Creation Guideline (Doc Agent)

This document explains how to create new E2E tests for the Logseq Doc Agent using the **Chatlog Replay** mechanism. This approach allows us to verify complex AI-driven graph mutations without calling a real LLM during every test run, while handling non-deterministic Block IDs via **Content-Based ID Remapping**.

## 1. Overview of the Strategy

1.  **Record**: Perform the interaction manually in a real Logseq instance.
2.  **Snapshot**: Capture the state of the graph _at the moment_ the AI was called (this provides the "source" for ID remapping).
3.  **Remap**: Use fuzzy content matching to map recorded IDs → snapshot IDs → current graph IDs.
4.  **Replay**: Inject the remapped chatlog into a clean test graph and verify the results.

---

## 2. Preparing a Test Case

### A. Create a Graph Template

Ensure your test graph starts from a known state.

1.  Store your starting graph in `tests/graph-template`.
2.  The E2E runner automatically clears `tests/graph` and copies from the template before each run.

### B. Record a Chatlog

1.  Open Logseq with your template graph.
2.  Open the Chat Sidebar and perform the task (e.g., "Rework this document").
3.  Locate the saved chatlog JSON in your Logseq storage:
    `~/.logseq/assets/storages/logseq-doc-agent/chatlogs/<date>-<slug>.json`
4.  Copy this file to `tests/graph-template/assets/storages/logseq-doc-agent/chatlogs/`.

### C. Capture a Graph Snapshot

The remapper needs to know what the graph looked like _at the time of recording_.

1.  Run the **`get_logseq_document`** tool (or just copy the context embedded in the first message of your chatlog).
2.  Save this as a text file in `tests/graph-template/snapshots/<Page Name>.txt`.
    _Format must follow the outliner syntax used by the agent (e.g., `- id:123 Content`)._

---

## 3. Creating the Playwright Test

Create a new file `tests/e2e/electron/<feature>.spec.ts`.

### Template Structure:

```typescript
import fs from "node:fs";
import { test, expect, _electron as electron } from "@playwright/test";
import { buildFullRemap, extractChatlogContext, remapChatlog } from "../lib/id-remapper";

// Canonical helper to inject a replay chatlog into the plugin iframe
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

test("Feature description", async ({}, testInfo) => {
  // 1. Load chatlog and snapshot
  const chatlog = JSON.parse(fs.readFileSync('path/to/chatlog.json', 'utf8'));
  const snapshotText = fs.readFileSync('path/to/snapshot.txt', 'utf8');
  const chatlogContext = extractChatlogContext(chatlog);

  // 2. Launch App
  const app = await electron.launch({ ... });
  const window = await app.firstWindow();

  // 3. Build Content-Based ID Remap
  const currentText = await getPageTreeFromLiveApp(window, "Page Name");
  const idMap = buildFullRemap(chatlogContext, snapshotText, currentText);
  const remappedChatlog = remapChatlog(chatlog, idMap);

  // 4. Inject
  await injectReplayChatlog(window, remappedChatlog);

  // 5. Trigger & Verify
  // ⚠️ CRITICAL: Chat UI spans TWO documents — see locator rules below
  await window.locator('a[data-on-click="open-chat"]').click();        // toolbar (main window)
  await window.locator('.lda-chat-textarea').fill('User message');     // textarea (main window)
  await window.locator('.lda-chat-textarea').press('Enter');           // submit (main window)

  // Message bubbles & structured responses are inside the plugin iframe
  const chatFrame = window.frameLocator('iframe[id*="logseq-doc-agent"]');
  await expect(chatFrame.locator('text=/Done/')).toBeVisible();

  // Assert state via Logseq API
  const tree = await getPageTreeFromLiveApp(window, "Page Name");
  expect(tree).toContain("Expected Result");
});
```

### ⚠️ Two-Document DOM Layout

The Logseq plugin renders elements in **two separate documents**:

| Document                                     | Elements                                                               | Playwright Locator                                      |
| -------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------- |
| **Main window**                              | Toolbar button, textarea, model selector, send button                  | `window.locator(".lda-chat-textarea")`                  |
| **Plugin iframe** (`id*="logseq-doc-agent"`) | Message bubbles, section headings, maximize button, modals, tool cards | `window.frameLocator('iframe[id*="logseq-doc-agent"]')` |

**Golden rule**: if `window.locator()` can't find a `.lda-*` element, it's inside the iframe — switch to `frameLocator`.

```typescript
// ✅ Correct: split locators by document
const textarea = window.locator(".lda-chat-textarea").first(); // main window
const chatFrame = window.frameLocator('iframe[id*="logseq-doc-agent"]'); // iframe
const heading = chatFrame.locator(".lda-response-section-heading").first();
```

---

## 4. Key Utilities

- **`buildFullRemap`**: The core logic in `tests/e2e/lib/id-remapper.ts`. It uses normalized content strings (stripping Logseq property prefixes and markdown) to match blocks regardless of their `:db/id`.
- **`extractChatlogContext`**: Extracts the exact graph state that was sent to the LLM from the recorded chatlog's first message.
- **`evalInPluginFrame`**: Helper to run commands against the `window.logseq` API from the Playwright context.

---

## 5. Troubleshooting Common Issues

### "Assertion: found 0 blocks updated"

- **Symptom**: The replay says it's done, but no changes happened.
- **Cause**: Likely a `tool-call` vs `tool_call` mismatch (hyphen vs underscore). Ensure the remapper and replay service both check for the variant used in your JSON.
- **Cause**: Content mismatch in remapping. Check the `[IdRemapper]` logs in the test output for "No match" warnings.

### "Transit Error: Cannot write Bean"

- **Symptom**: Logseq errors in the browser console during the test.
- **Cause**: Passing complex JS objects or Svelte proxies to the Logseq SDK.
- **Fix**: Wrap return values and tool arguments in `JSON.parse(JSON.stringify(obj))` before passing them between the test environment and the Logseq SDK.

### Send button not working

- **Symptom**: Playwright clicks the button but nothing happens.
- **Fix**: Use `locator.pressSequentially()` instead of `fill()` to ensure Svelte's `bind:value` is updated and the button becomes enabled.

### Locator can't find `.lda-*` elements after they appear visually

- **Symptom**: Test passes in development (`npm run dev` → `logseq-sim.html`) but fails in the Electron E2E environment when searching for `.lda-response-section-heading`, `.lda-bubble`, or other rendered UI elements.
- **Cause**: Playwright `window.locator()` only searches the **main document**. The Logseq plugin renders message bubbles and response sections inside a **plugin iframe** (`<iframe id="logseq-doc-agent">`), which is a separate document.
- **Fix**: Use `window.frameLocator('iframe[id*="logseq-doc-agent"]')` for all elements inside the plugin iframe. See the [Two-Document DOM Layout](#two-document-dom-layout) section for the full mapping.
- **Diagnosis trick**: Run this in the test to confirm the element lives in the iframe:
  ```typescript
  await window.evaluate(() => {
    const iframe = document.querySelector('iframe[id*="logseq-doc-agent"]');
    const doc = (iframe as any).contentDocument;
    console.log("Main bubbles:", document.querySelectorAll(".lda-bubble").length);
    console.log("Iframe bubbles:", doc?.querySelectorAll(".lda-bubble")?.length);
  });
  ```
