<script lang="ts">
    import { onMount } from "svelte";
    import * as Diff from "diff";

    let {
        originalContent = "",
        modifiedContent = "",
        canToggle = false,
        isExpanded = true,
        onToggle = (recursive: boolean) => {},
        onLineMerge = (content: string, type: "added" | "removed") => {},
    }: {
        originalContent?: string;
        modifiedContent?: string;
        canToggle?: boolean;
        isExpanded?: boolean;
        onToggle?: (recursive: boolean) => void;
        onLineMerge?: (content: string, type: "added" | "removed") => void;
    } = $props();

    type DiffLine = {
        content: string;
        type: "common" | "added" | "removed";
        originalLineNumber?: number;
        newLineNumber?: number;
    };
    let diffLines: DiffLine[] = $state([]);

    function calculateDiff() {
        if (!originalContent && !modifiedContent) return;

        const oldText = originalContent || "";
        const newText = modifiedContent || "";

        const changes = Diff.diffLines(oldText, newText, {
            newlineIsToken: false,
        });

        let lines: DiffLine[] = [];
        let oldCounter = 1;
        let newCounter = 1;

        changes.forEach((part) => {
            const partLines = part.value.split("\n");
            if (
                partLines.length > 0 &&
                partLines[partLines.length - 1] === ""
            ) {
                partLines.pop();
            }

            if (part.added) {
                partLines.forEach((line) => {
                    lines.push({
                        content: line,
                        type: "added",
                        newLineNumber: newCounter++,
                        // No original line number for added lines
                    });
                });
            } else if (part.removed) {
                partLines.forEach((line) => {
                    lines.push({
                        content: line,
                        type: "removed",
                        originalLineNumber: oldCounter++,
                        // No new line number for removed lines
                    });
                });
            } else {
                partLines.forEach((line) => {
                    lines.push({
                        content: line,
                        type: "common",
                        originalLineNumber: oldCounter++,
                        newLineNumber: newCounter++,
                    });
                });
            }
        });

        diffLines = lines;
    }

    $effect(() => {
        const _ = originalContent + modifiedContent;
        calculateDiff();
    });

    onMount(() => {
        calculateDiff();
    });

    function manualClick(node: HTMLElement, fn: (recursive: boolean) => void) {
        const handler = (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            console.log("[InlineDiff] Toggle clicked via manual handler");
            fn(e.shiftKey);
        };
        node.addEventListener("click", handler);
        return {
            destroy() {
                node.removeEventListener("click", handler);
            },
        };
    }

    function lineActionClick(node: HTMLElement, fn: () => void) {
        console.log("[InlineDiff] lineActionClick action bounds");
        const handler = (e: MouseEvent) => {
            console.log("[InlineDiff] Button clicked!", e);
            e.preventDefault();
            e.stopPropagation();
            fn();
        };
        node.addEventListener("click", handler);
        return {
            destroy() {
                node.removeEventListener("click", handler);
            },
        };
    }
</script>

<div class="diff-viewer">
    <div class="diff-body">
        {#each isExpanded ? diffLines : diffLines.slice(0, 1) as line, i}
            <div class="diff-line type-{line.type}">
                <div class="gutter">
                    {#if i === 0 && canToggle}
                        <!-- svelte-ignore a11y_click_events_have_key_events -->
                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                        <div
                            class="toggle-btn"
                            use:manualClick={onToggle}
                            role="button"
                            tabindex="0"
                        >
                            {isExpanded ? "▼" : "▶"}
                        </div>
                    {/if}
                    <span class="line-num old"
                        >{line.originalLineNumber || ""}</span
                    >
                    <span class="line-num new">{line.newLineNumber || ""}</span>
                </div>
                <div class="line-content">
                    <span class="marker">
                        {line.type === "added"
                            ? "+"
                            : line.type === "removed"
                              ? "-"
                              : "\u00A0"}
                    </span>
                    <span class="text">{line.content}</span>
                    {#if line.type !== "common"}
                        <button
                            class="line-btn"
                            title={line.type === "added"
                                ? "Add Line"
                                : "Restore Line"}
                            use:lineActionClick={() => {
                                console.log(
                                    "[InlineDiff] Click caught via action",
                                );
                                onLineMerge?.(
                                    line.content,
                                    line.type as "added" | "removed",
                                );
                            }}
                        >
                            {line.type === "added" ? "+" : "\u21A9"}
                        </button>
                    {/if}
                </div>
            </div>
        {/each}
    </div>
</div>

<style>
    /* ... [Previous Styles] ... */
    .diff-viewer {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        border: 1px solid var(--ls-border-color);
        border-radius: 4px;
        background: var(--ls-primary-background-color);
        font-family: "Monaco", "Menlo", "Ubuntu Mono", "Consolas", monospace;
        font-size: 13px;
        overflow: hidden;
    }

    .diff-body {
        overflow-y: auto;
        flex: 1;
        padding-bottom: 20px;
    }

    .diff-line {
        display: flex;
        min-height: 20px;
        line-height: 20px;
    }

    .gutter {
        display: flex;
        width: 80px; /* Two columns of line numbers */
        background: var(--ls-secondary-background-color);
        border-right: 1px solid var(--ls-border-color);
        color: var(--ls-tertiary-text-color);
        user-select: none;
        flex-shrink: 0;
        position: relative; /* For toggle positioning */
    }

    .toggle-btn {
        position: absolute;
        left: 2px;
        top: 0;
        bottom: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        color: var(--ls-secondary-text-color);
        font-size: 10px;
        width: 16px; /* Space for click */
        z-index: 10;
    }
    .toggle-btn:hover {
        color: var(--ls-primary-text-color);
        font-weight: bold;
    }

    .line-num {
        flex: 1;
        text-align: right;
        padding-right: 4px;
        font-size: 11px;
    }
    .line-num.old {
        border-right: 1px solid var(--ls-border-color);
    }

    .line-content {
        flex: 1;
        padding: 0 4px;
        white-space: pre-wrap;
        word-break: break-all;
        color: var(--ls-primary-text-color);
        display: flex;
        user-select: text; /* Ensure text is selectable */
        align-items: center; /* Align button/marker/text */
    }

    .text {
        flex: 1;
        margin-right: 8px;
    }

    .line-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
        font-size: 12px;
        line-height: 1;
        border: 1px solid var(--ls-border-color);
        background: var(--ls-secondary-background-color);
        color: var(--ls-secondary-text-color);
        cursor: pointer;
        /* No margin-right needed if on right side */
        border-radius: 2px;
        padding: 0;
        flex-shrink: 0;
    }

    .line-btn:hover {
        background: var(--ls-tertiary-background-color);
        color: var(--ls-primary-text-color);
    }

    .line-btn:active {
        background: var(--ls-link-text-color);
        color: white;
    }

    .marker {
        display: inline-block;
        width: 15px;
        text-align: center;
        color: var(--ls-tertiary-text-color);
        user-select: none;
        margin-right: 4px;
    }
    /* Colors ... */
    .type-added {
        background-color: rgba(0, 255, 0, 0.15);
    }
    .type-added .marker {
        color: green;
    }

    .type-removed {
        background-color: rgba(255, 0, 0, 0.15);
    }
    .type-removed .marker {
        color: red;
    }
</style>
