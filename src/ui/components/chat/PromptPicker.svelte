<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";
    import { fade, slide } from "svelte/transition";
    import type { ChatPrompt } from "../../../domain/chat/prompt";

    interface Props {
        prompts: ChatPrompt[];
        filterText: string;
        onSelect: (promptName: string) => void;
        onClose: () => void;
    }

    let { prompts, filterText, onSelect, onClose }: Props = $props();

    let selectedIndex = $state(0);

    // Filter prompts dynamically based on input, limit to 10
    let filteredPrompts = $derived.by(() => {
        const text = filterText.toLowerCase();
        let matches = prompts.filter((p) =>
            p.name.toLowerCase().includes(text),
        );
        // Sort exact start matches first
        matches.sort((a, b) => {
            const aStarts = a.name.toLowerCase().startsWith(text);
            const bStarts = b.name.toLowerCase().startsWith(text);
            if (aStarts && !bStarts) return -1;
            if (!aStarts && bStarts) return 1;
            return 0;
        });
        const result = matches.slice(0, 10);
        return result;
    });

    // Keep selectedIndex in bounds when list changes
    $effect(() => {
        if (
            filteredPrompts.length > 0 &&
            selectedIndex >= filteredPrompts.length
        ) {
            selectedIndex = 0;
        }
    });

    let listElement: HTMLUListElement | undefined = $state();

    export function handleKeyDown(e: KeyboardEvent) {
        if (!filteredPrompts.length) {
            if (e.key === "Escape") onClose();
            return false;
        }

        switch (e.key) {
            case "ArrowDown":
                e.preventDefault();
                selectedIndex = (selectedIndex + 1) % filteredPrompts.length;
                scrollToSelected();
                return true;
            case "ArrowUp":
                e.preventDefault();
                selectedIndex =
                    (selectedIndex - 1 + filteredPrompts.length) %
                    filteredPrompts.length;
                scrollToSelected();
                return true;
            case "Enter":
                e.preventDefault();
                onSelect(filteredPrompts[selectedIndex].name);
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

<div class="lda-prompt-picker shadow-lg" transition:fade={{ duration: 100 }}>
    {#if filteredPrompts.length > 0}
        <ul bind:this={listElement}>
            {#each filteredPrompts as prompt, i}
                <li
                    class="lda-prompt-picker-item"
                    class:selected={i === selectedIndex}
                    onpointerdown={(e) => {
                        e.preventDefault(); // Prevent blur of textarea
                        onSelect(prompt.name);
                    }}
                >
                    <span class="prompt-icon">/</span>
                    <span class="prompt-name">{prompt.name}</span>
                </li>
            {/each}
        </ul>
    {:else}
        <div class="p-2 text-sm" style="color: var(--ls-secondary-text-color)">
            No prompts found for "{filterText}"
        </div>
    {/if}
</div>
