<script lang="ts">
import { onMount } from "svelte";
import { ICONS } from "../../icons";
import { LDA_EVALUATION_PROPERTY } from "../../../domain/logseq/properties";
import type { EvaluationState } from "../../../application/usecases/evaluation-state.svelte";

let { evaluationState }: { evaluationState: EvaluationState } = $props();

let isOpen = $state(false);
let popupStyle = $state("");
let buttonRef: HTMLElement | undefined = $state();

onMount(() => {
  // Add small delay to ensure layout is settled
  setTimeout(() => {
    if (isOpen && buttonRef) {
      updatePosition(buttonRef);
    }
  }, 50);
});

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

function toggleMenu() {
  if (!isOpen && buttonRef) {
    updatePosition(buttonRef);
  }
  isOpen = !isOpen;
}

async function handleClearAll() {
  try {
    const uuidsToClear = [...evaluationState.uuids];
    isOpen = false;

    // Optional: confirm prompt
    // if (!confirm(`Are you sure you want to clear ${uuidsToClear.length} evaluation(s)?`)) return;

    let clearedCount = 0;
    for (const uuid of uuidsToClear) {
      // Remove the property
      await logseq.Editor.removeBlockProperty(uuid, LDA_EVALUATION_PROPERTY);
      clearedCount++;
    }

    // Note: The InjectEvaluationsUseCase listens to DB changes (via the plugin index.ts debounced listener)
    // It will re-query the page and hide the toolbar automatically when the count reaches 0.
    await logseq.UI.showMsg(`Cleared ${clearedCount} evaluation properties`, "success");
  } catch (e) {
    console.error("[PageEvaluationToolbar] Failed to clear evaluations:", e);
    await logseq.UI.showMsg("Failed to clear evaluations", "error");
  }
}

function clickOutsideAction(node: HTMLElement) {
  const handleClick = (e: MouseEvent) => {
    // Wait for next tick so button click doesn't immediately close it
    setTimeout(() => {
      const target = e.target as Node;
      if (!node.contains(target) && !buttonRef?.contains(target)) {
        isOpen = false;
      }
    }, 0);
  };
  const doc = parent.document || document;
  doc.addEventListener("click", handleClick, true);
  return {
    destroy() {
      doc.removeEventListener("click", handleClick, true);
    },
  };
}
</script>

<div class="lda-eval-wrapper">
  <!-- Anchor Token in Pagebar -->
  <button
    class="lda-eval-badge"
    onclick={toggleMenu}
    bind:this={buttonRef}
    title="{evaluationState.count} document evaluations. Click to manage."
  >
    <span class="badg-icon" style="color: var(--ls-success-text-color, #16a34a);">
      {@html ICONS.evaluation}
    </span>
    {#if evaluationState.count > 0}
      <span class="badge-count eval-count">{evaluationState.count}</span>
    {/if}
  </button>

  <!-- Dropdown / Popover -->
  {#if popupStyle}
    <div
      class="lda-eval-toolbar-popover"
      class:visible={isOpen}
      style={popupStyle}
      use:clickOutsideAction
    >
      <span class="eval-count-label"><b>{evaluationState.count}</b> evaluations</span>
      <div class="sep"></div>
      <button
        class="lda-toolbar-btn clear-all compact"
        onclick={handleClearAll}
        title="Remove all evaluation properties from this page"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
          ></path>
          <line x1="10" y1="11" x2="10" y2="17"></line>
          <line x1="14" y1="11" x2="14" y2="17"></line>
        </svg>
        Clear Evaluations
      </button>
      <button class="close-btn-compact" onclick={() => (isOpen = false)} title="Close">×</button>
    </div>
  {/if}
</div>
