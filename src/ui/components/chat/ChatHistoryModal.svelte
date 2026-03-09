<script lang="ts">
    import type { ChatlogMetadata } from "../../../domain/chatlog/types";
    import "../../styles/chathistory.css";
    import ChatModal from "./ChatModal.svelte";
    import { clickHandler } from "../../util/actions";

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

    function handleItemKeydown(event: KeyboardEvent, id: string) {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handleSelect(id);
        }
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

    function formatDate(isoString: string): string {
        if (!isoString) return "";
        try {
            const date = new Date(isoString);
            return date.toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "numeric",
            });
        } catch {
            return "";
        }
    }

    function getGroupLabel(date: Date): string {
        const now = new Date();
        const today = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
        );
        const target = new Date(
            date.getFullYear(),
            date.getMonth(),
            date.getDate(),
        );
        const diffTime = today.getTime() - target.getTime();
        const diffDays = diffTime / (1000 * 60 * 60 * 24);

        if (diffDays === 0) return "Today";
        if (diffDays === 1) return "Yesterday";

        // Determine start of the week using locale
        let firstDayOfWeek = 1; // Default to Monday
        try {
            // @ts-ignore
            if (typeof Intl !== "undefined" && Intl.Locale) {
                // @ts-ignore
                const locale = new Intl.Locale(navigator.language);
                // @ts-ignore
                if (locale.weekInfo) {
                    // @ts-ignore
                    firstDayOfWeek = locale.weekInfo.firstDay;
                }
            }
        } catch (e) {
            // Fallback for environments without advanced Intl support
        }

        const dayOfWeek = today.getDay(); // 0 (Sun) - 6 (Sat)
        // correct to 0-6 relative to firstDayOfWeek
        const activeDay = (dayOfWeek - firstDayOfWeek + 7) % 7;

        const startOfThisWeek = new Date(today);
        startOfThisWeek.setDate(today.getDate() - activeDay);

        if (target >= startOfThisWeek) return "This Week";

        const startOfLastWeek = new Date(startOfThisWeek);
        startOfLastWeek.setDate(startOfThisWeek.getDate() - 7);

        if (target >= startOfLastWeek) return "Last Week";

        if (
            now.getMonth() === date.getMonth() &&
            now.getFullYear() === date.getFullYear()
        )
            return "This Month";

        const lastMonthDate = new Date(
            now.getFullYear(),
            now.getMonth() - 1,
            1,
        );
        if (
            date.getMonth() === lastMonthDate.getMonth() &&
            date.getFullYear() === lastMonthDate.getFullYear()
        )
            return "Last Month";

        return "Older";
    }

    function groupedChatlogs() {
        const logs = filteredChatlogs();
        const groups: Record<string, ChatlogMetadata[]> = {
            Today: [],
            Yesterday: [],
            "This Week": [],
            "Last Week": [],
            "This Month": [],
            "Last Month": [],
            Older: [],
        };

        const order = [
            "Today",
            "Yesterday",
            "This Week",
            "Last Week",
            "This Month",
            "Last Month",
            "Older",
        ];

        for (const log of logs) {
            // Use updated if available, else created
            const date = new Date(log.updated || log.created);
            const label = getGroupLabel(date);
            if (groups[label]) {
                groups[label].push(log);
            } else {
                groups["Older"].push(log);
            }
        }

        return order
            .map((key) => ({ title: key, items: groups[key] }))
            .filter((g) => g.items.length > 0);
    }
</script>

<ChatModal {isOpen} {onClose}>
    {#snippet headerActions()}
        <input
            type="text"
            placeholder="Search Chat History"
            bind:value={searchQuery}
            class="lda-history-search-input"
        />
    {/snippet}

    <div class="lda-history-list">
        {#if isLoading}
            <div class="lda-history-loading">Loading...</div>
        {:else if groupedChatlogs().length === 0}
            <div class="lda-history-empty">
                {searchQuery
                    ? "No chatlogs match your search"
                    : "No chat history yet"}
            </div>
        {:else}
            {#each groupedChatlogs() as group}
                <div class="lda-history-group">
                    <div class="lda-history-group-header">
                        {group.title}
                    </div>
                    <div class="lda-history-group-items">
                        {#each group.items as chatlog (chatlog.id)}
                            <div
                                class="lda-history-item"
                                use:clickHandler={() => handleSelect(chatlog.id)}
                                onkeydown={(event) =>
                                    handleItemKeydown(event, chatlog.id)}
                                role="button"
                                tabindex="0"
                                aria-label={`Open chat history item ${chatlog.title || chatlog.id}`}
                            >
                                <div class="lda-history-item-content">
                                    <div class="lda-history-item-title">
                                        {chatlog.title || chatlog.id}
                                    </div>
                                    <div class="lda-history-item-meta">
                                        <span
                                            >{formatDate(
                                                chatlog.updated ||
                                                    chatlog.created,
                                            )}</span
                                        >
                                    </div>
                                </div>
                                <button
                                    class="lda-history-item-delete {deleteConfirmId ===
                                    chatlog.id
                                        ? 'confirm'
                                        : ''}"
                                    use:clickHandler={(e) => handleDelete(chatlog.id, e)}
                                    title={deleteConfirmId === chatlog.id
                                        ? "Click again to confirm"
                                        : "Delete"}
                                >
                                    {#if deleteConfirmId === chatlog.id}
                                        ✓
                                    {:else}
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="16"
                                            height="16"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            stroke-width="2"
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
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
                    </div>
                </div>
            {/each}
        {/if}
    </div>
</ChatModal>
