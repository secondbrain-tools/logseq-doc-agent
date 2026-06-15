<script lang="ts">
import { onMount, onDestroy } from "svelte";
import { clickHandler } from "../../util/actions";

// Types
export interface ModelItem {
  id: string;
  name: string;
  supportsReasoning?: boolean;
}

export interface ProviderGroup {
  providerId: string;
  providerName: string;
  models: ModelItem[];
}

interface Props {
  value: string;
  providerId?: string; // New prop
  groups: ProviderGroup[];
  disabled?: boolean;
  onChange?: (newValue: string, providerId: string) => void; // Updated signature
}

let {
  value = $bindable(),
  providerId = $bindable(""), // Bindable providerId
  groups = [],
  disabled = false,
  onChange,
}: Props = $props();

// State
let isOpen = $state(false);
let triggerRef = $state<HTMLElement>();
let popoverRef = $state<HTMLElement>();
// Initialize hidden to prevent jump before positioning
let popoverStyle = $state("visibility: hidden; position: absolute; top: 0; left: 0;");

// Cleanup for global listeners
let cleanupListeners = () => {};

// Derived
let selectedModelName = $derived(getSelectedModelName(value, providerId, groups));

function getSelectedModelName(val: string, pid: string, grps: ProviderGroup[]): string {
  for (const g of grps) {
    // If providerId is known, check matching provider first
    if (pid && g.providerId !== pid) continue;

    const found = g.models.find((m) => m.id === val);
    if (found) {
      // Double check if we are just searching by ID (fallback) or if we matched provider
      return found.name;
    }
  }
  // Fallback search if providerId was empty but val exists (e.g. init)
  if (!pid && val) {
    for (const g of grps) {
      const found = g.models.find((m) => m.id === val);
      if (found) return found.name;
    }
  }
  return val || "Select Model";
}

function toggleOpen(e: MouseEvent) {
  if (!disabled) {
    e.stopPropagation();
    isOpen = !isOpen;
  }
}

function selectModel(id: string, pid: string) {
  value = id;
  providerId = pid;
  if (onChange) onChange(id, pid);
  isOpen = false;
}

// --- Positioning Logic ---
function updatePosition() {
  if (!isOpen || !triggerRef) return;

  const rect = triggerRef.getBoundingClientRect();

  // Use fixed positioning relative to viewport
  // Position upwards (translateY -100%) above the trigger
  const gap = 4;
  const top = rect.top - gap;
  const left = rect.left;
  const width = Math.max(rect.width, 220); // Min width 220

  popoverStyle = `
            position: fixed;
            top: ${top}px;
            left: ${left}px;
            width: ${width}px;
            transform: translateY(-100%);
            z-index: 99999;
        `;
}

// --- Actions ---
function genericClick(node: HTMLElement, fn: () => void) {
  const handler = (e: MouseEvent) => {
    e.stopPropagation();
    fn();
  };
  node.addEventListener("click", handler);
  // Prevent popover close on click inside logic (which uses document listener)
  // We must stop propagation of mousedown to prevent logic that closes popover on 'outside' click if that logic triggers on mousedown.
  // In this file, global listener is 'click', but just in case or for consistency with Pattern.
  // Actually, preventing mousedown propagation might prevent focus changes or other behaviors, but let's stick to the working pattern.
  const stop = (e: Event) => e.stopPropagation();
  node.addEventListener("mousedown", stop);

  return {
    destroy() {
      node.removeEventListener("click", handler);
      node.removeEventListener("mousedown", stop);
    },
  };
}

// --- Effects ---
$effect(() => {
  const targetWin = window.parent || window;
  if (isOpen) {
    updatePosition();
    targetWin.addEventListener("scroll", updatePosition, true);
    targetWin.addEventListener("resize", updatePosition);
  }
  return () => {
    targetWin.removeEventListener("scroll", updatePosition, true);
    targetWin.removeEventListener("resize", updatePosition);
  };
});

onMount(() => {
  const targetDoc = window.parent?.document || window.document;

  const clickOutsideHandler = (e: Event) => {
    const target = e.target as HTMLElement;
    // If click inside trigger or popover, ignore
    if (triggerRef && triggerRef.contains(target)) return;
    if (popoverRef && popoverRef.contains(target)) return;

    // Otherwise close
    if (isOpen) isOpen = false;
  };

  const keyHandler = (e: KeyboardEvent) => {
    if (e.key === "Escape" && isOpen) {
      isOpen = false;
    }
  };

  targetDoc.addEventListener("click", clickOutsideHandler);
  targetDoc.addEventListener("keydown", keyHandler);

  cleanupListeners = () => {
    targetDoc.removeEventListener("click", clickOutsideHandler);
    targetDoc.removeEventListener("keydown", keyHandler);
  };
});

onDestroy(() => {
  cleanupListeners();
});
</script>

<div class="lda-model-selector">
  <button
    bind:this={triggerRef}
    class="lda-model-trigger"
    use:clickHandler={toggleOpen}
    {disabled}
    title="Select AI Model"
  >
    <span class="lda-model-name truncate">{selectedModelName}</span>
    <svg
      class="lda-chevron"
      class:open={isOpen}
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <polyline points="18 15 12 9 6 15"></polyline>
    </svg>
  </button>

  {#if isOpen}
    <div bind:this={popoverRef} class="lda-model-dropdown-portal" style={popoverStyle}>
      {#each groups as group}
        <div class="lda-provider-group">
          <div class="lda-provider-header">{group.providerName}</div>
          {#each group.models as model}
            <button
              class="lda-model-item"
              class:selected={model.id === value && group.providerId === providerId}
              use:genericClick={() => selectModel(model.id, group.providerId)}
            >
              <span>{model.name}</span>
              {#if model.id === value && group.providerId === providerId}
                <svg
                  class="lda-check"
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="3"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              {/if}
            </button>
          {/each}
        </div>
      {/each}
      {#if groups.length === 0}
        <div class="lda-no-models">No models configured</div>
      {/if}
    </div>
  {/if}
</div>
