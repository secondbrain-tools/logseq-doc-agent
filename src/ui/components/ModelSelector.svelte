<script lang="ts">
    import { onMount, onDestroy } from "svelte";

    // Types
    export interface ModelItem {
        id: string;
        name: string;
    }

    export interface ProviderGroup {
        providerId: string;
        providerName: string;
        models: ModelItem[];
    }

    interface Props {
        value: string;
        groups: ProviderGroup[];
        disabled?: boolean;
        onChange?: (newValue: string) => void;
    }

    let {
        value = $bindable(),
        groups = [],
        disabled = false,
        onChange,
    }: Props = $props();

    // State
    let isOpen = $state(false);
    let triggerRef = $state<HTMLElement>();
    let popoverRef = $state<HTMLElement>();
    // Initialize hidden to prevent jump before positioning
    let popoverStyle = $state(
        "visibility: hidden; position: absolute; top: 0; left: 0;",
    );

    // Cleanup for global listeners
    let cleanupListeners = () => {};

    // Derived
    let selectedModelName = $derived(getSelectedModelName(value, groups));

    function getSelectedModelName(val: string, grps: ProviderGroup[]): string {
        for (const g of grps) {
            const found = g.models.find((m) => m.id === val);
            if (found) return found.name;
        }
        return val || "Select Model";
    }

    function toggleOpen(e: MouseEvent) {
        if (!disabled) {
            e.stopPropagation();
            isOpen = !isOpen;
        }
    }

    function selectModel(id: string) {
        value = id;
        if (onChange) onChange(id);
        isOpen = false;
    }

    // --- Positioning Logic ---
    function updatePosition() {
        if (!isOpen || !triggerRef) return;

        const rect = triggerRef.getBoundingClientRect();
        const targetWin = window.parent || window;
        const scrollX = targetWin.scrollX || targetWin.pageXOffset;
        const scrollY = targetWin.scrollY || targetWin.pageYOffset;

        // Position roughly 4px above the trigger
        // We use translateY(-100%) to flip it upwards from the top edge
        const gap = 4;

        const top = rect.top + scrollY - gap;
        const left = rect.left + scrollX;
        const width = Math.max(rect.width, 220); // Min width 220

        popoverStyle = `
            position: absolute;
            top: ${top}px;
            left: ${left}px;
            width: ${width}px;
            transform: translateY(-100%);
            z-index: 99999;
        `;
    }

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

    // --- Effects ---
    $effect(() => {
        const targetWin = window.parent || window;
        if (isOpen) {
            // Need to wait for DOM update to render portal content so we can measure?
            // Actually style is applied during render loop, but let's ensure position is correct.
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

        const clickHandler = (e: Event) => {
            const target = e.target as HTMLElement;
            // If click inside trigger or popover, ignore
            if (triggerRef && triggerRef.contains(target)) return;
            if (popoverRef && popoverRef.contains(target)) return;
            // Also check if target is inside portal container if ref check fails (shouldn't if bind works)

            // Otherwise close
            if (isOpen) isOpen = false;
        };

        const keyHandler = (e: KeyboardEvent) => {
            if (e.key === "Escape" && isOpen) {
                isOpen = false;
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

<div class="lda-model-selector">
    <button
        bind:this={triggerRef}
        class="lda-model-trigger"
        onclick={toggleOpen}
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
            <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
    </button>

    {#if isOpen}
        <div
            use:portal
            bind:this={popoverRef}
            class="lda-model-dropdown-portal"
            style={popoverStyle}
        >
            {#each groups as group}
                <div class="lda-provider-group">
                    <div class="lda-provider-header">{group.providerName}</div>
                    {#each group.models as model}
                        <button
                            class="lda-model-item"
                            class:selected={model.id === value}
                            onclick={() => selectModel(model.id)}
                        >
                            <span>{model.name}</span>
                            {#if model.id === value}
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
                                    <polyline points="20 6 9 17 4 12"
                                    ></polyline>
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
