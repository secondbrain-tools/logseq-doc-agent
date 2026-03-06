<script lang="ts">
    import { tick } from "svelte";
    import AgentSelector from "./AgentSelector.svelte";
    import ModelSelector, { type ProviderGroup } from "./ModelSelector.svelte";
    import ContextMenu from "./ContextMenu.svelte";
    import ChatModal from "./ChatModal.svelte";
    import PromptPicker from "./PromptPicker.svelte";
    import ContextPicker from "./ContextPicker.svelte";
    import type { AgentDefinition } from "../../../domain/agent/types";
    import {
        searchPages,
        searchBlocks,
    } from "../../../infra/logseq/context-utils";
    import type { ContextItem } from "../../../infra/logseq/context-utils";
    import type { ChatPrompt } from "../../../domain/chat/prompt";
    import { autoresize, clickAction } from "../../util/actions";
    import { ICONS } from "../../icons";

    interface ActiveContext {
        item: ContextItem;
        isActive: boolean;
        isAuto?: boolean;
    }

    interface Props {
        inputText: string;
        selectedPrompts: string[];
        availablePrompts: ChatPrompt[];
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
        onAddManualContext: (item: ContextItem) => void;
        onRemoveContext: (id: string) => void;
        onToggleContext: (id: string) => void;
        onModelChange: (modelId: string, providerId: string) => void;
        onAgentChange: (agentName: string) => void;
        onStop?: () => void;
    }

    let {
        inputText = $bindable(),
        selectedPrompts = $bindable(),
        availablePrompts = [],
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
        onAddManualContext,
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

    // Prompt Picker State
    let isPromptPickerOpen = $state(false);
    let promptFilter = $state("");
    let promptPickerRef: any = $state();
    let promptPickerPos = $state({ top: 0, left: 0 });

    // Context Picker State
    let isContextPickerOpen = $state(false);
    let contextPickerMode = $state<"page" | "block">("page");
    let contextPickerFilter = $state("");
    let contextPickerRef: any = $state();
    let contextPickerPos = $state({ top: 0, left: 0 });
    let contextPickerItems: ContextItem[] = $state([]);
    let searchDebounceTimer: any;

    let textareaElement: HTMLTextAreaElement | undefined = $state();
    let expandedTextareaElement: HTMLTextAreaElement | undefined = $state();

    $effect(() => {
        // Respond to focus signal changes
        if (focusSignal && textareaElement) {
            textareaElement.focus();
        }
    });

    function updatePopoverPosition() {
        if (!isExpanded || !expandedTextareaElement) return;

        const el = expandedTextareaElement;
        const textBefore = el.value.substring(0, el.selectionEnd);
        const lines = textBefore.split("\n");
        const lineNum = lines.length - 1; // 0-indexed line of the cursor
        const colNum = lines[lines.length - 1].length;

        const style = window.getComputedStyle(el);
        const lineHeight = parseFloat(style.lineHeight) || 24;
        const paddingTop = parseFloat(style.paddingTop) || 8;
        const paddingLeft = parseFloat(style.paddingLeft) || 8;
        // Rough char width for proportional fonts: 55% of font size
        const charWidth = (parseFloat(style.fontSize) || 16) * 0.55;

        // Position below the current line, accounting for textarea scroll offset
        const rawTop =
            paddingTop + lineNum * lineHeight - el.scrollTop + lineHeight + 16;
        const rawLeft = paddingLeft + colNum * charWidth - el.scrollLeft;

        // Clamp so the picker never overflows the textarea bounds
        const newPos = {
            top: Math.max(0, Math.min(rawTop, el.clientHeight - 250)),
            left: Math.max(0, Math.min(rawLeft, el.clientWidth - 260)),
        };

        console.log(
            "[PopoverPos] line:",
            lineNum,
            "col:",
            colNum,
            "lineHeight:",
            lineHeight,
            "pos:",
            newPos,
        );

        promptPickerPos = newPos;
        contextPickerPos = newPos;
    }

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
    function handleInput() {
        if (isPromptPickerOpen) {
            // Find text after the last '/'
            const text = inputText;
            const lastSlash = text.lastIndexOf("/");
            const targetElement = isExpanded
                ? expandedTextareaElement
                : textareaElement;
            const cursor = targetElement?.selectionStart || text.length;

            if (lastSlash !== -1 && cursor > lastSlash) {
                // Ensure no spaces after slash to keep picker open
                const checkString = text.substring(lastSlash + 1, cursor);
                if (checkString.includes(" ")) {
                    isPromptPickerOpen = false;
                } else {
                    promptFilter = checkString;
                    if (isExpanded) {
                        updatePopoverPosition();
                    }
                }
            } else {
                isPromptPickerOpen = false;
            }
        }

        if (isContextPickerOpen) {
            const text = inputText;
            const trigger = contextPickerMode === "page" ? "[[" : "((";
            const lastTrigger = text.lastIndexOf(trigger);
            const targetElement = isExpanded
                ? expandedTextareaElement
                : textareaElement;
            const cursor = targetElement?.selectionStart || text.length;

            if (lastTrigger !== -1 && cursor > lastTrigger + 1) {
                // We allow spaces in page/block names, so we just take everything
                // after the trigger up to the cursor
                const filter = text.substring(lastTrigger + 2, cursor);

                // If they typed the closing tag, close the picker
                const closingTrigger =
                    contextPickerMode === "page" ? "]]" : "))";
                if (filter.includes(closingTrigger)) {
                    isContextPickerOpen = false;
                } else {
                    contextPickerFilter = filter;
                    if (isExpanded) {
                        updatePopoverPosition();
                    }
                    debounceContextSearch(filter, contextPickerMode);
                }
            } else {
                isContextPickerOpen = false;
            }
        }
    }

    function debounceContextSearch(query: string, mode: "page" | "block") {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(async () => {
            if (!isContextPickerOpen) return;
            if (mode === "page") {
                const results = await searchPages(query);
                contextPickerItems = results.map((r) => ({
                    id: r.uuid,
                    type: "page",
                    name: r.name || "Untitled Page",
                }));
            } else {
                const results = await searchBlocks(query);
                contextPickerItems = results.map((r) => ({
                    id: r.uuid,
                    type: "block",
                    name: r.content
                        ? r.content.substring(0, 100).replace(/\n/g, " ")
                        : "Empty Block",
                }));
            }
        }, 150);
    }

    function handleKeydown(e: KeyboardEvent) {
        if (isPromptPickerOpen && promptPickerRef) {
            const handled = promptPickerRef.handleKeyDown(e);
            if (handled) {
                e.stopPropagation();
                return;
            }
        }

        if (isContextPickerOpen && contextPickerRef) {
            const handled = contextPickerRef.handleKeyDown(e);
            if (handled) {
                e.stopPropagation();
                return;
            }
        }

        if (e.key === "/") {
            const targetElement = isExpanded
                ? expandedTextareaElement
                : textareaElement;
            const start = targetElement?.selectionStart ?? 0;

            if (
                start === 0 ||
                inputText[start - 1] === " " ||
                inputText[start - 1] === "\n"
            ) {
                isPromptPickerOpen = true;
                promptFilter = "";

                if (isExpanded) {
                    updatePopoverPosition();
                }
            }
        }

        // Handle context picker triggers: `[` for page, `(` for block
        if (e.key === "[" || e.key === "(") {
            const targetElement = isExpanded
                ? expandedTextareaElement
                : textareaElement;
            const start = targetElement?.selectionStart ?? 0;

            // Check if previous char matches the current key (e.g. `[[` or `((`)
            if (start > 0 && inputText[start - 1] === e.key) {
                // Ensure we only trigger if preceded by space, newline, or at start (minus the previous bracket)
                if (
                    start === 1 ||
                    inputText[start - 2] === " " ||
                    inputText[start - 2] === "\n"
                ) {
                    isContextPickerOpen = true;
                    contextPickerMode = e.key === "[" ? "page" : "block";
                    contextPickerFilter = "";
                    contextPickerItems = [];

                    if (isExpanded) {
                        updatePopoverPosition();
                    }

                    // Trigger initial search for all
                    debounceContextSearch("", contextPickerMode);
                }
            }
        }

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

    function selectPrompt(promptName: string) {
        if (!selectedPrompts.includes(promptName)) {
            selectedPrompts = [...selectedPrompts, promptName];
        }
        isPromptPickerOpen = false;

        const lastSlash = inputText.lastIndexOf("/");
        if (lastSlash !== -1) {
            const end = lastSlash + 1 + promptFilter.length;
            inputText =
                inputText.substring(0, lastSlash) + inputText.substring(end);
        }
    }

    function removePrompt(promptName: string) {
        selectedPrompts = selectedPrompts.filter((p) => p !== promptName);
    }

    function selectContextItem(item: ContextItem) {
        onAddManualContext(item);
        isContextPickerOpen = false;

        const trigger = contextPickerMode === "page" ? "[[" : "((";
        const closingTag = contextPickerMode === "page" ? "]]" : "))";
        const identifier = contextPickerMode === "page" ? item.name : item.id;

        const lastTrigger = inputText.lastIndexOf(trigger);
        if (lastTrigger !== -1) {
            const before = inputText.substring(0, lastTrigger + 2);
            const after = inputText.substring(
                lastTrigger + 2 + contextPickerFilter.length,
            );

            // If the user already typed part of the closing tag, handle it
            let finalAfter = after;
            if (after.startsWith(closingTag)) {
                // Keep it as is
            } else if (after.startsWith(closingTag.substring(0, 1))) {
                finalAfter = closingTag.substring(1) + after.substring(1);
            } else {
                finalAfter = closingTag + after;
            }

            inputText = before + identifier + finalAfter;

            // Move cursor to after the closing tag
            setTimeout(() => {
                const target = isExpanded
                    ? expandedTextareaElement
                    : textareaElement;
                if (target) {
                    const newPos =
                        lastTrigger + 2 + identifier.length + closingTag.length;
                    target.setSelectionRange(newPos, newPos);
                    target.focus();
                }
            }, 0);
        }
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
    {#if activeContexts.length > 0 || selectedPrompts.length > 0}
        <div class="lda-context-bar">
            {#each selectedPrompts as promptName (promptName)}
                <div
                    class="lda-context-tag"
                    style="border-color: var(--ls-link-text-color);"
                >
                    <span
                        class="lda-context-icon"
                        style="color: var(--ls-link-text-color);">✨</span
                    >
                    <span class="lda-context-name">{promptName}</span>
                    <button
                        class="lda-context-remove"
                        use:clickAction={() => removePrompt(promptName)}
                    >
                        ×
                    </button>
                </div>
            {/each}

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

    <div style="position: relative; width: 100%;">
        {#if isPromptPickerOpen && !isExpanded}
            <div
                style="position: absolute; bottom: 100%; left: 0; width: 100%; z-index: 100; margin-bottom: 4px;"
            >
                <PromptPicker
                    bind:this={promptPickerRef}
                    prompts={availablePrompts}
                    filterText={promptFilter}
                    onSelect={selectPrompt}
                    onClose={() => (isPromptPickerOpen = false)}
                />
            </div>
        {/if}
        {#if isContextPickerOpen && !isExpanded}
            <div
                style="position: absolute; bottom: 100%; left: 0; width: 100%; z-index: 100; margin-bottom: 4px;"
            >
                <ContextPicker
                    bind:this={contextPickerRef}
                    mode={contextPickerMode}
                    items={contextPickerItems}
                    filterText={contextPickerFilter}
                    onSelect={selectContextItem}
                    onClose={() => (isContextPickerOpen = false)}
                />
            </div>
        {/if}
        <textarea
            class="lda-chat-textarea"
            rows="1"
            placeholder="Ask anything..."
            bind:value={inputText}
            bind:this={textareaElement}
            onkeydown={handleKeydown}
            oninput={handleInput}
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
        overflowVisible={true}
        onClose={() => (isExpanded = false)}
    >
        <div class="lda-expanded-input-container">
            <!-- Prompt Picker for expanded text area -->
            <div
                style="position: relative; width: 100%; height: 100%; display: flex; flex-direction: column;"
            >
                {#if isPromptPickerOpen && isExpanded}
                    <div
                        style="position: absolute; top: {promptPickerPos.top}px; left: {promptPickerPos.left}px; max-width: calc(100% - {promptPickerPos.left}px); z-index: 100;"
                    >
                        <PromptPicker
                            bind:this={promptPickerRef}
                            prompts={availablePrompts}
                            filterText={promptFilter}
                            onSelect={selectPrompt}
                            onClose={() => (isPromptPickerOpen = false)}
                        />
                    </div>
                {/if}
                {#if isContextPickerOpen && isExpanded}
                    <div
                        style="position: absolute; top: {contextPickerPos.top}px; left: {contextPickerPos.left}px; max-width: calc(100% - {contextPickerPos.left}px); z-index: 100;"
                    >
                        <ContextPicker
                            bind:this={contextPickerRef}
                            mode={contextPickerMode}
                            items={contextPickerItems}
                            filterText={contextPickerFilter}
                            onSelect={selectContextItem}
                            onClose={() => (isContextPickerOpen = false)}
                        />
                    </div>
                {/if}
                <textarea
                    class="lda-chat-textarea lda-expanded-textarea"
                    placeholder="Ask anything..."
                    bind:value={inputText}
                    bind:this={expandedTextareaElement}
                    onkeydown={handleKeydown}
                    oninput={handleInput}
                ></textarea>
            </div>

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
