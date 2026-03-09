<script lang="ts">
    import { slide } from "svelte/transition";
    import { marked } from "marked";
    marked.use({ breaks: true });
    import type { Message, MessagePart } from "../../../domain/chat/types";
    import {
        buildDisplayItems,
        findToolResult,
        getToolSummary,
        type ToolSubGroup,
    } from "./message-bubble.utils";
    import { clickHandler } from "../../util/actions";

    interface Props {
        msg: Message;
        onToggleCollapse: (partIndex: number) => void;
        onContextMenu: (e: MouseEvent, msg: Message) => void;
    }

    let { msg, onToggleCollapse, onContextMenu }: Props = $props();

    // --- Helpers ---
    /** Normalize tabs to spaces so marked parses nested lists reliably (marked#3126). */
    function normalizeListIndent(text: string): string {
        return text.replace(/\t/g, '  ');
    }
    function renderMarkdown(text: string): string {
        try {
            return marked.parse(normalizeListIndent(text)) as string;
        } catch (e) {
            console.warn("Markdown parse error", e);
            return text;
        }
    }

    let displayItems = $derived(buildDisplayItems(msg));

    // Local state for groups (keyed by index of first item or unique key)
    let groupStates = $state<Record<string, boolean>>({}); // key -> isExpanded

    function toggleGroup(key: string | number) {
        const k = String(key);
        groupStates[k] = !groupStates[k];
    }

    let isThinking = $derived(
        msg.role === "assistant" &&
            (!msg.parts || msg.parts.length === 0) &&
            !msg.content,
    );
</script>

{#snippet ToolCallSnippet(
    part: MessagePart,
    pIndex: number,
    resultPart: MessagePart | undefined,
    isCollapsed: boolean,
)}
    {@const summary = getToolSummary(part, resultPart)}
    <div
        class="mb-2 border rounded text-xs lda-tool-call"
        style="background: var(--ls-secondary-background-color); border-color: var(--ls-border-color); width: 100%; max-width: min(16rem, 100%);"
    >
        <!-- Header -->
        <button
            type="button"
            class="flex justify-between items-center w-full p-2 cursor-pointer focus:outline-none hover:opacity-80 transition-opacity gap-3"
            style="background: none; border: none; color: var(--ls-primary-text-color); text-align: left;"
            use:clickHandler={() => onToggleCollapse(pIndex)}
            aria-expanded={!isCollapsed}
        >
            <div class="flex items-center gap-2 font-mono overflow-hidden">
                <span>🔨</span>
                <div class="flex items-baseline gap-2 overflow-hidden">
                    <span class="font-bold whitespace-nowrap"
                        >{part.toolName}</span
                    >
                    {#if summary}
                        <span
                            class="opacity-60 truncate font-normal text-[10px]"
                            >{summary}</span
                        >
                    {/if}
                </div>
                {#if resultPart}
                    <span
                        class="text-green-500 flex-shrink-0"
                        style="color: var(--ls-success-text-color, green);"
                        >✔</span
                    >
                {/if}
            </div>
            <div class="font-bold text-lg leading-none ml-auto pl-2">
                {isCollapsed ? "+" : "−"}
            </div>
        </button>

        <!-- Expanded Content -->
        {#if !isCollapsed}
            <div
                class="p-2 border-t lda-animate-fadeIn"
                style="border-color: var(--ls-border-color);"
            >
                {#if part.toolArgs}
                    <div class="mb-2">
                        <div class="font-semibold mb-1 opacity-70">
                            Parameters:
                        </div>
                        <pre
                            class="overflow-x-auto p-2 rounded border custom-scrollbar"
                            style="background: var(--ls-primary-background-color); border-color: var(--ls-border-color); color: var(--ls-primary-text-color); max-height: 200px;">{JSON.stringify(
                                part.toolArgs,
                                null,
                                2,
                            )}</pre>
                    </div>
                {/if}
                {#if resultPart}
                    <div class="mt-2">
                        <div class="font-semibold mb-1 opacity-70">Result:</div>
                        <pre
                            class="overflow-x-auto p-2 rounded border custom-scrollbar"
                            style="background: var(--ls-tertiary-background-color, #f5f5f5); border-color: var(--ls-border-color); color: var(--ls-primary-text-color); max-height: 200px;">{typeof resultPart.toolResult ===
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
{/snippet}

<div class="lda-message-row {msg.role}">
    <!-- Avatar / Sender Name -->
    <div class="lda-message-meta">
        <div
            class="lda-avatar {msg.role === 'user'
                ? 'ls-accent-user'
                : 'ls-accent-agent'}"
            style="background-color: {msg.role === 'user'
                ? 'var(--ls-link-text-color)'
                : 'var(--ls-secondary-text-color)'};"
        ></div>
        <span class="font-bold"
            >{msg.personalityName || (msg.role === "user" ? "You" : "AI")}</span
        >
    </div>

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
                {#each displayItems as item}
                    {#if item.type === "part"}
                        <!-- Render Single Part -->
                        {@const part = item.part}
                        {@const pIndex = item.index}

                        {#if part.type === "reasoning"}
                            <div
                                class="mb-2 pl-2"
                                style="border-color: var(--ls-border-color);"
                            >
                                <button
                                    class="text-xs font-medium flex items-center hover:underline focus:outline-none"
                                    style="color: var(--ls-secondary-text-color); background: none; border: none; cursor: pointer;"
                                    use:clickHandler={() => onToggleCollapse(pIndex)}
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
                        {:else if part.type === "tool_call"}
                            {@const resultPart = findToolResult(
                                msg,
                                part.toolCallId,
                            )}
                            {@const isCollapsed = part.isCollapsed ?? true}
                            {@render ToolCallSnippet(
                                part,
                                pIndex,
                                resultPart,
                                isCollapsed,
                            )}
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
                        {:else if part.type === "prompt"}
                            <span class="lda-prompt-bubble-tag">
                                <span class="lda-prompt-bubble-icon">✨</span>
                                <span class="lda-prompt-bubble-name">{part.promptName}</span>
                            </span>
                        {/if}
                    {:else if item.type === "tool_group"}
                        {@const groupKey = item.subgroups[0].parts[0].index}
                        {@const isMulti = item.subgroups.length > 1}

                        {#snippet ToolGroupCard(
                            subgroup: ToolSubGroup,
                            key: string | number,
                        )}
                            {@const isGroupExpanded =
                                groupStates[String(key)] ?? false}
                            <div
                                class="mb-2 relative"
                                style="width: fit-content; max-width: min(16rem, 100%);"
                            >
                                <!-- Stack effect layers -->
                                {#if !isGroupExpanded}
                                    <div
                                        class="absolute top-1 left-1 w-full h-full rounded border"
                                        style="background: var(--ls-secondary-background-color); border-color: var(--ls-border-color); opacity: 0.5; z-index: 0;"
                                    ></div>
                                {/if}

                                <button
                                    class="flex items-center gap-2 p-2 rounded border text-xs cursor-pointer hover:bg-opacity-80 transition hover:shadow-sm relative z-10"
                                    style="background: var(--ls-secondary-background-color); border-color: var(--ls-border-color); color: var(--ls-primary-text-color); width: 100%; min-width: 0;"
                                    use:clickHandler={() => toggleGroup(key)}
                                >
                                    <span class="font-mono">🔨</span>
                                    <span class="font-bold flex-1 text-left"
                                        >{subgroup.label}</span
                                    >
                                    <span
                                        class="text-[10px] transform transition-transform {isGroupExpanded
                                            ? 'rotate-180'
                                            : ''}">▼</span
                                    >
                                </button>

                                {#if isGroupExpanded}
                                    <div
                                        class="pl-4 mt-2 border-l-2 flex flex-col gap-2 lda-animate-fadeIn"
                                        style="border-color: var(--ls-border-color);"
                                    >
                                        {#each subgroup.parts as p}
                                            {@const part = p.part}
                                            {@const isCollapsed =
                                                part.isCollapsed ?? true}
                                            {@render ToolCallSnippet(
                                                part,
                                                p.index,
                                                p.result,
                                                isCollapsed,
                                            )}
                                        {/each}
                                    </div>
                                {/if}
                            </div>
                        {/snippet}

                        {#if isMulti}
                            {@const isExpanded =
                                groupStates[String(groupKey)] ?? false}
                            <div class="mb-2 pl-2">
                                <button
                                    class="text-xs font-medium flex items-center hover:underline focus:outline-none"
                                    style="color: var(--ls-secondary-text-color); background: none; border: none; cursor: pointer;"
                                    use:clickHandler={() => toggleGroup(groupKey)}
                                >
                                    <span class="mr-1"
                                        >{isExpanded ? "▼" : "▶"}</span
                                    >
                                    {item.label}
                                </button>
                                {#if isExpanded}
                                    <div
                                        class="pl-2 mt-2 flex flex-col gap-2 lda-animate-fadeIn"
                                    >
                                        {#each item.subgroups as subgroup, subIndex}
                                            {@render ToolGroupCard(
                                                subgroup,
                                                `${groupKey}_${subIndex}`,
                                            )}
                                        {/each}
                                    </div>
                                {/if}
                            </div>
                        {:else}
                            {@render ToolGroupCard(item.subgroups[0], groupKey)}
                        {/if}
                    {/if}
                {/each}
            {/if}
        </div>
    {/if}
</div>
