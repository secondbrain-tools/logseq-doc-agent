<script lang="ts">
    import { slide } from "svelte/transition";
    import { marked } from "marked";
    import type { Message, MessagePart } from "../../../domain/chat/types";

    interface Props {
        msg: Message;
        onToggleCollapse: (partIndex: number) => void;
        onContextMenu: (e: MouseEvent, msg: Message) => void;
    }

    let { msg, onToggleCollapse, onContextMenu }: Props = $props();

    // --- Helpers ---
    function renderMarkdown(text: string): string {
        try {
            return marked.parse(text) as string;
        } catch (e) {
            console.error("Markdown parse error", e);
            return text;
        }
    }

    function findToolResult(
        message: Message,
        toolCallId: string | undefined,
    ): MessagePart | undefined {
        if (!toolCallId || !message.parts) return undefined;
        return message.parts.find(
            (p) => p.type === "tool_result" && p.toolCallId === toolCallId,
        );
    }

    let isThinking = $derived(
        msg.role === "assistant" &&
            (!msg.parts || msg.parts.length === 0) &&
            !msg.content,
    );
</script>

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
            >{msg.personalityName || (msg.role === "user" ? "You" : "AI")}</span
        >
    </div>

    <!-- Bubble -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- Bubble -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    {#if !isThinking}
        <div
            class="lda-bubble {msg.role === 'user'
                ? 'ls-bg-user'
                : 'ls-bg-agent'}"
            oncontextmenu={(e) => onContextMenu(e, msg)}
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
                                onclick={() => onToggleCollapse(pIndex)}
                            >
                                <span class="mr-1"
                                    >{part.isCollapsed ? "▶" : "▼"}</span
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
                                onclick={() => onToggleCollapse(pIndex)}
                                aria-expanded={!isCollapsed}
                            >
                                <div class="flex items-center gap-2 font-mono">
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
                                <div class="font-bold text-lg leading-none">
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
                                        <div class="italic opacity-50 mt-1">
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
                                    {part.contextContent || part.text || ""}
                                </div>
                            </details>
                        </div>
                    {/if}
                {/each}
            {/if}
        </div>
    {/if}
</div>
