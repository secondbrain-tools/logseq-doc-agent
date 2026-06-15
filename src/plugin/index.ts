import { Services } from "../services";
import { setupSettings } from "./settings-manager";
import { LogseqSettingsAdapter } from "../infra/logseq/settings-adapter";
import "@logseq/libs";

// Standard imports to include in the bundle (dist/index.css)
import "../app.css";
import "../ui/styles/evaluation-components.css";
import "../ui/styles/merge-components.css";
import "../ui/styles/modal.css";
import "../ui/styles/chat.css";
import "../ui/styles/diff.css";
import "../ui/styles/sidebar-window.css";

import { InitDataService } from "../application/services/init-data.service";

export const setupPlugin = async () => {
  console.log("[src/plugin/index.ts] setupPlugin() called");

  // Inject CSS via Link tag
  const doc = parent.document; // Inject into parent document (Logseq UI)
  if (doc) {
    const linkId = "logseq-doc-agent-css-bundle";

    // Remove existing
    doc.getElementById(linkId)?.remove();

    // Construct path to index.css
    // import.meta.url points to this script (e.g. .../dist/index.js)
    const cssUrl = new URL(/* @vite-ignore */ "./index.css", import.meta.url).href;

    // Local Bundle
    const link = doc.createElement("link");
    link.id = linkId;
    link.rel = "stylesheet";
    link.href = cssUrl;

    doc.head.appendChild(link);

    logseq.beforeunload(async () => {
      doc.getElementById(linkId)?.remove();

      // Clean up all services properly
      Services.instance.dispose();
    });
  }

  // Initialize/Get Services
  const services = await Services.initialize();

  // Instantiate InitDataService locally
  const settingsAdapter = new LogseqSettingsAdapter();
  const initDataService = new InitDataService(services.logseqApi, settingsAdapter);

  // Setup user settings
  await setupSettings();

  // Initialize Plugin Data (Pages/Defaults)
  await initDataService.initialize();

  // Ensure built-in agents (Default, Ask) exist
  await services.initializeAgents();

  // Re-run initialization if storageRoot changes
  logseq.onSettingsChanged(async (newSettings, oldSettings) => {
    const newRoot = newSettings["storageRoot"];
    const oldRoot = oldSettings["storageRoot"];
    if (newRoot !== oldRoot) {
      console.log(`[Plugin] Storage root changed from ${oldRoot} to ${newRoot}`);
      await initDataService.migrateStorageRoot(oldRoot, newRoot);
    }
  });

  // Register Toolbar Chat Button
  services.toolbarInjector.injectToolbarItem(
    "open-chat",
    "ti-message", // Icon class
    "AI Chat",
    () => {
      services.chatUseCase.openChat({ focus: true });
    },
  );

  // Register Merge Toolbar Pagebar Item (placeholder for dynamic content)
  services.injectMergesUseCase.registerPagebarItem();

  // Register Evaluation Toolbar Pagebar Item
  services.injectEvaluationsUseCase.registerPagebarItem();

  // Register Command Palette & Hotkey for Opening Chat
  logseq.App.registerCommandPalette(
    {
      key: "open-chat-palette",
      label: "Open Chat",
      keybinding: {
        binding: "g c",
        mode: "non-editing",
      },
    },
    () => {
      console.log("goto chat");
      services.chatUseCase.openChat({ focus: true });
    },
  );

  // Register Command Palette & Hotkey for Opening Chat
  logseq.App.registerCommandPalette(
    {
      key: "toggle-chat-expand",
      label: "Toggle Chat Expand",
      keybinding: {
        binding: "alt+c",
        mode: "global",
      },
    },
    () => {
      console.log("toggle chat expand");
      services.chatUseCase.toggleExpand();
    },
  );

  // Register Command for Focusing Merge Controls
  logseq.App.registerCommandPalette(
    {
      key: "focus-merge-controls",
      label: "Focus Merge Controls",
      keybinding: {
        binding: "m",
        mode: "non-editing",
      },
    },
    async () => {
      console.log("[Command] focus-merge-controls triggered");
      const block = await services.logseqApi.getCurrentBlock();
      if (block) {
        console.log("[Command] Current block:", block.uuid);
        // Dispatch event to the block element
        // We need to find the element in the DOM.
        // In the main Logseq window, blocks have `blockid` attribute.
        const doc = parent.document;
        const blockEl = doc.querySelector(`div[blockid="${block.uuid}"]`);
        if (blockEl) {
          console.log("[Command] Found block element, dispatching event");
          blockEl.dispatchEvent(
            new CustomEvent("lda-focus-merge-controls", {
              bubbles: true,
              cancelable: true,
            }),
          );
        } else {
          console.warn("[Command] Block element not found in DOM");
        }
      } else {
        console.warn("[Command] No current block selected");
      }
    },
  );

  // Register a slash command to get block content
  logseq.Editor.registerSlashCommand("Get Block Content", async () => {
    try {
      const currentPage = await logseq.Editor.getCurrentPage();
      if (currentPage && currentPage.uuid) {
        console.log("Current page:", currentPage);
      } else {
        await logseq.UI.showMsg("No current page found", "error");
      }
    } catch (error) {
      console.error("Error getting block content:", error);
      await logseq.UI.showMsg("Error getting block content", "error");
    }
  });

  // Register a block context menu item
  logseq.Editor.registerBlockContextMenuItem(
    "Inspect Feedback Prompts",
    async ({ uuid }: { uuid: string }) => {
      try {
        console.log("[Inspect Feedback Query] Triggered for block:", uuid);

        const prompts = await services.promptRepo.getFeedbackPrompts();

        console.log("[Inspect Feedback Query] found prompts:", prompts);
        console.table(prompts);
        logseq.UI.showMsg(
          `Found ${prompts.length} feedback prompts. Check console for details.`,
          "success",
        );
      } catch (error) {
        console.error("Error inspecting prompts:", error);
        await logseq.UI.showMsg("Error inspecting prompts", "error");
      }
    },
  );

  // Helper for debouncing
  const debounce = (func: Function, wait: number) => {
    let timeout: any;
    return (...args: any[]) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  };

  // Unified injection function
  const injectComponents = async () => {
    // Small delay to ensure DOM is ready (especially for route changes)
    setTimeout(() => {
      try {
        services.injectEvaluationsUseCase.execute();
        services.injectMergesUseCase.execute();
      } catch (error) {
        console.error("Error injecting feedback components:", error);
      }
    }, 100);
  };

  // 1. Route Changed Listener
  services.logseqApi.onRouteChanged(() => {
    console.log("[src/plugin/index.ts] Route changed, triggering injection...");
    injectComponents();
  });

  // 2. DB Changed Listener (Debounced)
  // This handles block updates, creation, deletion, moves etc.
  const debouncedOnDbChanged = debounce(() => {
    console.log("[src/plugin/index.ts] DB changed, triggering injection...");
    injectComponents();
  }, 500);

  services.logseqApi.onGraphChanged((e) => {
    // Optional: Filter events if needed, but for now we just debounce everything
    debouncedOnDbChanged();
  });

  // Initial injection on startup (after DOM is ready)
  console.log("[src/plugin/index.ts] Scheduling initial injection...");
  setTimeout(() => {
    console.log("[src/plugin/index.ts] Running initial injection");
    injectComponents();
  }, 500);
};
