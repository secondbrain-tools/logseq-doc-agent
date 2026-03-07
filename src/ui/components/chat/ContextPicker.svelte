<script lang="ts">
    import { fade } from "svelte/transition";
    import type { ContextItem } from "../../../infra/logseq/context-utils";

    interface Props {
        mode: "page" | "block";
        items: ContextItem[];
        filterText: string;
        onSelect: (item: ContextItem) => void;
        onClose: () => void;
    }

    let { mode, items, filterText, onSelect, onClose }: Props = $props();

    let selectedIndex = $state(0);

    // Keep selectedIndex in bounds when list changes
    $effect(() => {
        if (items.length > 0 && selectedIndex >= items.length) {
            selectedIndex = 0;
        }
    });

    let listElement: HTMLUListElement | undefined = $state();

    export function handleKeyDown(e: KeyboardEvent) {
        if (!items.length) {
            if (e.key === "Escape") onClose();
            return false;
        }

        switch (e.key) {
            case "ArrowDown":
                e.preventDefault();
                selectedIndex = (selectedIndex + 1) % items.length;
                scrollToSelected();
                return true;
            case "ArrowUp":
                e.preventDefault();
                selectedIndex =
                    (selectedIndex - 1 + items.length) % items.length;
                scrollToSelected();
                return true;
            case "Tab":
            case "Enter":
                e.preventDefault();
                onSelect(items[selectedIndex]);
                return true;
            case "Escape":
                e.preventDefault();
                onClose();
                return true;
        }
        return false;
    }

    function scrollToSelected() {
        if (!listElement) return;
        const item = listElement.children[selectedIndex] as HTMLElement;
        if (item) {
            item.scrollIntoView({ block: "nearest" });
        }
    }
</script>

<div class="lda-context-picker shadow-lg" transition:fade={{ duration: 100 }}>
    {#if items.length > 0}
        <ul bind:this={listElement}>
            {#each items as item, i}
                <li
                    class="lda-context-picker-item"
                    class:selected={i === selectedIndex}
                    onpointerdown={(e) => {
                        e.preventDefault(); // Prevent blur of textarea
                        onSelect(item);
                    }}
                >
                    <span class="context-icon"
                        >{mode === "page" ? "📄" : "📦"}</span
                    >
                    <span class="context-name">{item.name}</span>
                </li>
            {/each}
        </ul>
    {:else}
        <div class="p-2 text-sm" style="color: var(--ls-secondary-text-color)">
            No {mode}s found for "{filterText}"
        </div>
    {/if}
</div>
