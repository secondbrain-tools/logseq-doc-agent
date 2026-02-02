<script lang="ts">
    import { onMount, tick, getContext, untrack } from "svelte";
    import { slide } from "svelte/transition";
    import { marked } from "marked";
    import type { Writable } from "svelte/store";
    import {
        getCurrentPageContext,
        onCurrentPageChange,
        type ContextItem,
    } from "../../../infra/logseq/context-utils";

    import { PROVIDERS } from "../../../domain/settings/index";
    import ModelSelector, { type ProviderGroup } from "./ModelSelector.svelte";
    import AgentSelector from "./AgentSelector.svelte";
    import ChatHistoryModal from "./ChatHistoryModal.svelte";
    import ContextMenu from "./ContextMenu.svelte";

    // --- Types ---
    import type { Message, MessagePart } from "../../../domain/chat/types";
    import type { ChatlogMetadata } from "../../../domain/chatlog/types";
    import type { AgentDefinition } from "../../../domain/agent/types";

    interface Props {
        messages: Writable<Message[]>;
        isLoading: Writable<boolean>;
        currentChatlogId?: Writable<string | null>;
        historyModalOpen?: Writable<boolean>;
        isMergeOn?: Writable<boolean>;
        agents?: Writable<AgentDefinition[]>;
        selectedAgent?: Writable<string>;
        onSendMessage: (
            text: string,
            modelId: string,
            providerId: string,
            merge: boolean,
            reasoningEffort?: "none" | "low" | "medium" | "high",
            agentName?: string,
            contextItems?: ContextItem[],
        ) => void;
        onClose: () => void;
        onReset: () => void;
        onNewChat?: () => void;
        onLoadChatlog?: (id: string) => void;
        onListChatlogs?: () => Promise<ChatlogMetadata[]>;
        onDeleteChatlog?: (id: string) => void;
    }

    let {
        messages,
        isLoading,
        historyModalOpen,
        isMergeOn,
        agents,
        selectedAgent,
        onSendMessage,
        onNewChat,
        onLoadChatlog,
        onListChatlogs,
        onDeleteChatlog,
    }: Props = $props();

    // --- Context ---
    const settingsStore = getContext<Writable<any>>("settings");

    // --- State ---
    let inputText = $state("");
    let messageContainer: HTMLDivElement | undefined = $state();
    let selectedModel = $state("");
    let selectedProviderId = $state(""); // New state
    let userHasSelectedModel = $state(false);
    let reasoningEffort = $state<"none" | "low" | "medium" | "high">("medium");
    let modelGroups: ProviderGroup[] = $state([]);
    // Remove local isMergeOn state, use prop/store

    let contextMenu = $state({
        visible: false,
        x: 0,
        y: 0,
        message: null as Message | null,
        hasSelection: false,
        selectedText: "",
        type: "message" as "message" | "reasoning", // Add type
    });

    interface ActiveContext {
        item: ContextItem;
        isActive: boolean;
        isAuto?: boolean; // New flag for auto-context
    }

    let activeContexts = $state<ActiveContext[]>([]);
    let isContextMenuOpen = $state(false);

    // --- Reactivity ---
    $effect(() => {
        if ($settingsStore) {
            untrack(() => loadConfiguredModels($settingsStore));
        }
    });

    // --- Actions ---
    function handleModelChange(newModel: string, providerId: string) {
        // Called when user manually selects from dropdown
        userHasSelectedModel = true;
        // The value is already bound, but we set the flag.
        console.log("[LDA Debug] User selected model:", newModel, providerId);
    }

    function loadConfiguredModels(settings: any) {
        const groups: ProviderGroup[] = [];

        // Parse custom models
        let customModels: Record<string, string[]> = {};
        try {
            customModels = JSON.parse(settings["custom_models"] || "{}");
        } catch (e) {
            console.error("Failed to parse custom_models", e);
        }

        for (const provider of PROVIDERS) {
            const defaultProviderEnabled = provider.id === "openai";
            const providerKey = `enable_provider_${provider.id}`;
            const isProviderEnabled =
                settings[providerKey] !== undefined
                    ? settings[providerKey]
                    : defaultProviderEnabled;

            if (!isProviderEnabled) continue;

            const groupModels: any[] = [];

            // Built-in models
            for (const model of provider.models) {
                const modelKey = `enable_model_${model.value}`;
                const isModelEnabled =
                    settings[modelKey] !== undefined
                        ? settings[modelKey]
                        : model.defaultEnabled;

                if (isModelEnabled) {
                    const reasoningKey = `enable_reasoning_${provider.id}_${model.value}`;
                    const customReasoningEnabled = settings[reasoningKey];
                    // Fallback to static definition only if setting is undefined (e.g. fresh install before settings open)
                    const supportsReasoning =
                        customReasoningEnabled !== undefined
                            ? customReasoningEnabled
                            : model.supportsReasoning;

                    groupModels.push({
                        id: model.value,
                        name: model.label,
                        supportsReasoning: supportsReasoning,
                    });
                }
            }

            // Custom models
            const providerCustomModels = customModels[provider.id] || [];
            for (const modelName of providerCustomModels) {
                const reasoningKey = `enable_reasoning_${provider.id}_${modelName}`;
                // Default to false for custom models if setting undefined
                const supportsReasoning = settings[reasoningKey] || false;

                groupModels.push({
                    id: modelName,
                    name: `${modelName} (Custom)`,
                    supportsReasoning: supportsReasoning,
                });
            }

            if (groupModels.length > 0) {
                groups.push({
                    providerId: provider.id,
                    providerName: provider.label,
                    models: groupModels,
                });
            }
        }
        modelGroups = groups;

        // Ensure selected model is still valid
        if (groups.length > 0) {
            const allModels = groups.flatMap((g) => g.models);

            // 1. Check if current selected model is valid
            const currentIsValid = allModels.some(
                (m) => m.id === selectedModel,
            );

            // 2. Get default from settings
            const defaultModelSetting = settings["model"];
            const defaultIsValid =
                defaultModelSetting &&
                allModels.some((m) => m.id === defaultModelSetting);

            // Logic:
            // If the user has manually selected a model, and it's still valid, we keep it.
            if (userHasSelectedModel && currentIsValid) {
                return;
            }

            // If user has NOT manually selected, OR the current selection is invalid (removed):
            // We should try to set to default setting if valid.
            if (!userHasSelectedModel || !currentIsValid) {
                if (defaultIsValid) {
                    selectedModel = defaultModelSetting;
                } else if (!currentIsValid) {
                    // Fallback only if we have nothing valid
                    selectedModel = allModels[0].id;
                }

                // Also update providerId for the default/fallback model
                for (const group of groups) {
                    if (group.models.some((m) => m.id === selectedModel)) {
                        selectedProviderId = group.providerId;
                        break;
                    }
                }
            }
        }
    }

    // --- Reasoning Logic ---
    let currentModelSupportsReasoning = $derived.by(() => {
        if (!selectedModel || !modelGroups.length) return false;
        for (const group of modelGroups) {
            const m = group.models.find((m) => m.id === selectedModel);
            if (m) return !!m.supportsReasoning;
        }
        return false;
    });

    $effect(() => {
        if (!currentModelSupportsReasoning) return;

        const settings = $settingsStore || {};
        const miniModel = settings["miniModel"];
        const isMini = selectedModel === miniModel;

        const defaultEffort = isMini
            ? settings["miniModelReasoningEffort"] || "none"
            : settings["defaultReasoningEffort"] || "medium";

        reasoningEffort = defaultEffort;
    });

    function openReasoningMenu(e: MouseEvent) {
        e.preventDefault();
        e.stopPropagation();

        const btn = e.currentTarget as HTMLElement;
        const rect = btn.getBoundingClientRect();

        // Use setTimeout to avoid the current click event immediately closing the menu
        setTimeout(() => {
            contextMenu = {
                visible: true,
                x: rect.left,
                y: rect.top - 10,
                message: null,
                hasSelection: false,
                selectedText: "",
                type: "reasoning",
            };
        }, 0);
    }

    // --- Actions ---
    async function handleSubmit() {
        if (!inputText.trim()) return;

        // Use bound provider ID (ModelSelector ensures it matches)
        // Fallback search only if needed (e.g. init state fallback)
        let providerId = selectedProviderId;
        const agentName = selectedAgent ? $selectedAgent : undefined;
        onSendMessage(
            inputText,
            selectedModel,
            providerId,

            $isMergeOn ?? true, // Use store value
            currentModelSupportsReasoning ? reasoningEffort : undefined,
            agentName,
            activeContexts.filter((c) => c.isActive).map((c) => c.item), // Pass only active contexts
        );
        inputText = "";

        // Clear manual contexts, disable auto contexts
        activeContexts = activeContexts
            .filter((c) => c.isAuto)
            .map((c) => ({ ...c, isActive: false }));
    }

    async function setupAutoContext() {
        const ctx = await getCurrentPageContext();
        updateAutoContext(ctx);

        // Subscribe to changes
        return onCurrentPageChange((newCtx) => {
            updateAutoContext(newCtx);
        });
    }

    function updateAutoContext(ctx: ContextItem | null) {
        // Find if we already hav auto context
        const existingAutoIndex = activeContexts.findIndex((c) => c.isAuto);
        const wasActive =
            existingAutoIndex !== -1
                ? activeContexts[existingAutoIndex].isActive
                : true; // Default to true if new

        let newContexts = activeContexts.filter((c) => !c.isAuto);

        if (ctx) {
            // Prepend new auto context with restored state
            newContexts = [
                { item: ctx, isActive: wasActive, isAuto: true },
                ...newContexts,
            ];
        }

        activeContexts = newContexts;
    }

    onMount(() => {
        const unsub = setupAutoContext();
        // Since setupAutoContext is async but returns a sync unsub function wrapper primarily,
        // actually `onCurrentPageChange` returns the unsub.
        // We need to handle the promise for the initial fetch?
        // `setupAutoContext` is async.
        // Let's refactor slightly to be clean.
        let cleanup: (() => void) | undefined;
        setupAutoContext().then((un) => (cleanup = un));

        return () => {
            if (cleanup) cleanup();
        };
    });

    async function addCurrentPageContext() {
        // This is now "Reset/Re-add" or manual trigger if needed.
        // But with auto-context, this menu item might be redundant or just ensure it's enabled?
        // Let's make it just ensure it's active.
        const ctx = await getCurrentPageContext();
        if (ctx) {
            const existingAuto = activeContexts.find((c) => c.isAuto);
            if (existingAuto) {
                // specific logic: ensure it is active
                existingAuto.isActive = true;
                activeContexts = [...activeContexts]; // trigger reactivity
            } else {
                // Should have been there by auto, but if somehow missing:
                updateAutoContext(ctx);
            }
        }
        isContextMenuOpen = false;
    }

    function removeContext(id: string) {
        activeContexts = activeContexts.filter((c) => c.item.id !== id);
    }

    function toggleContext(id: string) {
        activeContexts = activeContexts.map((c) =>
            c.item.id === id ? { ...c, isActive: !c.isActive } : c,
        );
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    }

    function togglePartCollapse(msgIndex: number, partIndex: number) {
        // Mutate the store
        messages.update((msgs) => {
            const newMsgs = [...msgs];
            const msg = { ...newMsgs[msgIndex] };
            if (msg.parts) {
                const parts = [...msg.parts];
                const part = parts[partIndex];

                // Determine current collapsed state
                // For tool_call: default is true (collapsed)
                // For others: default is false (expanded) -- matching previous behavior
                const defaultCollapsed = part.type === "tool_call";
                const isCollapsed = part.isCollapsed ?? defaultCollapsed;

                parts[partIndex] = {
                    ...part,
                    isCollapsed: !isCollapsed,
                };
                msg.parts = parts;
                newMsgs[msgIndex] = msg;
            }
            return newMsgs;
        });
    }

    function findToolResult(
        msg: Message,
        toolCallId: string | undefined,
    ): MessagePart | undefined {
        if (!toolCallId || !msg.parts) return undefined;
        return msg.parts.find(
            (p) => p.type === "tool_result" && p.toolCallId === toolCallId,
        );
    }

    // --- Context Menu Actions ---
    function handleContextMenu(e: MouseEvent, msg: Message) {
        e.preventDefault();
        e.stopPropagation();

        // Get current text selection
        const selection = window.getSelection();
        const selectedText = selection?.toString() || "";

        contextMenu = {
            visible: true,
            x: e.clientX,
            y: e.clientY,
            message: msg,
            hasSelection: selectedText.length > 0,
            selectedText: selectedText,
            type: "message",
        };
    }

    async function copySelectionToClipboard() {
        if (!contextMenu.selectedText) return;
        try {
            await navigator.clipboard.writeText(contextMenu.selectedText);
            console.log("Selection copied to clipboard");
        } catch (err) {
            console.error("Failed to copy selection:", err);
        }
    }

    async function copyMessageToClipboard(msg: Message) {
        if (!msg) return;

        let textToCopy = "";

        // If simple content
        if (!msg.parts || msg.parts.length === 0) {
            textToCopy = msg.content;
        } else {
            // Filter parts: exclude tool_call and tool_result
            // Include content and reasoning
            const parts = msg.parts.filter((p) =>
                ["content", "reasoning"].includes(p.type),
            );
            textToCopy = parts.map((p) => p.text || "").join("\n\n");

            // Fallback for empty parts if original content exists (legacy support)
            if (!textToCopy && msg.content) {
                textToCopy = msg.content;
            }
        }

        try {
            await navigator.clipboard.writeText(textToCopy);
            console.log("Copied to clipboard");
            // Ideally assume toast notification elsewhere or simple log
        } catch (err) {
            console.error("Failed to copy:", err);
        }
    }

    // --- Effects ---
    // Auto-scroll logic: Only scroll when meaningful content changes, not on UI toggles
    let lastMessageCount = 0;
    let lastTailMessageSignature = "";

    function getMessageSignature(msg: Message | undefined): string {
        if (!msg) return "";
        // Create a signature based on content and structure, ignoring UI state like isCollapsed
        let sig = `${msg.id}:${msg.content.length}:${msg.role}`;
        if (msg.parts) {
            sig += `:${msg.parts.length}`;
            msg.parts.forEach((p) => {
                sig += `:${p.type}`;
                if (p.type === "tool_result") {
                    // Include tool result length/type in signature to scroll when result arrives
                    sig += `:${p.toolResult ? JSON.stringify(p.toolResult).length : 0}`;
                }
                // For streaming content updates
                if (p.type === "content") {
                    sig += `:${p.text?.length || 0}`;
                }
                if (p.type === "reasoning") {
                    sig += `:${p.text?.length || 0}`;
                }
            });
        }
        return sig;
    }

    $effect(() => {
        const msgs = $messages;
        const currentCount = msgs.length;
        const lastMsg = msgs[msgs.length - 1];
        const currentTailSignature = getMessageSignature(lastMsg);

        // Check if we should scroll
        const shouldScroll =
            currentCount > lastMessageCount || // New message added
            (currentCount === lastMessageCount &&
                currentTailSignature !== lastTailMessageSignature); // Content updated (streaming or tool result)

        if (shouldScroll && messageContainer) {
            // Update trackers
            lastMessageCount = currentCount;
            lastTailMessageSignature = currentTailSignature;

            // Use setTimeout to allow DOM update
            setTimeout(() => scrollToBottom(), 0);
        } else if (currentCount < lastMessageCount) {
            // Handle deletion or reset - just update trackers without scrolling or maybe scroll if needed?
            // Usually on delete we don't need to force scroll to bottom, but we should update trackers.
            lastMessageCount = currentCount;
            lastTailMessageSignature = currentTailSignature;
        }
    });

    function scrollToBottom() {
        if (messageContainer) {
            messageContainer.scrollTop = messageContainer.scrollHeight;
        }
    }

    // --- Helpers ---
    function renderMarkdown(text: string): string {
        try {
            return marked.parse(text) as string;
        } catch (e) {
            console.error("Markdown parse error", e);
            return text;
        }
    }

    // --- Icons ---
    const brainSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" /><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" /><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" /><path d="M17.599 6.5a3 3 0 0 0 .399-1.375" /><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5" /><path d="M3.477 10.896a4 4 0 0 1 .585-.396" /><path d="M19.938 10.5a4 4 0 0 1 .585.396" /><path d="M6 18a4 4 0 0 1-1.9-7.4" /><path d="M18 18a4 4 0 0 0 1.9-7.4" /></svg>`;
    const dashSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;

    const icons = {
        dash: `<div style="opacity: 0.5;">${dashSvg}</div>`,
        brainSmall: `<div style="transform: scale(0.8); color: var(--ls-link-text-color, #106ba3);">${brainSvg}</div>`,
        brainMedium: `<div style="transform: scale(1.0); color: var(--ls-link-text-color, #106ba3);">${brainSvg}</div>`,
        brainLarge: `<div style="transform: scale(1.2); color: var(--ls-link-text-color, #106ba3);">${brainSvg}</div>`,
    };
</script>

<div class="lda-chat-container">
    <!-- Message List -->
    <div bind:this={messageContainer} class="lda-chat-messages">
        {#each $messages as msg, mIndex (msg.id)}
            <div class="lda-message-row {msg.role}">
                <!-- Avatar / Sender Name -->
                <div class="lda-message-meta">
                    <div
                        class="lda-avatar {msg.role === 'user'
                            ? 'ls-accent-user'
                            : 'ls-accent-agent'}"
                        style="background-color: {msg.role === 'user'
                            ? 'var(--ls-link-text-color)'
                            : '#888'};"
                    ></div>
                    <span class="font-bold"
                        >{msg.personalityName ||
                            (msg.role === "user" ? "You" : "AI")}</span
                    >
                </div>

                <!-- Bubble -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                    class="lda-bubble {msg.role === 'user'
                        ? 'ls-bg-user'
                        : 'ls-bg-agent'}"
                    oncontextmenu={(e) => handleContextMenu(e, msg)}
                >
                    <!-- Standard Content (Flat) -->
                    {#if !msg.parts || msg.parts.length === 0}
                        <div class="markdown-body">
                            {@html renderMarkdown(msg.content)}
                        </div>
                    {/if}

                    <!-- Multi-part Content -->
                    {#if msg.parts}
                        {#each msg.parts as part, pIndex}
                            <!-- Reasoning Block -->
                            {#if part.type === "reasoning"}
                                <div
                                    class="mb-2 pl-2"
                                    style="border-color: var(--ls-border-color);"
                                >
                                    <button
                                        class="text-xs font-medium flex items-center hover:underline focus:outline-none"
                                        style="color: var(--ls-secondary-text-color); background: none; border: none; cursor: pointer;"
                                        onclick={() =>
                                            togglePartCollapse(mIndex, pIndex)}
                                    >
                                        <span class="mr-1"
                                            >{part.isCollapsed
                                                ? "▶"
                                                : "▼"}</span
                                        >
                                        Reasoning
                                    </button>
                                    {#if !part.isCollapsed}
                                        <div
                                            transition:slide={{
                                                duration: 300,
                                                axis: "y",
                                            }}
                                            class="text-xs italic mt-1 lda-animate-fadeIn"
                                            style="color: var(--ls-secondary-text-color);"
                                        >
                                            {part.text}
                                        </div>
                                    {/if}
                                </div>

                                <!-- Tool Call Block (Integrated with Result) -->
                            {:else if part.type === "tool_call"}
                                {@const resultPart = findToolResult(
                                    msg,
                                    part.toolCallId,
                                )}
                                {@const isCollapsed = part.isCollapsed ?? true}
                                <div
                                    class="mb-2 border rounded text-xs"
                                    style="border-color: var(--ls-border-color); background: var(--ls-secondary-background-color);"
                                >
                                    <!-- Header: Icon, Name, Checkmark, Toggle -->
                                    <button
                                        type="button"
                                        class="flex justify-between items-center w-full p-2 cursor-pointer focus:outline-none hover:opacity-80 transition-opacity"
                                        style="background: none; border: none; color: var(--ls-primary-text-color); text-align: left;"
                                        onclick={() =>
                                            togglePartCollapse(mIndex, pIndex)}
                                        aria-expanded={!isCollapsed}
                                    >
                                        <div
                                            class="flex items-center gap-2 font-mono"
                                        >
                                            <span>🔨</span>
                                            <span class="font-bold"
                                                >{part.toolName}</span
                                            >
                                            {#if resultPart}
                                                <span
                                                    class="text-green-500 ml-1"
                                                    title="Tool finished"
                                                    style="color: var(--ls-success-text-color, green);"
                                                    >✔</span
                                                >
                                            {/if}
                                        </div>
                                        <div
                                            class="font-bold text-lg leading-none"
                                        >
                                            {isCollapsed ? "+" : "−"}
                                        </div>
                                    </button>

                                    <!-- Expanded Content: Args + Result -->
                                    {#if !isCollapsed}
                                        <div
                                            class="p-2 border-t lda-animate-fadeIn"
                                            style="border-color: var(--ls-border-color);"
                                        >
                                            <!-- Parameters -->
                                            {#if part.toolArgs}
                                                <div class="mb-2">
                                                    <div
                                                        class="font-semibold mb-1 opacity-70"
                                                    >
                                                        Parameters:
                                                    </div>
                                                    <pre
                                                        class="overflow-x-auto p-2 rounded border"
                                                        style="background: var(--ls-primary-background-color); border-color: var(--ls-border-color); color: var(--ls-primary-text-color);">{JSON.stringify(
                                                            part.toolArgs,
                                                            null,
                                                            2,
                                                        )}</pre>
                                                </div>
                                            {/if}

                                            <!-- Result -->
                                            {#if resultPart}
                                                <div class="mt-2">
                                                    <div
                                                        class="font-semibold mb-1 opacity-70"
                                                    >
                                                        Result:
                                                    </div>
                                                    <pre
                                                        class="overflow-x-auto p-2 rounded border"
                                                        style="background: var(--ls-tertiary-background-color, #f5f5f5); border-color: var(--ls-border-color); color: var(--ls-primary-text-color);">{typeof resultPart.toolResult ===
                                                        "string"
                                                            ? resultPart.toolResult
                                                            : JSON.stringify(
                                                                  resultPart.toolResult,
                                                                  null,
                                                                  2,
                                                              )}</pre>
                                                </div>
                                            {:else}
                                                <div
                                                    class="italic opacity-50 mt-1"
                                                >
                                                    Waiting for result...
                                                </div>
                                            {/if}
                                        </div>
                                    {/if}
                                </div>

                                <!-- Tool Result Block (Hidden, integrated above) -->
                            {:else if part.type === "tool_result"}
                                <!-- Do nothing, rendered in tool_call -->
                            {:else if part.type === "content"}
                                <div class="markdown-body">
                                    {@html renderMarkdown(part.text || "")}
                                </div>
                            {:else if part.type === "context"}
                                <div class="mb-2">
                                    <details
                                        class="group border rounded-sm"
                                        style="border-color: var(--ls-border-color); background: var(--ls-secondary-background-color);"
                                    >
                                        <summary
                                            class="flex items-center cursor-pointer p-2 text-xs font-medium select-none focus:outline-none opacity-80 hover:opacity-100"
                                        >
                                            <span
                                                class="mr-2 transform group-open:rotate-90 transition-transform"
                                                >▶</span
                                            >
                                            <span
                                                >📄 Context: {part.contextName ||
                                                    "Attached Document"}</span
                                            >
                                        </summary>
                                        <div
                                            class="p-2 border-t text-xs overflow-x-auto whitespace-pre-wrap font-mono"
                                            style="border-color: var(--ls-border-color); color: var(--ls-secondary-text-color);"
                                        >
                                            {part.contextContent ||
                                                part.text ||
                                                ""}
                                        </div>
                                    </details>
                                </div>
                            {/if}
                        {/each}
                    {/if}
                </div>
            </div>
        {/each}

        {#if $isLoading}
            <div
                class="flex items-center gap-2 p-2"
                style="color: var(--ls-secondary-text-color); font-size: 0.8rem;"
            >
                <div class="animate-pulse">Thinking...</div>
            </div>
        {/if}
    </div>

    <!-- Input Area -->
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
                        onclick={() => toggleContext(ctx.item.id)}
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
                                onclick={(e) => {
                                    e.stopPropagation();
                                    removeContext(ctx.item.id);
                                }}
                            >
                                ×
                            </button>
                        {/if}
                    </div>
                {/each}
            </div>
        {/if}
        <textarea
            class="lda-chat-textarea"
            rows="2"
            placeholder="Ask anything..."
            bind:value={inputText}
            onkeydown={handleKeydown}
        ></textarea>

        <div class="lda-chat-footer">
            <!-- Add Context Button -->
            <div class="relative">
                <button
                    class="lda-btn-icon"
                    title="Add Context"
                    onclick={() => (isContextMenuOpen = !isContextMenuOpen)}
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="16"></line>
                        <line x1="8" y1="12" x2="16" y2="12"></line>
                    </svg>
                </button>
                {#if isContextMenuOpen}
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div
                        class="lda-context-menu-backdrop"
                        onclick={() => (isContextMenuOpen = false)}
                    ></div>
                    <div class="lda-context-menu-popover">
                        <button
                            class="lda-context-menu-item"
                            onclick={addCurrentPageContext}
                        >
                            <span>📄</span> Current Page
                        </button>
                    </div>
                {/if}
            </div>

            <!-- Merge Toggle Removed (Moved to Options Menu) -->

            <!-- Agent Selection -->
            {#if agents && $agents && $agents.length > 0 && selectedAgent}
                <AgentSelector
                    agents={$agents}
                    value={$selectedAgent || ""}
                    onChange={(agent) => {
                        if (agent && selectedAgent) {
                            $selectedAgent = agent.name;
                        }
                    }}
                />
            {/if}

            <!-- Model Selection -->
            <ModelSelector
                bind:value={selectedModel}
                bind:providerId={selectedProviderId}
                groups={modelGroups}
                onChange={handleModelChange}
            />

            {#if currentModelSupportsReasoning}
                <button
                    class="lda-btn-icon ml-1"
                    title={`Reasoning Effort: ${reasoningEffort}`}
                    onclick={openReasoningMenu}
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
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        >
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                    {:else}
                        <!-- Brain Icon - Scaled based on effort -->
                        <div
                            style="transform: scale({reasoningEffort === 'low'
                                ? 0.8
                                : reasoningEffort === 'medium'
                                  ? 1.0
                                  : 1.2}); display: flex; align-items: center; justify-content: center;"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            >
                                <path
                                    d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"
                                />
                                <path
                                    d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"
                                />
                                <path
                                    d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"
                                />
                                <path d="M17.599 6.5a3 3 0 0 0 .399-1.375" />
                                <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5" />
                                <path d="M3.477 10.896a4 4 0 0 1 .585-.396" />
                                <path d="M19.938 10.5a4 4 0 0 1 .585.396" />
                                <path d="M6 18a4 4 0 0 1-1.9-7.4" />
                                <path d="M18 18a4 4 0 0 0 1.9-7.4" />
                            </svg>
                        </div>
                    {/if}
                </button>
            {/if}

            <div class="lda-spacer"></div>

            <!-- Send Button -->
            <button
                class="lda-btn-primary"
                onclick={handleSubmit}
                title="Send"
                disabled={!inputText.trim()}
                style={!inputText.trim()
                    ? "opacity: 0.5; cursor: default;"
                    : ""}
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                >
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                    <polyline points="12 5 19 12 12 19"></polyline>
                </svg>
            </button>
        </div>
    </div>

    <!-- Context Menu -->
    {#if contextMenu.visible && (contextMenu.message || contextMenu.type === "reasoning")}
        <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            options={contextMenu.type === "reasoning"
                ? [
                      {
                          label: "None",
                          icon: icons.dash,
                          action: () => {
                              reasoningEffort = "none";
                              contextMenu = { ...contextMenu, visible: false };
                          },
                      },
                      {
                          label: "Low",
                          icon: icons.brainSmall,
                          action: () => {
                              reasoningEffort = "low";
                              contextMenu = { ...contextMenu, visible: false };
                          },
                      },
                      {
                          label: "Medium",
                          icon: icons.brainMedium,
                          action: () => {
                              reasoningEffort = "medium";
                              contextMenu = { ...contextMenu, visible: false };
                          },
                      },
                      {
                          label: "High",
                          icon: icons.brainLarge,
                          action: () => {
                              reasoningEffort = "high";
                              contextMenu = { ...contextMenu, visible: false };
                          },
                      },
                  ]
                : [
                      // Copy Selection - only shown when text is selected
                      ...(contextMenu.hasSelection
                          ? [
                                {
                                    label: "Copy Selection",
                                    action: () => {
                                        copySelectionToClipboard();
                                    },
                                },
                            ]
                          : []),
                      // Copy Message - always shown
                      {
                          label: "Copy Message",
                          action: () => {
                              if (contextMenu.message) {
                                  copyMessageToClipboard(contextMenu.message);
                              }
                          },
                      },
                  ]}
            onClose={() => (contextMenu = { ...contextMenu, visible: false })}
        />
    {/if}

    <!-- History Modal (As Overlay) -->

    {#if onListChatlogs && historyModalOpen}
        <ChatHistoryModal
            isOpen={$historyModalOpen ?? false}
            onClose={() => historyModalOpen?.set(false)}
            onNewChat={() => {
                if (onNewChat) onNewChat();
                historyModalOpen?.set(false);
            }}
            onLoadChatlog={(id) => {
                if (onLoadChatlog) onLoadChatlog(id);
                historyModalOpen?.set(false);
            }}
            onDeleteChatlog={(id) => {
                if (onDeleteChatlog) onDeleteChatlog(id);
            }}
            {onListChatlogs}
        />
    {/if}
</div>

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
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);

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
</style>
