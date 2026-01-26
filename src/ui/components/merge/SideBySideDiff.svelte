<script lang="ts">
    import { onMount } from "svelte";
    import * as Diff from "diff";

    let {
        originalContent = "",
        modifiedContent = "",
    }: { originalContent?: string; modifiedContent?: string } = $props();

    type DiffLine = {
        content: string;
        type: "common" | "added" | "removed" | "empty";
    };

    let leftLines: DiffLine[] = $state([]);
    let rightLines: DiffLine[] = $state([]);

    function calculateDiff() {
        if (!originalContent && !modifiedContent) return;

        // Ensure strings
        const oldText = originalContent || "";
        const newText = modifiedContent || "";

        // Use diffLines for line-by-line comparison
        // newlineIsToken: true ensures newlines are treated as tokens if needed, but usually default is fine.
        const changes = Diff.diffLines(oldText, newText, {
            newlineIsToken: false,
        });

        const left: DiffLine[] = [];
        const right: DiffLine[] = [];

        changes.forEach((part) => {
            // Split into lines, removing the last empty string if the part ends with newline (standard split behavior)
            // But we want to preserve line structure.
            let lines = part.value.split("\n");

            // diffLines usually includes the newline at the end of the line content.
            // If the last element is empty because of split, remove it, unless the value was just a newline?
            if (lines.length > 0 && lines[lines.length - 1] === "") {
                lines.pop();
            }

            if (part.added) {
                // Added: Show in Right (Green), Empty in Left
                lines.forEach((line) => {
                    right.push({ content: line, type: "added" });
                    left.push({ content: "", type: "empty" });
                });
            } else if (part.removed) {
                // Removed: Show in Left (Red), Empty in Right
                lines.forEach((line) => {
                    left.push({ content: line, type: "removed" });
                    right.push({ content: "", type: "empty" });
                });
            } else {
                // Common: Show in Both
                lines.forEach((line) => {
                    left.push({ content: line, type: "common" });
                    right.push({ content: line, type: "common" });
                });
            }
        });

        leftLines = left;
        rightLines = right;
    }

    $effect(() => {
        // Recalculate if props change
        // Access props to trigger dependency
        const _ = originalContent + modifiedContent;
        calculateDiff();
    });

    onMount(() => {
        calculateDiff();
    });
</script>

<div class="diff-viewer">
    <div class="diff-header">
        <div class="header-panel">Original Text</div>
        <div class="header-panel">New Text</div>
    </div>
    <div class="diff-body">
        <div class="diff-column left-column">
            {#each leftLines as line, i}
                <div class="diff-line type-{line.type}">
                    <span class="line-number">{i + 1}</span>
                    <span class="line-content">{line.content || "\u00A0"}</span>
                </div>
            {/each}
        </div>
        <div class="diff-column right-column">
            {#each rightLines as line, i}
                <div class="diff-line type-{line.type}">
                    <span class="line-number">{i + 1}</span>
                    <span class="line-content">{line.content || "\u00A0"}</span>
                </div>
            {/each}
        </div>
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

    .diff-header {
        display: flex;
        background: var(--ls-secondary-background-color);
        border-bottom: 1px solid var(--ls-border-color);
        font-weight: 600;
        color: var(--ls-primary-text-color);
    }

    .header-panel {
        flex: 1;
        padding: 8px 12px;
        text-align: center;
        border-right: 1px solid var(--ls-border-color);
    }
    .header-panel:last-child {
        border-right: none;
    }

    .diff-body {
        display: flex;
        flex: 1;
        overflow-y: auto;
    }

    .diff-column {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-width: 0; /* Flex fix */
    }

    .left-column {
        border-right: 1px solid var(--ls-border-color);
    }

    .diff-line {
        display: flex;
        min-height: 20px; /* Line height */
        line-height: 20px;
        white-space: pre-wrap; /* Preserve spacing */
        word-break: break-all;
    }

    .line-number {
        width: 40px;
        text-align: right;
        padding-right: 8px;
        color: var(--ls-tertiary-text-color);
        user-select: none;
        background: var(--ls-secondary-background-color);
        border-right: 1px solid var(--ls-border-color);
        font-size: 11px;
    }

    .line-content {
        flex: 1;
        padding: 0 4px;
        color: var(--ls-primary-text-color);
    }

    /* Diff Types Styles */
    /* Left Column */
    .left-column .type-removed {
        background-color: rgba(255, 0, 0, 0.15);
    }
    .left-column .type-empty {
        background-color: rgba(0, 0, 0, 0.05); /* Greyed out placeholder */
    }

    /* Right Column */
    .right-column .type-added {
        background-color: rgba(0, 255, 0, 0.15);
    }
    .right-column .type-empty {
        background-color: rgba(0, 0, 0, 0.05);
    }
</style>
