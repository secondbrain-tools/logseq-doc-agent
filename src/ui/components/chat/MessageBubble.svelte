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

    function getToolSummary(part: MessagePart, result?: any): string {
        const args = part.toolArgs || {};
        const output =
            typeof result?.toolResult === "string"
                ? result.toolResult
                : JSON.stringify(result?.toolResult || "");
        // CHANGED: Increased truncation length to 50
        const truncate = (s: string) =>
            s.length > 50 ? s.slice(0, 50) + "…" : s;

        // Helper to extract quoted content from our new return messages
        const extractQuote = (s: string) => {
            const match = s.match(/"([^"]+)"/);
            return match ? match[1] : "";
        };

        switch (part.toolName) {
            case "addBlock":
            case "updateBlock":
                return args.content ? `"${truncate(args.content)}"` : "";

            case "deleteBlock":
                const delContent = extractQuote(output);
                return delContent
                    ? `"${truncate(delContent)}"`
                    : args.id
                      ? `#${args.id}`
                      : "";

            case "moveBlock":
                const movContent = extractQuote(output);
                return movContent
                    ? `"${truncate(movContent)}"`
                    : args.id
                      ? `#${args.id}`
                      : "";

            case "getBlock":
                let blockContent = output;
                try {
                    const parsed = JSON.parse(output);
                    if (parsed.content) blockContent = parsed.content;
                } catch {}
                // If it's just block content string
                if (output && !output.startsWith("{")) blockContent = output;
                return blockContent
                    ? `"${truncate(blockContent)}"`
                    : args.id
                      ? `#${args.id}`
                      : "";

            case "getLogseqDocument":
                return "current page";

            default:
                return "";
        }
    }

    // --- Grouping Logic ---
    type ToolGroup = {
        type: "tool_group";
        parts: { part: MessagePart; index: number; result?: MessagePart }[];
        collapsed: boolean;
        label: string;
    };

    type DisplayItem =
        | { type: "part"; part: MessagePart; index: number }
        | ToolGroup;

    let displayItems = $derived.by(() => {
        if (!msg.parts) return [];
        const items: DisplayItem[] = [];
        let currentGroup: {
            part: MessagePart;
            index: number;
            result?: MessagePart;
        }[] = [];

        for (let i = 0; i < msg.parts.length; i++) {
            const part = msg.parts[i];

            if (part.type === "tool_call") {
                const result = findToolResult(msg, part.toolCallId);
                currentGroup.push({ part, index: i, result });
            } else {
                // Flush group if exists
                if (currentGroup.length > 0) {
                    flushGroup(items, currentGroup);
                    currentGroup = [];
                }
                if (part.type !== "tool_result") {
                    // Hide standalone tool_results (handled in call)
                    items.push({ type: "part", part, index: i });
                }
            }
        }
        // Flush remaining
        if (currentGroup.length > 0) {
            flushGroup(items, currentGroup);
        }
        return items;
    });

    function flushGroup(
        items: DisplayItem[],
        group: { part: MessagePart; index: number; result?: MessagePart }[],
    ) {
        if (group.length === 1) {
            items.push({
                type: "part",
                part: group[0].part,
                index: group[0].index,
            });
            return;
        }

        const firstTool = group[0].part.toolName;
        const allSame = group.every((g) => g.part.toolName === firstTool);
        const label = allSame
            ? `${group.length} × ${firstTool}`
            : `${group.length} tools`;

        items.push({
            type: "tool_group",
            parts: group,
            collapsed: true,
            label,
        });
    }

    // Local state for groups (keyed by index of first item)
    let groupStates = $state<Record<number, boolean>>({}); // index -> isExpanded

    function toggleGroup(index: number) {
        groupStates[index] = !groupStates[index];
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
                        {:else if part.type === "tool_call"}
                            {@const resultPart = findToolResult(
                                msg,
                                part.toolCallId,
                            )}
                            {@const isCollapsed = part.isCollapsed ?? true}
                            {@const summary = getToolSummary(part, resultPart)}

                            <!-- Single Tool Call Card -->
                            <div
                                class="mb-2 border rounded text-xs lda-tool-call"
                                style="background: var(--ls-secondary-background-color); border-color: var(--ls-border-color); width: fit-content; max-width: 16rem;"
                            >
                                <!-- Header -->
                                <button
                                    type="button"
                                    class="flex justify-between items-center w-full p-2 cursor-pointer focus:outline-none hover:opacity-80 transition-opacity gap-3"
                                    style="background: none; border: none; color: var(--ls-primary-text-color); text-align: left;"
                                    onclick={() => onToggleCollapse(pIndex)}
                                    aria-expanded={!isCollapsed}
                                >
                                    <div
                                        class="flex items-center gap-2 font-mono overflow-hidden"
                                    >
                                        <span>🔨</span>
                                        <div
                                            class="flex items-baseline gap-2 overflow-hidden"
                                        >
                                            <span
                                                class="font-bold whitespace-nowrap"
                                                >{part.toolName}</span
                                            >
                                            {#if summary}
                                                <!-- CHANGED: text-[10px] for summary -->
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
                                    <div
                                        class="font-bold text-lg leading-none ml-auto pl-2"
                                    >
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
                                                <div
                                                    class="font-semibold mb-1 opacity-70"
                                                >
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
                                                <div
                                                    class="font-semibold mb-1 opacity-70"
                                                >
                                                    Result:
                                                </div>
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
                    {:else if item.type === "tool_group"}
                        {@const groupKey = item.parts[0].index}
                        {@const isGroupExpanded =
                            groupStates[groupKey] ?? false}

                        <!-- Tool Group Container -->
                        <!-- CHANGED: Refined styling for group 'stack' look -->
                        <div
                            class="mb-2 relative"
                            style="width: fit-content; max-width: 16rem;"
                        >
                            <!-- Stack effect layers (pseudoish) -->
                            {#if !isGroupExpanded}
                                <div
                                    class="absolute top-1 left-1 w-full h-full rounded border"
                                    style="background: var(--ls-secondary-background-color); border-color: var(--ls-border-color); opacity: 0.5; z-index: 0;"
                                ></div>
                            {/if}

                            <button
                                class="flex items-center gap-2 p-2 rounded border text-xs cursor-pointer hover:bg-opacity-80 transition hover:shadow-sm relative z-10"
                                style="background: var(--ls-secondary-background-color); border-color: var(--ls-border-color); color: var(--ls-primary-text-color); width: 100%; min-width: 10rem;"
                                onclick={() => toggleGroup(groupKey)}
                            >
                                <span class="font-mono">🔨</span>
                                <span class="font-bold flex-1 text-left"
                                    >{item.label}</span
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
                                    {#each item.parts as p}
                                        <!-- Render Individual Tool Call inside Group -->
                                        {@const part = p.part}
                                        {@const summary = getToolSummary(
                                            part,
                                            p.result,
                                        )}
                                        {@const isCollapsed =
                                            part.isCollapsed ?? true}

                                        <div
                                            class="border rounded text-xs lda-tool-call"
                                            style="background: var(--ls-secondary-background-color); border-color: var(--ls-border-color); width: fit-content; max-width: 16rem;"
                                        >
                                            <button
                                                type="button"
                                                class="flex justify-between items-center w-full p-2 cursor-pointer focus:outline-none hover:opacity-80 transition-opacity gap-3"
                                                style="background: none; border: none; color: var(--ls-primary-text-color); text-align: left;"
                                                onclick={() =>
                                                    onToggleCollapse(p.index)}
                                            >
                                                <div
                                                    class="flex items-center gap-2 font-mono overflow-hidden"
                                                >
                                                    <span>🔨</span>
                                                    <div
                                                        class="flex items-baseline gap-2 overflow-hidden"
                                                    >
                                                        <span
                                                            class="font-bold whitespace-nowrap"
                                                            >{part.toolName}</span
                                                        >
                                                        {#if summary}
                                                            <!-- CHANGED: text-[10px] for details -->
                                                            <span
                                                                class="opacity-60 truncate font-normal text-[10px]"
                                                                >{summary}</span
                                                            >
                                                        {/if}
                                                    </div>
                                                    {#if p.result}
                                                        <span
                                                            class="text-green-500"
                                                            style="color: var(--ls-success-text-color);"
                                                            >✔</span
                                                        >
                                                    {/if}
                                                </div>
                                                <div
                                                    class="font-bold text-lg leading-none ml-auto pl-2"
                                                >
                                                    {isCollapsed ? "+" : "−"}
                                                </div>
                                            </button>

                                            {#if !isCollapsed}
                                                <div
                                                    class="p-2 border-t lda-animate-fadeIn"
                                                    style="border-color: var(--ls-border-color);"
                                                >
                                                    {#if part.toolArgs}
                                                        <div class="mb-2">
                                                            <div
                                                                class="font-semibold mb-1 opacity-70"
                                                            >
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
                                                    {#if p.result}
                                                        <div class="mt-2">
                                                            <div
                                                                class="font-semibold mb-1 opacity-70"
                                                            >
                                                                Result:
                                                            </div>
                                                            <pre
                                                                class="overflow-x-auto p-2 rounded border custom-scrollbar"
                                                                style="background: var(--ls-tertiary-background-color, #f5f5f5); border-color: var(--ls-border-color); color: var(--ls-primary-text-color); max-height: 200px;">{typeof p
                                                                    .result
                                                                    .toolResult ===
                                                                "string"
                                                                    ? p.result
                                                                          .toolResult
                                                                    : JSON.stringify(
                                                                          p
                                                                              .result
                                                                              .toolResult,
                                                                          null,
                                                                          2,
                                                                      )}</pre>
                                                        </div>
                                                    {/if}
                                                </div>
                                            {/if}
                                        </div>
                                    {/each}
                                </div>
                            {/if}
                        </div>
                    {/if}
                {/each}
            {/if}
        </div>
    {/if}
</div>
