<script lang="ts">
    import { createEventDispatcher, onMount, onDestroy } from "svelte";

    import type { Snippet } from "svelte";

    let {
        title = "Modal",
        isOpen = false,
        width = "600px",
        children,
    }: {
        title?: string;
        isOpen?: boolean;
        width?: string;
        children: Snippet;
    } = $props();

    const dispatch = createEventDispatcher();
    let modalContainer: HTMLElement | undefined = $state();

    function close() {
        dispatch("close");
    }

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === "Escape") {
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
        node.addEventListener("keydown", handler);
        return {
            destroy() {
                node.removeEventListener("click", handler);
                node.removeEventListener("mousedown", handler);
                node.removeEventListener("keydown", handler);
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
</script>

{#if isOpen}
    <div
        class="lda-modal-overlay"
        use:manualClick={close}
        onkeydown={handleKeydown}
        role="button"
        tabindex="0"
        use:portal
    >
        <div
            class="lda-modal-content"
            style="width: {width};"
            use:stopProp
            role="dialog"
            aria-modal="true"
            tabindex="-1"
            bind:this={modalContainer}
        >
            <header class="lda-modal-header">
                <h2 class="lda-modal-title">{title}</h2>
                <button
                    class="lda-modal-close"
                    use:manualClick={close}
                    aria-label="Close">&times;</button
                >
            </header>
            <div class="lda-modal-body">
                {@render children()}
            </div>
        </div>
    </div>
{/if}
