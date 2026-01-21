<script lang="ts">
    import { onMount, tick, getContext, untrack } from "svelte";
    import { marked } from "marked";
    import type { Writable } from "svelte/store";

    import { PROVIDERS } from "../../domain/settings/index";
    import ModelSelector, { type ProviderGroup } from "./ModelSelector.svelte";

    // --- Types ---
    import type { Message, MessagePart } from "../../domain/chat/types";

    interface Props {
        messages: Writable<Message[]>;
        isLoading: Writable<boolean>;
        onSendMessage: (
            text: string,
            modelId: string,
            providerId: string,
        ) => void;
        onClose: () => void; // Added onClose prop which was missing in original define but used in usecase
        onReset: () => void;
    }

    let { messages, isLoading, onSendMessage }: Props = $props();

    // --- Context ---
    const settingsStore = getContext<Writable<any>>("settings");

    // --- State ---
    let inputText = $state("");
    let messageContainer: HTMLDivElement | undefined = $state();
    let selectedModel = $state("");
    let selectedProviderId = $state(""); // New state
    let userHasSelectedModel = $state(false);
    let modelGroups: ProviderGroup[] = $state([]);

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
                    groupModels.push({ id: model.value, name: model.label });
                }
            }

            // Custom models
            const providerCustomModels = customModels[provider.id] || [];
            for (const modelName of providerCustomModels) {
                groupModels.push({
                    id: modelName,
                    name: `${modelName} (Custom)`,
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

    // --- Actions ---
    function handleSubmit() {
        if (!inputText.trim()) return;

        // Use bound provider ID (ModelSelector ensures it matches)
        // Fallback search only if needed (e.g. init state fallback)
        let providerId = selectedProviderId;
        onSendMessage(inputText, selectedModel, providerId);
        inputText = "";
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
                parts[partIndex] = {
                    ...parts[partIndex],
                    isCollapsed: !parts[partIndex].isCollapsed,
                };
                msg.parts = parts;
                newMsgs[msgIndex] = msg;
            }
            return newMsgs;
        });
    }

    // --- Effects ---
    // Auto-scroll when messages change
    $effect(() => {
        if ($messages.length && messageContainer) {
            // Use setTimeout to allow DOM update
            setTimeout(() => scrollToBottom(), 0);
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
                <div
                    class="lda-bubble {msg.role === 'user'
                        ? 'ls-bg-user'
                        : 'ls-bg-agent'}"
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
                                    class="mb-2 border-l-2 pl-2"
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
                                            class="text-xs italic mt-1 lda-animate-fadeIn"
                                            style="color: var(--ls-secondary-text-color);"
                                        >
                                            {part.text}
                                        </div>
                                    {/if}
                                </div>

                                <!-- Tool Call Block -->
                            {:else if part.type === "tool_call"}
                                <div
                                    class="mb-2 border rounded p-2 text-xs"
                                    style="border-color: var(--ls-border-color); background: var(--ls-secondary-background-color);"
                                >
                                    <button
                                        type="button"
                                        class="flex justify-between items-center cursor-pointer font-mono w-full text-left focus:outline-none"
                                        style="background: none; border: none; color: var(--ls-link-text-color);"
                                        onclick={() =>
                                            togglePartCollapse(mIndex, pIndex)}
                                    >
                                        <span class="font-bold"
                                            >🔨 {part.toolName}</span
                                        >
                                        <span
                                            >{part.isCollapsed
                                                ? "Show Args"
                                                : "Hide"}</span
                                        >
                                    </button>
                                    {#if !part.isCollapsed && part.toolArgs}
                                        <pre
                                            class="mt-2 overflow-x-auto p-1 rounded border"
                                            style="background: var(--ls-primary-background-color); border-color: var(--ls-border-color); color: var(--ls-primary-text-color);">
{JSON.stringify(part.toolArgs, null, 2)}</pre>
                                    {/if}
                                </div>
                            {:else if part.type === "content"}
                                <div class="markdown-body">
                                    {@html renderMarkdown(part.text || "")}
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
        <textarea
            class="lda-chat-textarea"
            rows="2"
            placeholder="Ask anything..."
            bind:value={inputText}
            onkeydown={handleKeydown}
        ></textarea>

        <div class="lda-chat-footer">
            <!-- Add Context Button -->
            <button class="lda-btn-icon" title="Add Context">
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
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
            </button>

            <!-- Model Selection -->
            <ModelSelector
                bind:value={selectedModel}
                bind:providerId={selectedProviderId}
                groups={modelGroups}
                onChange={handleModelChange}
            />

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
</div>
