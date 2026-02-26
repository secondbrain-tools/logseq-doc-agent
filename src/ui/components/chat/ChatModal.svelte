<script lang="ts">
    import type { Snippet } from "svelte";

    interface Props {
        isOpen: boolean;
        title?: string;
        onClose: () => void;
        children: Snippet;
        headerActions?: Snippet;
        overflowVisible?: boolean;
    }

    let {
        isOpen,
        title,
        onClose,
        children,
        headerActions,
        overflowVisible = false,
    }: Props = $props();

    function handleBackdropClick(e: MouseEvent) {
        if (e.target === e.currentTarget) {
            onClose();
        }
    }
</script>

{#if isOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="lda-chat-modal-backdrop" onclick={handleBackdropClick}>
        <div class="lda-chat-modal-container">
            <!-- Header -->
            <div class="lda-chat-modal-header" style="z-index: 60;">
                {#if headerActions}
                    {@render headerActions()}
                {/if}

                <!-- If no specific header actions provided, but we have a title, show standard title -->
                {#if title && !headerActions}
                    <h3 class="lda-chat-modal-title">{title}</h3>
                {/if}

                <button class="lda-btn-icon-sm" onclick={onClose} title="Close">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>

            <!-- Content -->
            <div
                class="lda-chat-modal-content"
                style={overflowVisible ? "overflow: visible;" : ""}
            >
                {@render children()}
            </div>
        </div>
    </div>
{/if}

<style>
    .lda-chat-modal-backdrop {
        position: absolute !important;
        inset: 0 !important;
        top: 0 !important;
        left: 0 !important;
        width: 100% !important;
        height: 100% !important;
        z-index: 50 !important;
        background: var(--ls-primary-background-color, #ffffff);
        display: flex;
        flex-direction: column;
    }

    .lda-chat-modal-container {
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 100%;
        overflow: hidden;
    }

    .lda-chat-modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        border-bottom: 1px solid var(--ls-border-color, #e2e8f0);
        flex-shrink: 0;
        gap: 8px;
    }

    .lda-chat-modal-title {
        font-size: 1rem;
        font-weight: 600;
        margin: 0;
        color: var(--ls-primary-text-color, #333);
    }

    .lda-chat-modal-content {
        flex: 1;
        overflow-y: auto;
        padding: 0;
    }

    .lda-btn-icon-sm {
        background: transparent;
        border: none;
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
        color: var(--ls-icon-color, #6b7280);
        display: flex;
        align-items: center;
        justify-content: center;
        margin-left: auto; /* Push to right if alone */
    }

    .lda-btn-icon-sm:hover {
        background-color: var(--ls-secondary-background-color, #f3f4f6);
        color: var(--ls-primary-text-color, #111827);
    }
</style>
