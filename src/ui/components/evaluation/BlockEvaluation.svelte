<script lang="ts">
import { createEventDispatcher, onMount, onDestroy, untrack } from "svelte";
import EvaluationPopover from "./EvaluationPopover.svelte";
import EvaluationScore from "./EvaluationScore.svelte";
import type { BlockEvaluation } from "../../../domain/evaluation/entity";
import { FrontendEvaluationCalculator } from "../../../infra/frontend/evaluation-calculator";
import { AddToSidebarUseCase } from "../../../application/usecases/add-to-sidebar.usecase";
import { Services } from "../../../services";

let {
  evaluationData,
  blockId,
  blockText,
}: {
  evaluationData: BlockEvaluation;
  blockId?: string;
  blockText?: string;
} = $props();

let localEvaluationData = $state<BlockEvaluation>(untrack(() => evaluationData));
let showPopover = $state(false);

// Calculate the overall score dynamically or use summary
const calculator = new FrontendEvaluationCalculator();
const rating = $derived(calculator.calculateOverallScore(localEvaluationData));

// Element references
let buttonRef = $state<HTMLElement>();
let popoverRef = $state<HTMLElement>();
let popoverStyle = $state("");

const dispatch = createEventDispatcher();
let cleanupListeners = () => {};

// --- Positioning Logic ---

function updatePosition() {
  if (!showPopover || !buttonRef) return;

  const rect = buttonRef.getBoundingClientRect();

  // We must use the scroll position of the window where the element lives.
  // Since we are likely in the parent doc (Sidebar), use parent window.
  // Fallback to local window for simulation.
  const targetWin = window.parent || window;
  const scrollX = targetWin.scrollX || targetWin.pageXOffset;
  const scrollY = targetWin.scrollY || targetWin.pageYOffset;

  const top = rect.bottom + 5 + scrollY;
  const left = rect.left + scrollX;

  // Apply to state
  popoverStyle = `
        position: absolute;
        top: ${top}px;
        left: ${left}px;
        z-index: 11;
        width: max-content;
      `;
}

// Update position when opened
$effect(() => {
  // Determine target window (Parent for Logseq, Window for Sim)
  const targetWin = window.parent || window;

  if (showPopover) {
    updatePosition();
    // Add scroll listeners to target window to track movement
    // Capture phase is important if scroll happens in a sub-div
    targetWin.addEventListener("scroll", updatePosition, true);
    targetWin.addEventListener("resize", updatePosition);
  }

  return () => {
    targetWin.removeEventListener("scroll", updatePosition, true);
    targetWin.removeEventListener("resize", updatePosition);
  };
});

// --- Portal Action ---
function portal(node: HTMLElement) {
  const targetDoc = window.parent?.document || window.document;
  targetDoc.body.appendChild(node);

  // Initial pos
  updatePosition();

  return {
    destroy() {
      if (node.parentNode) {
        node.parentNode.removeChild(node);
      }
    },
  };
}

// --- Interaction Logic ---

function handleGlobalInteraction(event: Event) {
  const target = event.target as HTMLElement;

  if (target.closest(".lda-popover-container")) return;
  if (buttonRef && (buttonRef === target || buttonRef.contains(target))) return;

  // Use class check as backup if ref fails or is stale
  if (target.closest(".lda-feedback-rating") && target.contains(buttonRef as Node)) return;

  showPopover = false;
  dispatch("toggle", { show: false });
}

function openInSidebar() {
  const useCase = new AddToSidebarUseCase(Services.instance.sidebarInjector);
  useCase.showAnalysisSidebar(localEvaluationData, blockId, undefined, blockText);
}

function handleClick(event: MouseEvent) {
  event.stopPropagation();
  if (event.ctrlKey || event.metaKey) {
    openInSidebar();
    return;
  }
  showPopover = !showPopover;
  dispatch("toggle", { show: showPopover });
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    handleClick(event as any);
  }
}

function handlePopoverKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    showPopover = false;
    dispatch("toggle", { show: false });
  }
}

onMount(() => {
  // Determine the document we are mounted in.
  const targetDoc = window.parent?.document || window.document;

  // Listen for interactions on the parent document (Logseq UI)
  const clickHandler = (e: Event) => handleGlobalInteraction(e);
  const keyHandler = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      showPopover = false;
      dispatch("toggle", { show: false });
    }
  };

  targetDoc.addEventListener("click", clickHandler);
  targetDoc.addEventListener("keydown", keyHandler);

  cleanupListeners = () => {
    targetDoc.removeEventListener("click", clickHandler);
    targetDoc.removeEventListener("keydown", keyHandler);
  };
});

onDestroy(() => {
  cleanupListeners();
});
</script>

<div class="lda-dropdown-container">
  <button
    bind:this={buttonRef}
    type="button"
    class="lda-feedback-rating"
    onclick={handleClick}
    onkeydown={handleKeydown}
    title="Rating: {rating}/5 - Click for details, Ctrl+Click to open in Sidebar"
    aria-label="Rating {rating} out of 5 stars, click for details, Ctrl+Click to open in Sidebar"
  >
    <EvaluationScore {rating} showValue={false} size="md" />
  </button>

  {#if showPopover}
    <div
      use:portal
      bind:this={popoverRef}
      class="lda-popover-container"
      style={popoverStyle}
      onclick={(e) => e.stopPropagation()}
      onkeydown={handlePopoverKeydown}
      role="dialog"
      aria-labelledby="popover-title"
      tabindex="0"
    >
      <EvaluationPopover
        evaluationData={localEvaluationData}
        onDataUpdate={(updated) => {
          localEvaluationData = updated;
        }}
        {blockId}
        {blockText}
        {showPopover}
        on:close={() => {
          showPopover = false;
        }}
      />
    </div>
  {/if}
</div>
