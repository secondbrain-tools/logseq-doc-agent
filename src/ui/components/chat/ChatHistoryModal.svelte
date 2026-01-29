<script lang="ts">
    import type { ChatlogMetadata } from "../../../domain/chatlog/types";

    interface Props {
        isOpen: boolean;
        onClose: () => void;
        onNewChat: () => void;
        onLoadChatlog: (id: string) => void;
        onDeleteChatlog: (id: string) => void;
        onListChatlogs: () => Promise<ChatlogMetadata[]>;
    }

    let {
        isOpen,
        onClose,
        onNewChat,
        onLoadChatlog,
        onDeleteChatlog,
        onListChatlogs,
    }: Props = $props();

    let chatlogs: ChatlogMetadata[] = $state([]);
    let searchQuery = $state("");
    let isLoading = $state(false);
    let deleteConfirmId: string | null = $state(null);

    // Load chatlogs when modal opens
    $effect(() => {
        if (isOpen) {
            loadChatlogs();
        }
    });

    async function loadChatlogs() {
        isLoading = true;
        try {
            chatlogs = await onListChatlogs();
        } catch (error) {
            console.error("Error loading chatlogs:", error);
            chatlogs = [];
        } finally {
            isLoading = false;
        }
    }

    function filteredChatlogs(): ChatlogMetadata[] {
        if (!searchQuery.trim()) {
            return chatlogs;
        }
        const query = searchQuery.toLowerCase();
        return chatlogs.filter(
            (c) =>
                c.title.toLowerCase().includes(query) ||
                c.id.toLowerCase().includes(query),
        );
    }

    function handleSelect(id: string) {
        onLoadChatlog(id);
        onClose();
    }

    function handleNewChat() {
        onNewChat();
        onClose();
    }

    async function handleDelete(id: string, e: MouseEvent) {
        e.stopPropagation();
        if (deleteConfirmId === id) {
            await onDeleteChatlog(id);
            await loadChatlogs();
            deleteConfirmId = null;
        } else {
            deleteConfirmId = id;
        }
    }

    function handleBackdropClick(e: MouseEvent) {
        if (e.target === e.currentTarget) {
            onClose();
        }
    }

    function formatDate(isoString: string): string {
        if (!isoString) return "";
        try {
            const date = new Date(isoString);
            return date.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
            });
        } catch {
            return "";
        }
    }
</script>

{#if isOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="lda-history-modal-backdrop" onclick={handleBackdropClick}>
        <div class="lda-history-modal">
            <!-- Header -->
            <div class="lda-history-header">
                <h3 class="lda-history-title">Chat History</h3>
                <div class="lda-history-header-actions">
                    <button
                        class="lda-btn-secondary"
                        onclick={handleNewChat}
                        title="New Chat"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                        >
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                        New
                    </button>
                    <button
                        class="lda-btn-icon-sm"
                        onclick={onClose}
                        title="Close"
                    >
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
            </div>

            <!-- Search -->
            <div class="lda-history-search">
                <input
                    type="text"
                    placeholder="Search chatlogs..."
                    bind:value={searchQuery}
                    class="lda-history-search-input"
                />
            </div>

            <!-- List -->
            <div class="lda-history-list">
                {#if isLoading}
                    <div class="lda-history-loading">Loading...</div>
                {:else if filteredChatlogs().length === 0}
                    <div class="lda-history-empty">
                        {searchQuery
                            ? "No chatlogs match your search"
                            : "No chat history yet"}
                    </div>
                {:else}
                    {#each filteredChatlogs() as chatlog (chatlog.id)}
                        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
                        <div
                            class="lda-history-item"
                            onclick={() => handleSelect(chatlog.id)}
                        >
                            <div class="lda-history-item-content">
                                <div class="lda-history-item-title">
                                    {chatlog.title || chatlog.id}
                                </div>
                                <div class="lda-history-item-meta">
                                    <span>{formatDate(chatlog.created)}</span>
                                    <span>·</span>
                                    <span
                                        >{chatlog.messageCount} message{chatlog.messageCount !==
                                        1
                                            ? "s"
                                            : ""}</span
                                    >
                                    {#if chatlog.model}
                                        <span>·</span>
                                        <span>{chatlog.model}</span>
                                    {/if}
                                </div>
                            </div>
                            <button
                                class="lda-history-item-delete {deleteConfirmId ===
                                chatlog.id
                                    ? 'confirm'
                                    : ''}"
                                onclick={(e) => handleDelete(chatlog.id, e)}
                                title={deleteConfirmId === chatlog.id
                                    ? "Click again to confirm"
                                    : "Delete"}
                            >
                                {#if deleteConfirmId === chatlog.id}
                                    ✓
                                {:else}
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                    >
                                        <polyline points="3 6 5 6 21 6"
                                        ></polyline>
                                        <path
                                            d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                                        ></path>
                                    </svg>
                                {/if}
                            </button>
                        </div>
                    {/each}
                {/if}
            </div>
        </div>
    </div>
{/if}
