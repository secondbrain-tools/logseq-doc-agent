<script lang="ts">
    import { createEventDispatcher, onMount, onDestroy } from "svelte";
    import { ICONS } from "../../icons";
    import type { Snippet } from "svelte";

    let {
        title = "Modal",
        isOpen = false,
        width = "600px",
        children,
        toolbar,
        initialMaximized,
    }: {
        title?: string;
        isOpen?: boolean;
        width?: string;
        children: Snippet;
        toolbar?: Snippet;
        initialMaximized?: boolean;
    } = $props();

    const dispatch = createEventDispatcher();
    let modalContainer: HTMLElement | undefined = $state();
    let isMaximized = $state(initialMaximized ?? false);

    function close() {
        dispatch("close");
    }

    function toggleMaximize() {
        isMaximized = !isMaximized;
    }

    function handleKeydown(event: KeyboardEvent) {
        // Only handle Escape, and only if not typing in an input/textarea
        const target = event.target as HTMLElement;
        const isInputElement =
            target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable;

        if (event.key === "Escape" && !isInputElement) {
            close();
        }
    }

    // Generic Click Action to ensure events work across frames/portals
    function manualClick(node: HTMLElement, fn: () => void) {
        const handler = (e: MouseEvent) => {
            e.preventDefault(); // Prevent unexpected behavior
            e.stopPropagation();
            fn();
        };
        // Use standard addEventListener which works on the node regardless of where it is in DOM
        node.addEventListener("click", handler);
        return {
            destroy() {
                node.removeEventListener("click", handler);
            },
        };
    }

    function stopProp(node: HTMLElement) {
        const handler = (e: Event) => e.stopPropagation();
        node.addEventListener("click", handler);
        node.addEventListener("mousedown", handler);
        // node.addEventListener("keydown", handler); // Allow keys to bubble for inputs
        return {
            destroy() {
                node.removeEventListener("click", handler);
                node.removeEventListener("mousedown", handler);
                // node.removeEventListener("keydown", handler);
            },
        };
    }

    // Portal Action
    function portal(node: HTMLElement) {
        if (window.parent?.document?.body) {
            window.parent.document.body.appendChild(node);
        } else {
            document.body.appendChild(node);
        }

        return {
            destroy() {
                if (node.parentNode) {
                    node.parentNode.removeChild(node);
                }
            },
        };
    }

    function handleBackdropClick(e: MouseEvent) {
        // Only close if clicking the backdrop directly
        if (e.target === e.currentTarget) {
            e.stopPropagation();
            close();
        }
    }

    // Bind Escape listener to both window and parent window (since we portal there)
    $effect(() => {
        if (!isOpen) return;

        const win = window;
        const parentWin = window.parent;

        win.addEventListener("keydown", handleKeydown);
        if (parentWin && parentWin !== win) {
            try {
                parentWin.addEventListener("keydown", handleKeydown);
            } catch (e) {
                console.warn(
                    "Failed to attach keydown listener to parent window",
                    e,
                );
            }
        }

        return () => {
            win.removeEventListener("keydown", handleKeydown);
            if (parentWin && parentWin !== win) {
                try {
                    parentWin.removeEventListener("keydown", handleKeydown);
                } catch (e) {
                    // Ignore
                }
            }
        };
    });
</script>

{#if isOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="lda-modal-overlay"
        onclick={handleBackdropClick}
        role="button"
        tabindex="0"
        use:portal
    >
        <div
            class="lda-modal-content {isMaximized ? 'maximized' : ''}"
            style={isMaximized ? "" : `width: ${width};`}
            role="dialog"
            aria-modal="true"
            tabindex="-1"
            bind:this={modalContainer}
        >
            <header class="lda-modal-header">
                <div class="lda-modal-title-area">
                    <h2 class="lda-modal-title">{title}</h2>
                    {#if toolbar}
                        <div class="lda-modal-toolbar">
                            {@render toolbar()}
                        </div>
                    {/if}
                </div>
                <div class="lda-window-controls">
                    <button
                        class="lda-modal-control"
                        use:manualClick={toggleMaximize}
                        aria-label={isMaximized ? "Restore" : "Maximize"}
                        title={isMaximized ? "Restore" : "Maximize"}
                    >
                        <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        >
                            {@html isMaximized ? ICONS.restore : ICONS.maximize}
                        </svg>
                    </button>
                    <button
                        class="lda-modal-close lda-modal-control"
                        use:manualClick={close}
                        aria-label="Close"
                    >
                        <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        >
                            {@html ICONS.close}
                        </svg>
                    </button>
                </div>
            </header>
            <div class="lda-modal-body">
                {@render children()}
            </div>
        </div>
    </div>
{/if}

<style>
    /* Existing styles plus... */
    .lda-modal-content {
        background: var(--ls-primary-background-color);
        border-radius: 8px;
        box-shadow: 0 4px 12px
            color-mix(in srgb, var(--ls-primary-text-color), transparent 85%);
        max-width: 95vw;
        max-height: 90vh; /* Constraint */
        display: flex; /* Always Flex */
        flex-direction: column; /* Vertical stack */
        position: relative;
        border: 1px solid var(--ls-border-color);
    }

    .lda-modal-content.maximized {
        width: 98vw !important;
        height: 98vh !important;
        max-width: none !important;
        max-height: none !important;
    }

    .lda-modal-body {
        flex: 1;
        overflow: hidden; /* Important: Contain children */
        display: flex;
        flex-direction: column;
    }

    .lda-modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 16px;
        padding-right: 8px;
    }
    .lda-modal-title-area {
        display: flex;
        align-items: center;
        gap: 16px;
        flex: 1;
        min-width: 0;
    }
    .lda-modal-toolbar {
        flex: 1;
        display: flex;
        align-items: center;
    }
    .lda-window-controls {
        display: flex;
        align-items: center;
        gap: 8px;
    }
    .lda-modal-control {
        background: transparent;
        border: none;
        color: var(--ls-secondary-text-color);
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .lda-modal-control:hover {
        background: var(--ls-tertiary-background-color);
        color: var(--ls-primary-text-color);
    }
    .lda-modal-close {
        font-size: 1.5rem;
        line-height: 1;
    }
</style>
