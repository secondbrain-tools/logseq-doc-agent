<script lang="ts">
    import { tick } from "svelte";
    import AgentSelector from "./AgentSelector.svelte";
    import ModelSelector, { type ProviderGroup } from "./ModelSelector.svelte";
    import ContextMenu from "./ContextMenu.svelte";
    import ChatModal from "./ChatModal.svelte";
    import type { AgentDefinition } from "../../../domain/agent/types";
    import type { ContextItem } from "../../../infra/logseq/context-utils";
    import { autoresize, clickAction } from "../../util/actions";
    import { ICONS } from "../../icons";

    interface ActiveContext {
        item: ContextItem;
        isActive: boolean;
        isAuto?: boolean;
    }

    interface Props {
        inputText: string;
        isLoading: boolean;
        activeContexts: ActiveContext[];
        agents: AgentDefinition[];
        selectedAgent: string;
        modelGroups: ProviderGroup[];
        selectedModel: string;
        selectedProviderId: string;
        reasoningEffort: "none" | "low" | "medium" | "high";
        currentModelSupportsReasoning: boolean;
        focusSignal?: number;
        expandSignal?: number;

        onSendMessage: () => void;
        onAddContext: () => void;
        onRemoveContext: (id: string) => void;
        onToggleContext: (id: string) => void;
        onModelChange: (modelId: string, providerId: string) => void;
        onAgentChange: (agentName: string) => void;
        onStop?: () => void;
    }

    let {
        inputText = $bindable(),
        isLoading,
        activeContexts,
        agents,
        selectedAgent,
        modelGroups,
        selectedModel = $bindable(),
        selectedProviderId = $bindable(),
        reasoningEffort = $bindable(),
        currentModelSupportsReasoning,
        focusSignal,
        expandSignal,
        onSendMessage,
        onAddContext,
        onRemoveContext,
        onToggleContext,
        onModelChange,
        onAgentChange,
        onStop,
    }: Props = $props();

    // --- Local State ---
    let isContextMenuOpen = $state(false); // For "Add Context" menu
    let isMaxedOut = $state(false); // Track if input is at max height
    let isExpanded = $state(false); // Track if input is maximized in modal
    let reasoningMenu = $state({
        visible: false,
        x: 0,
        y: 0,
    });

    let textareaElement: HTMLTextAreaElement | undefined = $state();
    let expandedTextareaElement: HTMLTextAreaElement | undefined = $state();

    $effect(() => {
        // Respond to focus signal changes
        if (focusSignal && textareaElement) {
            textareaElement.focus();
        }
    });

    $effect(() => {
        // Respond to expand signal changes
        if (expandSignal) {
            console.log("[UI] expandSignal received:", expandSignal);
            // Delay expansion to ensure DOM is stable and prevent flush errors
            setTimeout(() => {
                console.log("[UI] Triggering delayed toggleExpand");
                void toggleExpand();
            }, 100);
        }
    });

    // --- Actions ---
    function handleKeydown(e: KeyboardEvent) {
        // Stop propagation for arrow keys to prevent Logseq from hijacking navigation
        if (
            [
                "ArrowUp",
                "ArrowDown",
                "ArrowLeft",
                "ArrowRight",
                "Backspace",
                "Delete",
                "PageUp",
                "PageDown",
            ].includes(e.key)
        ) {
            e.stopPropagation();
        }

        // Search: Ctrl+F / Cmd+F
        if ((e.ctrlKey || e.metaKey) && e.key === "f") {
            if (isExpanded) {
                e.preventDefault();
                e.stopPropagation();
                toggleSearch();
                return;
            }
        }

        // Toggle Expansion: Alt + ArrowUp/ArrowDown
        if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
            e.preventDefault();
            e.stopPropagation();
            void toggleExpand();
            return;
        }

        if (e.key === "Escape") {
            if (isExpanded) {
                void toggleExpand(); // Use toggleExpand to handle focus restore
                e.stopPropagation(); // Prevent bubbling if needed
            } else {
                (e.target as HTMLTextAreaElement).blur();
                // Release focus to allow Logseq navigation
            }
            return;
        }

        if (e.key === "Enter") {
            if (e.shiftKey) {
                // Explicitly handle Shift+Enter to avoid environment interference
                e.preventDefault();
                e.stopPropagation();

                const textarea = e.target as HTMLTextAreaElement;
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;

                // Insert newline
                inputText =
                    inputText.substring(0, start) +
                    "\n" +
                    inputText.substring(end);

                // Move cursor to after newline
                setTimeout(() => {
                    const newPos = start + 1;
                    textarea.selectionStart = newPos;
                    textarea.selectionEnd = newPos;
                }, 0);
            } else {
                // Enter without Shift = Send
                e.preventDefault();
                if (isExpanded) {
                    // Close modal first if expanded, then send
                    void toggleExpand(); // Close and restore focus (though send might clear it)
                    // Small delay to allow transition if needed,
                    // but immediate send is usually preferred.
                }
                onSendMessage();
            }
        }
    }

    function openReasoningMenu(e: MouseEvent) {
        e.preventDefault();
        e.stopPropagation();

        const btn = e.currentTarget as HTMLElement;
        const rect = btn.getBoundingClientRect();

        setTimeout(() => {
            reasoningMenu = {
                visible: true,
                x: rect.left,
                y: rect.top - 10,
            };
        }, 0);
    }

    async function toggleExpand() {
        console.log("[UI] toggleExpand START. isExpanded:", isExpanded);
        try {
            const source = isExpanded
                ? expandedTextareaElement
                : textareaElement;
            const start = source?.selectionStart;
            const end = source?.selectionEnd;

            isExpanded = !isExpanded;
            await tick();

            const target = isExpanded
                ? expandedTextareaElement
                : textareaElement;
            if (target) {
                target.focus();
                if (typeof start === "number" && typeof end === "number") {
                    try {
                        target.setSelectionRange(start, end);
                    } catch (err) {
                        console.warn(
                            "[UI] Failed to restore selection range",
                            err,
                        );
                    }
                }
            }
        } catch (e) {
            console.error("[UI] Error in toggleExpand:", e);
        }
    }

    // --- Search Logic ---
    let isSearchOpen = $state(false);
    let searchQuery = $state("");
    let searchMatches: number[] = $state([]);
    let searchMatchIndex = $state(-1);
    let searchInputRef: HTMLInputElement | undefined = $state();

    function performSearch() {
        if (!searchQuery) {
            searchMatches = [];
            searchMatchIndex = -1;
            return;
        }

        const matches: number[] = [];
        const lowerQuery = searchQuery.toLowerCase();
        const lowerText = inputText.toLowerCase();
        let pos = lowerText.indexOf(lowerQuery);

        while (pos !== -1) {
            matches.push(pos);
            pos = lowerText.indexOf(lowerQuery, pos + 1);
        }

        searchMatches = matches;

        // If we have matches, try to find the one closest to current cursor or just pick first
        if (matches.length > 0) {
            // Find match after current selection start, or default to 0
            const currentPos = expandedTextareaElement?.selectionStart || 0;
            const nextMatchIdx = matches.findIndex((m) => m >= currentPos);
            searchMatchIndex = nextMatchIdx !== -1 ? nextMatchIdx : 0;
            searchMatchIndex = nextMatchIdx !== -1 ? nextMatchIdx : 0;
            goToMatch(searchMatchIndex, true);
        } else {
            searchMatchIndex = -1;
        }
    }

    function goToMatch(index: number, keepFocus = false) {
        if (index < 0 || index >= searchMatches.length) return;

        const start = searchMatches[index];
        const end = start + searchQuery.length;

        if (expandedTextareaElement) {
            if (!keepFocus) {
                expandedTextareaElement.focus();
            }
            expandedTextareaElement.setSelectionRange(start, end);
            // setSelectionRange usually scrolls into view if focused
            // If we are keeping focus on search input, we might need manual scrolling if off-screen,
            // but for now let's see if this is sufficient.
            if (keepFocus) {
                // Try to scroll into view without focusing using blur/focus trick or just scrollTop
                // For now, doing nothing extra. Browsers might not scroll if not focused.
                // We can improve this if needed.
                const lineHeight = 24; // approx
                const lines = inputText.substring(0, start).split("\n").length;
                const scrollPos = (lines - 1) * lineHeight;
                // expandedTextareaElement.scrollTop = scrollPos; // Rough approximation
            }
        }
    }

    function findNext() {
        if (searchMatches.length === 0) return;
        searchMatchIndex = (searchMatchIndex + 1) % searchMatches.length;
        goToMatch(searchMatchIndex);
    }

    function findPrev() {
        if (searchMatches.length === 0) return;
        searchMatchIndex =
            (searchMatchIndex - 1 + searchMatches.length) %
            searchMatches.length;
        goToMatch(searchMatchIndex);
    }

    function toggleSearch() {
        isSearchOpen = !isSearchOpen;
        if (isSearchOpen) {
            // Reset search when opening
            searchQuery = "";
            searchMatches = [];
            searchMatchIndex = -1;
            setTimeout(() => searchInputRef?.focus(), 50);
        } else {
            // Restore focus to textarea when closing
            expandedTextareaElement?.focus();
        }
    }

    function closeSearch() {
        isSearchOpen = false;
        expandedTextareaElement?.focus();
    }

    // --- Icons ---
    // --- Icons ---
    const menuIcons = {
        dash: `<div style="opacity: 0.5;">${ICONS.dash}</div>`,
        brainSmall: `<div style="transform: scale(0.8); color: var(--ls-link-text-color, #106ba3);">${ICONS.brain}</div>`,
        brainMedium: `<div style="transform: scale(1.0); color: var(--ls-link-text-color, #106ba3);">${ICONS.brain}</div>`,
        brainLarge: `<div style="transform: scale(1.2); color: var(--ls-link-text-color, #106ba3);">${ICONS.brain}</div>`,
    };
</script>

<div class="lda-chat-input-area">
    {#if activeContexts.length > 0}
        <div class="lda-context-bar">
            {#each activeContexts as ctx (ctx.item.id)}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                    class="lda-context-tag {ctx.isActive
                        ? ''
                        : 'lda-context-tag-inactive'}"
                    use:clickAction={() => onToggleContext(ctx.item.id)}
                    title={ctx.isActive
                        ? "Uncheck to disable"
                        : "Check to enable"}
                >
                    <span class="lda-context-icon"
                        >{ctx.isActive ? "☑️" : "⬜"}</span
                    >
                    <span class="lda-context-name">{ctx.item.name}</span>

                    {#if !ctx.isAuto}
                        <button
                            class="lda-context-remove"
                            use:clickAction={(e) => {
                                onRemoveContext(ctx.item.id);
                            }}
                        >
                            ×
                        </button>
                    {/if}
                </div>
            {/each}
        </div>
    {/if}

    <div class="relative w-full">
        <textarea
            class="lda-chat-textarea"
            rows="1"
            placeholder="Ask anything..."
            bind:value={inputText}
            bind:this={textareaElement}
            onkeydown={handleKeydown}
            use:autoresize={inputText}
            onmaxedout={(e) => {
                isMaxedOut = e.detail;
            }}
        ></textarea>

        {#if isMaxedOut}
            <button
                class="lda-maximize-btn"
                onclick={toggleExpand}
                title="Maximize Input"
            >
                {@html ICONS.maximizeInput}
            </button>
        {/if}
    </div>

    <div class="lda-chat-footer">
        <!-- Add Context Button -->
        <div class="relative">
            <button
                class="lda-btn-icon"
                title="Add Context"
                use:clickAction={() => (isContextMenuOpen = !isContextMenuOpen)}
            >
                {@html ICONS.contextAdd}
            </button>
            {#if isContextMenuOpen}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                    class="lda-context-menu-backdrop"
                    use:clickAction={() => (isContextMenuOpen = false)}
                ></div>
                <div class="lda-context-menu-popover">
                    <button
                        class="lda-context-menu-item"
                        use:clickAction={() => {
                            onAddContext();
                            isContextMenuOpen = false;
                        }}
                    >
                        <span>📄</span> Current Page
                    </button>
                </div>
            {/if}
        </div>

        <!-- Agent Selection -->
        {#if agents && agents.length > 0 && selectedAgent}
            <AgentSelector
                {agents}
                value={selectedAgent}
                onChange={(agent) => {
                    if (agent) onAgentChange(agent.name);
                }}
            />
        {/if}

        <!-- Model Selection -->
        <ModelSelector
            bind:value={selectedModel}
            bind:providerId={selectedProviderId}
            groups={modelGroups}
            onChange={onModelChange}
        />

        {#if currentModelSupportsReasoning}
            <button
                class="lda-btn-icon ml-1"
                title={`Reasoning Effort: ${reasoningEffort}`}
                use:clickAction={openReasoningMenu}
                style="color: var(--ls-link-text-color, #106ba3); opacity: {reasoningEffort ===
                'none'
                    ? '0.5'
                    : reasoningEffort === 'low'
                      ? '0.7'
                      : reasoningEffort === 'medium'
                        ? '0.85'
                        : '1'}; transition: opacity 0.2s, transform 0.2s;"
            >
                {#if reasoningEffort === "none"}
                    {@html ICONS.dash}
                {:else}
                    <!-- Brain Icon - Scaled based on effort -->
                    <div
                        style="transform: scale({reasoningEffort === 'low'
                            ? 0.8
                            : reasoningEffort === 'medium'
                              ? 1.0
                              : 1.2}); display: flex; align-items: center; justify-content: center;"
                    >
                        {@html ICONS.brain}
                    </div>
                {/if}
            </button>
        {/if}

        <div class="lda-spacer"></div>

        <!-- Send / Stop Button -->
        {#if isLoading}
            <button
                class="lda-btn-primary lda-stop-btn"
                onclick={onStop}
                title="Stop Generation"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                >
                    <rect x="6" y="6" width="12" height="12" rx="2" ry="2" />
                </svg>
            </button>
        {:else}
            <button
                class="lda-btn-primary"
                onclick={onSendMessage}
                title="Send"
                disabled={!inputText.trim()}
                style={!inputText.trim()
                    ? "opacity: 0.5; cursor: default;"
                    : ""}
            >
                {@html ICONS.send}
            </button>
        {/if}
    </div>
</div>

<!-- Reasoning Menu -->
{#if reasoningMenu.visible}
    <ContextMenu
        x={reasoningMenu.x}
        y={reasoningMenu.y}
        options={[
            {
                label: "None",
                icon: menuIcons.dash,
                action: () => {
                    reasoningEffort = "none";
                },
            },
            {
                label: "Low",
                icon: menuIcons.brainSmall,
                action: () => {
                    reasoningEffort = "low";
                },
            },
            {
                label: "Medium",
                icon: menuIcons.brainMedium,
                action: () => {
                    reasoningEffort = "medium";
                },
            },
            {
                label: "High",
                icon: menuIcons.brainLarge,
                action: () => {
                    reasoningEffort = "high";
                },
            },
        ]}
        onClose={() => (reasoningMenu.visible = false)}
    />
{/if}

<!-- Expanded Input Modal -->
{#if isExpanded}
    <ChatModal
        isOpen={isExpanded}
        title="Edit Message"
        onClose={() => (isExpanded = false)}
    >
        <div class="lda-expanded-input-container">
            <textarea
                class="lda-chat-textarea lda-expanded-textarea"
                placeholder="Ask anything..."
                bind:value={inputText}
                bind:this={expandedTextareaElement}
                onkeydown={handleKeydown}
            ></textarea>

            {#if isExpanded && isSearchOpen}
                <div class="lda-search-container">
                    <input
                        class="lda-search-input"
                        type="text"
                        placeholder="Find..."
                        bind:value={searchQuery}
                        bind:this={searchInputRef}
                        oninput={() => performSearch()}
                        onkeydown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                if (e.shiftKey) findPrev();
                                else findNext();
                            } else if (e.key === "Escape") {
                                e.preventDefault();
                                closeSearch();
                            }
                        }}
                    />
                    <span class="lda-search-info">
                        {#if searchMatches.length > 0}
                            {searchMatchIndex + 1} / {searchMatches.length}
                        {:else if searchQuery}
                            0 / 0
                        {/if}
                    </span>
                    <button
                        class="lda-search-btn"
                        use:clickAction={findPrev}
                        title="Previous (Shift+Enter)"
                        disabled={searchMatches.length === 0}
                    >
                        {@html ICONS.searchPrev}
                    </button>
                    <button
                        class="lda-search-btn"
                        use:clickAction={findNext}
                        title="Next (Enter)"
                        disabled={searchMatches.length === 0}
                    >
                        {@html ICONS.searchNext}
                    </button>
                    <button
                        class="lda-search-btn"
                        use:clickAction={closeSearch}
                        title="Close (Esc)"
                    >
                        {@html ICONS.searchClose}
                    </button>
                </div>
            {/if}

            <div class="lda-expanded-footer">
                <button
                    class="lda-btn-primary"
                    use:clickAction={() => {
                        isExpanded = false;
                        onSendMessage();
                    }}
                    title="Send"
                    disabled={!inputText.trim()}
                    style={!inputText.trim()
                        ? "opacity: 0.5; cursor: default;"
                        : ""}
                >
                    {@html ICONS.send}
                </button>
            </div>
        </div>
    </ChatModal>
{/if}

<style>
    .lda-context-bar {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        padding: 0.5rem;
        background: var(--ls-tertiary-background-color, #f5f5f5);
        border-bottom: 1px solid var(--ls-border-color);
        font-size: 0.8rem;
    }

    .lda-context-tag {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        background: var(--ls-secondary-background-color, #fff);
        padding: 0.15rem 0.4rem;
        border-radius: 4px;
        border: 1px solid var(--ls-border-color);
        cursor: pointer;
        user-select: none;
        transition: opacity 0.2s;
    }

    .lda-context-tag-inactive {
        opacity: 0.6;
        background: var(--ls-tertiary-background-color, #eee);
    }

    .lda-context-remove {
        background: none;
        border: none;
        cursor: pointer;
        opacity: 0.6;
        padding: 0 0.1rem;
        font-size: 1rem;
        line-height: 1;
    }

    .lda-context-remove:hover {
        opacity: 1;
        color: var(--ls-error-text-color, red);
    }

    .lda-context-menu-popover {
        position: absolute;
        bottom: 100%;
        left: 0;
        background: var(--ls-primary-background-color);
        border: 1px solid var(--ls-border-color);
        border-radius: 4px;
        box-shadow: 0 4px 6px
            color-mix(in srgb, var(--ls-primary-text-color), transparent 90%);

        z-index: 50;
        min-width: 220px;
        padding: 0.25rem 0;
        margin-bottom: 0.25rem;
        white-space: nowrap;
    }

    .lda-context-menu-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        z-index: 49;
        cursor: default;
    }

    .lda-context-menu-item {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        width: 100%;
        padding: 0.5rem 1rem;
        text-align: left;
        background: none;
        border: none;
        cursor: pointer;
        color: var(--ls-primary-text-color);
    }

    .lda-context-menu-item:hover {
        background: var(--ls-secondary-background-color);
    }

    /* Maximize Button */
    .lda-maximize-btn {
        position: absolute;
        top: 4px;
        right: 4px;
        background: var(--ls-secondary-background-color);
        border: 1px solid var(--ls-border-color);
        border-radius: 4px;
        padding: 4px;
        cursor: pointer;
        opacity: 0.3;
        transition:
            opacity 0.2s,
            background-color 0.2s;
        color: var(--ls-secondary-text-color);
        z-index: 10;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .lda-maximize-btn:hover {
        opacity: 1;
        background: var(--ls-tertiary-background-color);
        color: var(--ls-primary-text-color);
    }

    /* Expansion Modal Styles */
    .lda-expanded-input-container {
        display: flex;
        flex-direction: column;
        height: 100%;
        gap: 1rem;
        padding: 1rem;
    }

    .lda-expanded-textarea {
        flex: 1;
        resize: none !important;
        min-height: 200px;
        font-family: inherit;
        font-size: 1rem;
        line-height: 1.5;
        border: 1px solid var(--ls-border-color);
        border-radius: 6px;
        padding: 1rem;
        overflow-y: auto;
    }

    .lda-expanded-footer {
        display: flex;
        justify-content: flex-end;
    }

    .lda-stop-btn {
        background-color: var(--ls-error-text-color, #ff4d4f);
        border-color: var(--ls-error-text-color, #ff4d4f);
        color: white;
    }
    .lda-stop-btn:hover {
        opacity: 0.9;
    }
</style>
