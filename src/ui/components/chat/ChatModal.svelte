<script lang="ts">
    import type { Snippet } from "svelte";
    import Modal from "../common/Modal.svelte";

    interface Props {
        isOpen: boolean;
        title?: string;
        onClose: () => void;
        children: Snippet;
        headerActions?: Snippet;
    }

    let { isOpen, title, onClose, children, headerActions }: Props = $props();
</script>

<Modal
    {isOpen}
    title={title || "Chat History"}
    width="800px"
    on:close={onClose}
>
    {#snippet toolbar()}
        {#if headerActions}
            {@render headerActions()}
        {/if}
    {/snippet}

    <div class="lda-chat-modal-content">
        {@render children()}
    </div>
</Modal>

<style>
    .lda-chat-modal-content {
        flex: 1;
        overflow-y: auto; /* Ensure content scrolls within the modal body */
        padding: 0;
        display: flex;
        flex-direction: column;
        height: 100%; /* Take full available height in modal body */
    }
</style>
