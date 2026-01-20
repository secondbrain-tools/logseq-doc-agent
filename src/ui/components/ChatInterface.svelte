<script lang="ts">
    import { onMount } from "svelte";
    import { marked } from "marked";
    import type { Writable } from "svelte/store";

    // --- Types ---
    export interface Message {
        id: string;
        role: "user" | "assistant" | "system";
        content: string;

        // Extended attributes for multi-part / personality
        personality?: "Agent" | "Subagent" | "Critic";
        personalityName?: string; // e.g. "BrowserTool"

        parts?: MessagePart[]; // For structured responses
    }

    export interface MessagePart {
        type: "content" | "reasoning" | "tool_call" | "tool_result";
        text?: string;
        toolName?: string;
        toolArgs?: any;
        toolResult?: any;
        isCollapsed?: boolean; // UI state
    }

    interface Props {
        messages: Writable<Message[]>;
        isLoading: Writable<boolean>;
        onSendMessage: (text: string) => void;
    }

    let { messages, isLoading, onSendMessage }: Props = $props();

    // --- State ---
    let inputText = $state("");
    let messageContainer: HTMLDivElement;

    // --- Actions ---
    function handleSubmit() {
        if (!inputText.trim()) return;
        onSendMessage(inputText);
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

    function getAvatarColor(role: string, personality?: string): string {
        // We will handle specific personality overrides if needed later,
        // for now let's rely on base theme classes or return specific classes if requested.
        // But user said: "use primary and secondary for the chat items at first"
        // Let's stick to standard classes in the template.
        return "";
    }
</script>

<div
    class="ls-bg-primary ls-text-primary flex flex-col w-full text-sm ls-border border"
    style="height: 70vh; max-height: 90vh; min-height: 300px; resize: vertical; overflow: auto;"
>
    <!-- Message List -->
    <div
        bind:this={messageContainer}
        class="flex-1 overflow-y-auto p-4 space-y-4"
        style="min-height: 0;"
    >
        {#each $messages as msg, mIndex (msg.id)}
            <div
                class="flex flex-col gap-1 {msg.role === 'user'
                    ? 'items-end'
                    : 'items-start'}"
            >
                <!-- Avatar / Sender Name -->
                <div
                    class="flex items-center gap-2 opacity-70 text-xs ls-text-secondary"
                >
                    <div
                        class="w-4 h-4 rounded-full {msg.role === 'user'
                            ? 'ls-bg-secondary'
                            : 'ls-bg-accent'}"
                    ></div>
                    <span class="font-bold"
                        >{msg.personalityName ||
                            (msg.role === "user" ? "You" : "AI")}</span
                    >
                </div>

                <!-- Bubble -->
                <div
                    class="
                    max-w-[90%] rounded-lg p-3 shadow-sm border ls-border
                    {msg.role === 'user'
                        ? 'ls-bg-secondary ls-text-primary'
                        : 'ls-bg-accent'}
                "
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
                                <div class="mb-2 border-l-2 ls-border pl-2">
                                    <button
                                        class="text-xs ls-text-secondary font-medium flex items-center hover:underline focus:outline-none"
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
                                            class="text-xs ls-text-secondary italic mt-1 animate-fadeIn"
                                        >
                                            {part.text}
                                        </div>
                                    {/if}
                                </div>

                                <!-- Tool Call Block -->
                            {:else if part.type === "tool_call"}
                                <div
                                    class="mb-2 border ls-border ls-bg-secondary rounded p-2 text-xs"
                                >
                                    <button
                                        type="button"
                                        class="flex justify-between items-center cursor-pointer font-mono w-full text-left focus:outline-none ls-text-link"
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
                                            class="mt-2 overflow-x-auto p-1 rounded border ls-border ls-bg-primary ls-text-primary">{JSON.stringify(
                                                part.toolArgs,
                                                null,
                                                2,
                                            )}</pre>
                                    {/if}
                                </div>

                                <!-- Tool Result Block (Optional if we show it) -->

                                <!-- Standard Content -->
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
            <div class="flex items-center gap-2 ls-text-secondary text-xs p-2">
                <div class="animate-pulse">Writing...</div>
            </div>
        {/if}
    </div>

    <!-- Input Area -->
    <div class="p-3 border-t ls-border ls-bg-secondary">
        <div class="relative rounded-md shadow-sm">
            <textarea
                class="block w-full rounded-md border ls-border ls-bg-primary ls-text-primary p-2 text-sm focus:border-ring focus:ring-ring resize-none"
                rows="2"
                placeholder="Ask anything..."
                bind:value={inputText}
                onkeydown={handleKeydown}
            ></textarea>
            <button
                class="absolute bottom-2 right-2 p-1 ls-text-link hover:ls-bg-secondary rounded"
                onclick={handleSubmit}
                title="Send"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-5 w-5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                >
                    <path
                        d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"
                    />
                </svg>
            </button>
        </div>
    </div>
</div>

<style>
    /* basic markdown styles reset/shim */
    .markdown-body :global(h1),
    .markdown-body :global(h2) {
        font-weight: 600;
        margin-bottom: 0.5rem;
        margin-top: 1rem;
        color: inherit;
    }
    .markdown-body :global(p) {
        margin-bottom: 0.5rem;
        line-height: 1.5;
        color: inherit;
    }
    .markdown-body :global(a) {
        color: var(--ls-link-text-color);
        text-decoration: underline;
    }
    .markdown-body :global(pre) {
        background: var(--ls-secondary-background-color);
        color: var(--ls-primary-text-color);
        padding: 0.5rem;
        border-radius: 0.25rem;
        overflow-x: auto;
        font-family: monospace;
        font-size: 0.9em;
    }
    .markdown-body :global(code) {
        background: var(--ls-secondary-background-color);
        color: var(--ls-primary-text-color);
        padding: 0.1rem 0.3rem;
        border-radius: 0.2rem;
        font-family: monospace;
        font-size: 0.9em;
    }
    .markdown-body :global(ul) {
        list-style-type: disc;
        padding-left: 1.25rem;
        margin-bottom: 0.5rem;
    }

    .animate-fadeIn {
        animation: fadeIn 0.3s ease-in;
    }
    @keyframes fadeIn {
        from {
            opacity: 0;
        }
        to {
            opacity: 1;
        }
    }
</style>
