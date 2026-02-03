<script lang="ts">
    import { onMount, tick, getContext, untrack } from "svelte";
    import { slide } from "svelte/transition";
    import type { Writable } from "svelte/store";
    import {
        getCurrentPageContext,
        onCurrentPageChange,
        type ContextItem,
    } from "../../../infra/logseq/context-utils";

    import { PROVIDERS } from "../../../domain/settings/index";
    import type { ProviderGroup } from "./ModelSelector.svelte";
    import ChatHistoryModal from "./ChatHistoryModal.svelte";
    import ContextMenu from "./ContextMenu.svelte";
    import MessageBubble from "./MessageBubble.svelte";
    import ChatInputArea from "./ChatInputArea.svelte";

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
        focusSignal?: Writable<number>;
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
        focusSignal,
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

    let contextMenu = $state({
        visible: false,
        x: 0,
        y: 0,
        message: null as Message | null,
        hasSelection: false,
        selectedText: "",
        type: "message" as "message",
    });

    interface ActiveContext {
        item: ContextItem;
        isActive: boolean;
        isAuto?: boolean; // New flag for auto-context
    }

    let activeContexts = $state<ActiveContext[]>([]);

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
        // isContextMenuOpen managed by ChatInputArea
    }

    function removeContext(id: string) {
        activeContexts = activeContexts.filter((c) => c.item.id !== id);
    }

    function toggleContext(id: string) {
        activeContexts = activeContexts.map((c) =>
            c.item.id === id ? { ...c, isActive: !c.isActive } : c,
        );
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
</script>

<div class="lda-chat-container">
    <!-- Message List -->
    <div bind:this={messageContainer} class="lda-chat-messages">
        {#each $messages as msg, mIndex (msg.id)}
            <MessageBubble
                {msg}
                onToggleCollapse={(pIndex) =>
                    togglePartCollapse(mIndex, pIndex)}
                onContextMenu={(e, m) => handleContextMenu(e, m)}
            />
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
    <ChatInputArea
        bind:inputText
        isLoading={$isLoading}
        {activeContexts}
        agents={$agents || []}
        selectedAgent={$selectedAgent || ""}
        {modelGroups}
        bind:selectedModel
        bind:selectedProviderId
        bind:reasoningEffort
        {currentModelSupportsReasoning}
        focusSignal={$focusSignal}
        onSendMessage={handleSubmit}
        onAddContext={addCurrentPageContext}
        onRemoveContext={removeContext}
        onToggleContext={toggleContext}
        onModelChange={handleModelChange}
        onAgentChange={(name) => {
            if ($selectedAgent !== undefined) $selectedAgent = name;
        }}
    />

    <!-- Context Menu -->
    {#if contextMenu.visible && contextMenu.message}
        <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            options={[
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
    /* No generic styles left, but keeping style tag open for future or global overrides if needed */
</style>
