<script lang="ts">
    import { onMount } from "svelte";
    import { clickHandler } from "../../util/actions";

    interface Option {
        label: string;
        action: () => void;
        danger?: boolean;
        icon?: string;
        checked?: boolean;
    }

    interface Props {
        x: number;
        y: number;
        options: Option[];
        onClose: () => void;
        align?: "left" | "right";
    }

    let { x, y, options, onClose, align = "left" }: Props = $props();

    let menuEl: HTMLDivElement;

    function handleClickOutside(event: MouseEvent) {
        if (menuEl && !menuEl.contains(event.target as Node)) {
            onClose();
        }
    }

    // Resolve the effective window (Logseq UI is in parent usually)
    function getWindow(): Window {
        return window.parent || window.top || window;
    }

    onMount(() => {
        const win = getWindow();

        // Adjust position to viewport
        if (menuEl) {
            const rect = menuEl.getBoundingClientRect();

            // Auto-adjust if going off-screen (only for left align usually, but general safety)
            if (align === "left") {
                if (x + rect.width > win.innerWidth) {
                    x = win.innerWidth - rect.width - 10;
                }
            }
            // For right align, we might check if it goes off left screen?
            // Assuming x is the right anchor point.
            if (y + rect.height > win.innerHeight) {
                y = win.innerHeight - rect.height - 10;
            }
        }

        win.addEventListener("click", handleClickOutside);
        return () => {
            win.removeEventListener("click", handleClickOutside);
        };
    });
</script>

<div
    bind:this={menuEl}
    class="lda-context-menu"
    style="top: {y}px; {align === 'right'
        ? `right: ${getWindow().innerWidth - x}px;`
        : `left: ${x}px;`}"
>
    {#each options as option}
        <button
            class="lda-context-menu-item {option.danger ? 'danger' : ''}"
            use:clickHandler={() => {
                option.action();
                onClose();
            }}
        >
            {#if option.icon}
                <span class="lda-menu-icon">{@html option.icon}</span>
            {/if}
            <span style="flex: 1;">{option.label}</span>
            {#if option.checked}
                <span class="lda-menu-check">
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
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                </span>
            {/if}
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
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .lda-menu-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
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

    .lda-menu-check {
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--ls-link-text-color, #106ba3);
        margin-left: 8px;
    }
</style>
