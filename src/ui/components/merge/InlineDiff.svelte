<script lang="ts">
    import { onMount } from "svelte";
    import * as Diff from "diff";

    let {
        originalContent = "",
        modifiedContent = "",
    }: { originalContent?: string; modifiedContent?: string } = $props();

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
</script>

<div class="diff-viewer">
    <div class="diff-body">
        {#each diffLines as line}
            <div class="diff-line type-{line.type}">
                <div class="gutter">
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
                    {line.content}
                </div>
            </div>
        {/each}
    </div>
</div>

<style>
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
    }

    .marker {
        display: inline-block;
        width: 15px;
        text-align: center;
        color: var(--ls-tertiary-text-color);
        user-select: none;
        margin-right: 4px;
    }

    /* Colors */
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
