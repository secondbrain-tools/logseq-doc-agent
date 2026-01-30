<script lang="ts">
    import { onMount } from "svelte";

    interface Option {
        label: string;
        action: () => void;
        danger?: boolean;
    }

    interface Props {
        x: number;
        y: number;
        options: Option[];
        onClose: () => void;
    }

    let { x, y, options, onClose }: Props = $props();

    let menuEl: HTMLDivElement;

    function handleClickOutside(event: MouseEvent) {
        if (menuEl && !menuEl.contains(event.target as Node)) {
            onClose();
        }
    }

    onMount(() => {
        // Adjust position to viewport
        if (menuEl) {
            const rect = menuEl.getBoundingClientRect();
            if (x + rect.width > window.innerWidth) {
                x = window.innerWidth - rect.width - 10;
            }
            if (y + rect.height > window.innerHeight) {
                y = window.innerHeight - rect.height - 10;
            }
        }

        window.addEventListener("click", handleClickOutside);
        return () => {
            window.removeEventListener("click", handleClickOutside);
        };
    });
</script>

<div
    bind:this={menuEl}
    class="lda-context-menu"
    style="top: {y}px; left: {x}px;"
>
    {#each options as option}
        <button
            class="lda-context-menu-item {option.danger ? 'danger' : ''}"
            onclick={() => {
                option.action();
                onClose();
            }}
        >
            {option.label}
        </button>
    {/each}
</div>

<style>
    .lda-context-menu {
        position: fixed;
        z-index: 10000;
        background: var(--ls-primary-background-color, #fff);
        border: 1px solid var(--ls-border-color, #ccc);
        border-radius: 4px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        display: flex;
        flex-direction: column;
        min-width: 150px;
        padding: 4px 0;
    }

    .lda-context-menu-item {
        text-align: left;
        background: none;
        border: none;
        padding: 8px 12px;
        cursor: pointer;
        font-size: 0.9rem;
        color: var(--ls-primary-text-color, #333);
        transition: background 0.1s;
    }

    .lda-context-menu-item:hover {
        background-color: var(--ls-secondary-background-color, #f5f5f5);
    }

    .lda-context-menu-item.danger {
        color: var(--ls-error-text-color, #d32f2f);
    }

    .lda-context-menu-item.danger:hover {
        background-color: rgba(211, 47, 47, 0.05);
    }
</style>
