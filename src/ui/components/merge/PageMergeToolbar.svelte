<script lang="ts">
import { MergeActionService } from "../../../application/services/merge-action.service";
import { Services } from "../../../services";
import { ICONS } from "../../icons";
import type { MergeState } from "../../../application/usecases/merge-state.svelte";
import { onMount } from "svelte";
import DiffModal from "./DiffModal.svelte";
import {
  MergeTreeService,
  type MergeTreeItem,
} from "../../../application/services/merge-tree.service";
import {
  filterProperties,
  LDA_MERGE_PROPERTY,
  LDA_MERGE_PROPERTY_CAMEL,
} from "../../../domain/logseq/properties";
import type { MergeEntity } from "../../../domain/merge/entity";

let {
  mergeState,
}: {
  mergeState: MergeState;
} = $props();

// Default isOpen to true on mount. Since we unmount when count is 0,
// this effectively means "open by default when first appearing".
let isOpen = $state(true);
let popupStyle = $state("");
let buttonRef: HTMLElement | undefined = $state();
let showDiffModal = $state(false);
let mergeTree: MergeTreeItem[] = $state([]);

const mergeActionService = new MergeActionService();
const mergeTreeService = new MergeTreeService();

onMount(() => {
  // Add small delay to ensure layout is settled
  setTimeout(() => {
    if (isOpen && buttonRef) {
      updatePosition(buttonRef);
    }
  }, 50);
});

// ...

// Responsive positioning logic
function updatePosition(button: HTMLElement) {
  const rect = button.getBoundingClientRect();
  const doc = button.ownerDocument || document;
  const mainContainer = doc.getElementById("main-content-container");
  const rightSidebar = doc.getElementById("right-sidebar");

  let referenceRightEnd = 0;

  if (mainContainer) {
    const containerRect = mainContainer.getBoundingClientRect();
    referenceRightEnd = containerRect.right;
  } else {
    referenceRightEnd = rect.right;
  }

  if (rightSidebar) {
    const rsRect = rightSidebar.getBoundingClientRect();
    if (rsRect.width > 0 && rsRect.left < referenceRightEnd) {
      referenceRightEnd = rsRect.left;
    }
  }

  const win = doc.defaultView || window;
  const winWidth = win.innerWidth;
  let rightPos = winWidth - referenceRightEnd + 10;
  if (rightPos < 10) rightPos = 10;

  popupStyle = `top: ${rect.bottom + 6}px; right: ${rightPos}px; left: auto;`;
}

function toggleMenu(event: MouseEvent) {
  if (!isOpen) {
    updatePosition(event.currentTarget as HTMLElement);
  }
  isOpen = !isOpen;
}

async function refreshInjection() {
  await new Promise((resolve) => setTimeout(resolve, 100));
  Services.instance.injectMergesUseCase.execute();
}

// ... handleAcceptAll / handleRevertAll unchanged ...

function collectMergeBlocks(blocks: any[]): string[] {
  const uuids: string[] = [];
  for (const block of blocks) {
    if (
      block.properties?.[LDA_MERGE_PROPERTY_CAMEL] ||
      block.content?.includes(`${LDA_MERGE_PROPERTY}::`)
    ) {
      uuids.push(block.uuid);
    }
    if (block.children) {
      uuids.push(...collectMergeBlocks(block.children));
    }
  }
  return uuids;
}

async function handleAcceptAll(
  event?: CustomEvent<{
    content?: string;
    treeEdits?: Record<string, string>;
  }>,
) {
  if (showDiffModal) {
    showDiffModal = false;
  }
  try {
    // Check for Tree Edits first (Batch Mode from Modal)
    if (event && event.detail && event.detail.treeEdits) {
      const settings = (logseq.settings as any) || {};
      const patternsRaw = (settings["mergeFilterPatterns"] as string) || "logseq-doc-agent.*";
      const patterns = patternsRaw.split("\n").filter((s) => s.trim().length > 0);

      const edits = event.detail.treeEdits;
      await mergeActionService.acceptBatchMerge(edits, patterns);
      await refreshInjection();
      return;
    }

    const currentPage = await logseq.Editor.getCurrentPage();
    if (!currentPage) return;

    const blocks = await logseq.Editor.getPageBlocksTree(currentPage.uuid);

    const mergeUuids = collectMergeBlocks(blocks);

    for (const uuid of mergeUuids) {
      await mergeActionService.quickAccept(uuid);
    }

    await logseq.UI.showMsg(`Accepted ${mergeUuids.length} merge blocks`, "success");
    // Don't close immediately, let the refresh handle state (count -> 0 -> unmount)
    await refreshInjection();
  } catch (e) {
    console.error("[PageMergeToolbar] Failed to accept all:", e);
    await logseq.UI.showMsg("Failed to accept all merges", "error");
  }
}

async function handleRevertAll() {
  if (showDiffModal) {
    showDiffModal = false;
  }
  try {
    const currentPage = await logseq.Editor.getCurrentPage();
    if (!currentPage) return;

    const blocks = await logseq.Editor.getPageBlocksTree(currentPage.uuid);

    const mergeUuids = collectMergeBlocks(blocks);

    await mergeActionService.revertMerge(mergeUuids);

    await logseq.UI.showMsg(`Reverted ${mergeUuids.length} merge blocks`, "success");
    await refreshInjection();
  } catch (e) {
    console.error("[PageMergeToolbar] Failed to revert all:", e);
    await logseq.UI.showMsg("Failed to revert all merges", "error");
  }
}

async function handleMergeAll() {
  try {
    const currentPage = await logseq.Editor.getCurrentPage();
    if (!currentPage) return;

    // Fetch settings for patterns
    const settings = (logseq.settings as any) || {};
    const patternsRaw = (settings["mergeFilterPatterns"] as string) || "logseq-doc-agent.*";
    const patterns = patternsRaw.split("\n").filter((s) => s.trim().length > 0);

    // 1. Fetch Tree for Page
    const tree = await mergeTreeService.getPageMergeTree(currentPage.uuid);

    // 2. Process Tree for Display (Filtering)
    const processedTree: MergeTreeItem[] = [];

    for (const item of tree) {
      // Filter current content
      const [cleanContent, header] = filterProperties(item.content, patterns);

      // Clone mergeData to avoid mutating the original tree
      const mergeData = item.mergeData ? { ...item.mergeData } : undefined;

      if (mergeData) {
        // Update currentContent reference for UI
        if (mergeData.type === "delete") {
          mergeData.currentContent = "";
        } else {
          mergeData.currentContent = cleanContent;
        }

        // Filter base content (original content before LLM changes)
        if (mergeData.base) {
          const [cleanBase, _] = filterProperties(mergeData.base, patterns);
          mergeData.base = cleanBase;
        }
      }

      processedTree.push({
        ...item,
        content: cleanContent,
        mergeData,
      });
    }

    // Filter to show only items with pending merges
    mergeTree = processedTree.filter((item) => !!item.mergeData);
    isOpen = false; // Close the toolbar popover
    showDiffModal = true;
  } catch (e) {
    console.error("[PageMergeToolbar] Failed to open merge modal:", e);
    await logseq.UI.showMsg("Failed to open merge view", "error");
  }
}
</script>

<div class="lda-merge-wrapper">
  <!-- Anchor Token in Pagebar -->
  <button
    class="lda-merge-badge"
    onclick={toggleMenu}
    bind:this={buttonRef}
    title="{mergeState.count} pending changes. Click to manage."
  >
    <span class="badg-icon">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        {@html ICONS.merge}
      </svg>
    </span>
    {#if mergeState.count > 0}
      <span class="badge-count">{mergeState.count}</span>
    {/if}
  </button>

  <!-- Dropdown / Horizontal Popover -->
  {#if popupStyle}
    <div
      class="lda-page-merge-toolbar-popover horizontal-layout"
      class:visible={isOpen}
      style={popupStyle}
    >
      <span class="merge-count-label"><b>{mergeState.count}</b> changes</span>
      <div class="sep"></div>
      <button
        class="lda-toolbar-btn accept-all compact"
        onclick={() => handleAcceptAll()}
        title="Accept All"
      >
        ✓ Accept
      </button>
      <button class="lda-toolbar-btn merge-all compact" onclick={handleMergeAll} title="Review All">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          style="width: 14px; height: 14px; margin-right: 4px;"
        >
          {@html ICONS.merge}
        </svg>
        Merge
      </button>
      <button
        class="lda-toolbar-btn revert-all compact"
        onclick={handleRevertAll}
        title="Revert All"
      >
        ✗ Revert
      </button>
      <button class="close-btn-compact" onclick={() => (isOpen = false)} title="Close">×</button>
    </div>
  {/if}

  <DiffModal
    isOpen={showDiffModal}
    mergeData={undefined}
    {mergeTree}
    on:close={() => (showDiffModal = false)}
    on:accept={handleAcceptAll}
    on:revert={handleRevertAll}
  />
</div>
