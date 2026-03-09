<script lang="ts">
    import { onMount, tick, getContext, untrack } from "svelte";
    import { slide } from "svelte/transition";
    import type { Writable } from "svelte/store";
    import {
        getCurrentPageContext,
        onCurrentPageChange,
    } from "../../../infra/logseq/context-utils";
    import type { ContextItem } from "../../../domain/chat/types";

    import {
        PROVIDERS,
        OPENAI_COMPAT_ID_PREFIX,
        parseOpenAICompatProviders,
    } from "../../../domain/settings/index";
    import type { ProviderGroup } from "./ModelSelector.svelte";
    import ChatHistoryModal from "./ChatHistoryModal.svelte";
    import ContextMenu from "./ContextMenu.svelte";
    import MessageBubble from "./MessageBubble.svelte";
    import ChatInputArea from "./ChatInputArea.svelte";

    // --- Types ---
    import type { Message, MessagePart } from "../../../domain/chat/types";
    import type { ChatlogMetadata } from "../../../domain/chatlog/types";
    import type { AgentDefinition } from "../../../domain/agent/types";
    import type { ChatPrompt } from "../../../domain/chat/prompt";
    import { Services } from "../../../services";
    import { clickHandler } from "../../util/actions";

    interface Props {
        messages: Writable<Message[]>;
        isLoading: Writable<boolean>;
        currentChatlogId?: Writable<string | null>;
        historyModalOpen?: Writable<boolean>;
        isMergeOn?: Writable<boolean>;
        agents?: Writable<AgentDefinition[]>;
        selectedAgent?: Writable<string>;
        focusSignal?: Writable<number>;
        expandSignal?: Writable<number>;
        showContinueButton?: Writable<boolean>;
        onContinue?: () => void;
        onSendMessage: (
            text: string,
            modelId: string,
            providerId: string,
            merge: boolean,
            reasoningEffort?: "none" | "low" | "medium" | "high",
            agentName?: string,
            contextItems?: ContextItem[],
            selectedPrompts?: string[],
        ) => void;
        onClose: () => void;
        onReset: () => void;
        onNewChat?: () => void;
        onLoadChatlog?: (id: string) => void;
        onListChatlogs?: () => Promise<ChatlogMetadata[]>;
        onDeleteChatlog?: (id: string) => void;
        onStop?: () => void;
        onAgentListOpen?: () => void;
    }

    let {
        messages,
        isLoading,
        historyModalOpen,
        isMergeOn,
        agents,
        selectedAgent,
        focusSignal,
        expandSignal,
        showContinueButton,
        onContinue,
        onSendMessage,
        onNewChat,
        onLoadChatlog,
        onListChatlogs,
        onDeleteChatlog,
        onStop,
        onAgentListOpen,
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
    let selectedPrompts = $state<string[]>([]);
    let availablePrompts = $state<ChatPrompt[]>([]);

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

        // Dynamic OpenAI Compatible providers
        const compatProviders = parseOpenAICompatProviders(settings);
        for (const compat of compatProviders) {
            const providerId = `${OPENAI_COMPAT_ID_PREFIX}${compat.id}`;
            const compatCustomModels: string[] = customModels[providerId] || [];
            const groupModels: any[] = compatCustomModels.map((modelName) => {
                const reasoningKey = `enable_reasoning_${providerId}_${modelName}`;
                return {
                    id: modelName,
                    name: modelName,
                    supportsReasoning: settings[reasoningKey] || false,
                };
            });

            if (groupModels.length > 0) {
                groups.push({
                    providerId,
                    providerName: compat.label,
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
            selectedPrompts, // user's selected prompts for this submit
        );
        inputText = "";

        // Clear manual contexts, disable auto contexts, clear prompts
        selectedPrompts = [];
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

    function refreshPrompts() {
        Services.instance.promptTemplateService
            .listPrompts()
            .then((p: ChatPrompt[]) => {
                availablePrompts = p;
            });
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

        // Load Prompts
        refreshPrompts();

        // Intercept Ctrl/Cmd+C in capture phase so Logseq's own handlers don't swallow the
        // copy when text is selected inside a message bubble.
        const handleCopyKey = (e: KeyboardEvent) => {
            if (!(e.ctrlKey || e.metaKey) || e.key !== "c") return;
            if (!messageContainer) return;

            const doc = messageContainer.ownerDocument ?? document;
            const selection = doc.getSelection();
            const selectedText = selection?.toString() ?? "";
            if (!selectedText) return;

            // Only intercept when the selection lives inside our message list.
            const anchor = selection?.anchorNode;
            if (!anchor || !messageContainer.contains(anchor)) return;

            e.preventDefault();
            e.stopPropagation();

            navigator.clipboard.writeText(selectedText).catch(() => {
                copyToClipboardFallback(selectedText);
            });
        };

        const doc = document;
        doc.addEventListener("keydown", handleCopyKey, true);

        return () => {
            if (cleanup) cleanup();
            doc.removeEventListener("keydown", handleCopyKey, true);
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

    function addManualContext(item: ContextItem) {
        // Remove existing item with same ID if present
        const filtered = activeContexts.filter((c) => c.item.id !== item.id);

        // Ensure manual contexts are prepended but after auto contexts?
        // Or just append. Append is fine.
        activeContexts = [...filtered, { item, isActive: true, isAuto: false }];
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

        // Get current text selection from the event target's document so it works
        // correctly in the Logseq plugin/iframe context where window.getSelection()
        // may refer to the wrong document.
        const doc = (e.target as Node).ownerDocument ?? document;
        const selection = doc.getSelection();
        const selectedText = selection?.toString() ?? "";

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

        // Ensure window has focus for clipboard access
        try {
            window.focus();
        } catch (e) {
            console.warn("Failed to focus window for clipboard copy:", e);
        }

        try {
            await navigator.clipboard.writeText(contextMenu.selectedText);
            console.log("Selection copied to clipboard");
        } catch (err) {
            console.warn("Clipboard API failed, trying fallback:", err);
            copyToClipboardFallback(contextMenu.selectedText);
        }
    }

    // Fallback for when Clipboard API fails (common in iframes/extensions)
    function copyToClipboardFallback(text: string) {
        try {
            const textArea = document.createElement("textarea");
            textArea.value = text;

            // Ensure it's not visible but part of DOM
            textArea.style.position = "fixed";
            textArea.style.left = "-9999px";
            textArea.style.top = "0";
            document.body.appendChild(textArea);

            textArea.focus();
            textArea.select();

            const successful = document.execCommand("copy");
            document.body.removeChild(textArea);

            if (successful) {
                console.log("Copied to clipboard via fallback");
            } else {
                console.error("Fallback copy failed");
            }
        } catch (err) {
            console.error("Fallback copy error:", err);
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

        // Ensure window has focus for clipboard access
        try {
            window.focus();
        } catch (e) {
            console.warn("Failed to focus window for clipboard copy:", e);
        }

        try {
            await navigator.clipboard.writeText(textToCopy);
            console.log("Copied to clipboard");
            // Ideally assume toast notification elsewhere or simple log
        } catch (err) {
            console.warn("Clipboard API failed, trying fallback:", err);
            copyToClipboardFallback(textToCopy);
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

    // Re-enable auto context (current document) when a new chat session starts
    $effect(() => {
        const msgs = $messages;
        if (msgs.length === 0) {
            untrack(() => {
                activeContexts = activeContexts.map((c) =>
                    c.isAuto ? { ...c, isActive: true } : c,
                );
            });
        }
    });

    // --- Merging Consecutive Tool Messages ---
    let groupedMessages = $derived.by(() => {
        const msgs = $messages;
        if (!msgs || msgs.length === 0) return [];

        const result: Message[] = [];
        let current: Message | null = null;

        // Helper to check if message relies on parts for its content
        // Modified to consider any message with parts as potentially having tools
        const isToolMsg = (m: Message) =>
            m.parts &&
            m.parts.some(
                (p) => p.type === "tool_call" || p.type === "tool_result",
            );

        for (const msg of msgs) {
            if (!current) {
                current = {
                    ...msg,
                    parts: msg.parts ? [...msg.parts] : undefined,
                };
                continue;
            }

            // Check if 'current' is a merge candidate (Assistant with tools)
            const currentIsMergeTarget =
                current.role === "assistant" && isToolMsg(current);

            if (currentIsMergeTarget) {
                if (msg.role === "tool") {
                    // Merge Tool Result into Assistant
                    const currentParts = current.parts || [];
                    const nextParts = msg.parts || [];
                    current.parts = [...currentParts, ...nextParts];
                    continue;
                } else if (msg.role === "assistant") {
                    // Merge consecutive Assistant Tool Calls OR Text follow-up
                    if (isToolMsg(msg)) {
                        // Merge subsequent tool calls
                        const currentParts = current.parts || [];
                        const nextParts = msg.parts || [];
                        current.parts = [...currentParts, ...nextParts];
                        continue;
                    } else if (
                        msg.content &&
                        (!msg.parts || msg.parts.length === 0)
                    ) {
                        // MERGE TARGET: Assistant follows up tool with simple text
                        // Convert text content to a part
                        const textPart: MessagePart = {
                            type: "content",
                            text: msg.content,
                        };
                        const currentParts = current.parts || [];
                        current.parts = [...currentParts, textPart];
                        // Append content to main content string just in case, or leave it?
                        // Usually main content is empty for tool calls, but for display we rely on parts.
                        // Let's concatenate for safety if anyone reads .content directly
                        current.content = current.content
                            ? current.content + "\n" + msg.content
                            : msg.content;
                        continue;
                    }
                }
            }

            // No merge
            result.push(current);
            current = { ...msg, parts: msg.parts ? [...msg.parts] : undefined };
        }
        if (current) result.push(current);
        return result;
    });

    let displayMessages = $derived(groupedMessages);

    // --- Settings ---
    let maximizedWidth = $derived(
        $settingsStore?.maximizedChatWidth || "900px",
    );
    // Calculated padding to center content while keeping container full width
    // We use a CSS variable for the calculation to respond to width changes
    // width: 100% is assumed.
    // padding = (100% - max_width) / 2
    // We use max(0px, ...) so it doesn't break on small screens.

    function scrollToBottom() {
        if (messageContainer) {
            messageContainer.scrollTop = messageContainer.scrollHeight;
        }
    }
</script>

<div class="lda-chat-container" style="--lda-max-width: {maximizedWidth}">
    <!-- Message List -->
    <div bind:this={messageContainer} class="lda-chat-messages">
        <!-- Inner wrapper for content constraint & border application -->
        <div class="lda-messages-inner">
            {#each displayMessages as msg, mIndex (msg.id)}
                <MessageBubble
                    {msg}
                    onToggleCollapse={(pIndex) =>
                        togglePartCollapse(mIndex, pIndex)}
                    onContextMenu={(e, m) => handleContextMenu(e, m)}
                />
            {/each}

            {#if showContinueButton && $showContinueButton}
                <div class="flex justify-center p-2 animate-fade-in">
                    <button
                        class="px-3 py-1 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-md shadow-sm transition-colors flex items-center gap-2"
                        use:clickHandler={() => onContinue?.()}
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="w-4 h-4"
                            viewBox="0 0 24 24"
                            stroke-width="2"
                            stroke="currentColor"
                            fill="none"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            ><path
                                stroke="none"
                                d="M0 0h24v24H0z"
                                fill="none"
                            /><path d="M7 7v10l10 -5z" /></svg
                        >
                        Continue generating
                    </button>
                </div>
            {/if}

            {#if $isLoading}
                <div
                    class="flex items-center gap-2 p-2"
                    style="color: var(--ls-secondary-text-color); font-size: 0.8rem;"
                >
                    <div class="animate-pulse">Thinking...</div>
                </div>
            {/if}
        </div>
    </div>

    <!-- Input Area -->
    <div class="lda-input-wrapper">
        <ChatInputArea
            bind:inputText
            bind:selectedPrompts
            {availablePrompts}
            isLoading={$isLoading}
            {activeContexts}
            agents={$agents || []}
            selectedAgent={$selectedAgent || ""}
            {modelGroups}
            bind:selectedModel
            bind:selectedProviderId
            bind:reasoningEffort
            {currentModelSupportsReasoning}
            focusSignal={focusSignal ? $focusSignal : undefined}
            expandSignal={expandSignal ? $expandSignal : undefined}
            onSendMessage={handleSubmit}
            onAddContext={addCurrentPageContext}
            onAddManualContext={addManualContext}
            onRemoveContext={removeContext}
            onToggleContext={toggleContext}
            onModelChange={handleModelChange}
            onAgentChange={(name) => {
                if ($selectedAgent !== undefined) $selectedAgent = name;
            }}
            {onStop}
            onAgentListOpen={onAgentListOpen}
            onPromptPickerOpen={refreshPrompts}
        />
    </div>

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
    /* Configurable Max Width for Full Screen Mode */
    :global(.lda-sidebar-maximized) .lda-chat-container {
        /* Keep container full width so background/layout uses full screen */
        width: 100%;
    }

    /* Apply padding constraint ONLY in maximized mode */
    :global(.lda-sidebar-maximized) .lda-chat-messages,
    :global(.lda-sidebar-maximized) .lda-input-wrapper {
        padding-inline: max(
            1rem,
            calc((100% - var(--lda-max-width, 900px)) / 2)
        );
    }

    /* Inner wrappers logic */
    .lda-messages-inner {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        min-height: 100%;
    }

    /* Apply Borders to the CONTENT elements when maximized */
    :global(.lda-sidebar-maximized)
        .lda-input-wrapper
        :global(.lda-chat-input-area) {
        border-right: 1px solid var(--ls-border-color, #dddddd);
        border-left: 1px solid var(--ls-border-color, #dddddd);
    }

    /* Input wrapper default styles */
    .lda-input-wrapper {
        flex-shrink: 0;
    }
</style>
