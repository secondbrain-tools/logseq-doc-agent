<script lang="ts">
    import type { Writable } from "svelte/store";
    import ChatHistoryButton from "./ChatHistoryButton.svelte";

    interface Props {
        onReset: () => void;
        onHistoryClick?: () => void;
        isLoading?: Writable<boolean>;
    }

    let { onReset, onHistoryClick, isLoading }: Props = $props();

    function handleClick(e: MouseEvent) {
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (isLoading && $isLoading) return;
        if (onReset) onReset();
    }

    function handleMouseDown(e: MouseEvent) {
        e.stopPropagation();
        e.stopImmediatePropagation();
    }

    function handleDragStart(e: DragEvent) {
        e.preventDefault();
        e.stopPropagation();
    }
</script>

<div class="lda-header-actions" style="display: flex; gap: 2px;">
    <button
        class="ui__button inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm gap-1 font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none h-7 px-2"
        title="New Chat"
        type="button"
        draggable="false"
        disabled={isLoading ? $isLoading : false}
        onclick={handleClick}
        onmousedown={handleMouseDown}
        ondragstart={handleDragStart}
    >
        <span class="ui__icon ti ls-icon-plus">
            <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
            >
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
        </span>
    </button>

    {#if onHistoryClick}
        <ChatHistoryButton onClick={onHistoryClick} />
    {/if}
</div>
