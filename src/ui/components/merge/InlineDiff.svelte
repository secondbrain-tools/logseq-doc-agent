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

    // Thresholds for intra-line highlighting
    const SIMILARITY_THRESHOLD = 0.6; // Treat as modified if similarity >= this
    const CHANGE_RATIO_THRESHOLD = 0.5; // Show intra-line if change ratio <= this
    const MAX_LENGTH_THRESHOLD = 300; // Skip intra-line for very long lines

    type IntraLinePart = {
        text: string;
        type: "common" | "added" | "removed";
    };

    type DiffLine = {
        content: string;
        type: "common" | "added" | "removed" | "modified-old" | "modified-new";
        originalLineNumber?: number;
        newLineNumber?: number;
        intraLineParts?: IntraLinePart[];
    };
    let diffLines: DiffLine[] = $state([]);

    // Levenshtein distance for similarity calculation
    function levenshteinDistance(a: string, b: string): number {
        if (a.length === 0) return b.length;
        if (b.length === 0) return a.length;

        const matrix: number[][] = [];
        for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1,
                    );
                }
            }
        }
        return matrix[b.length][a.length];
    }

    function similarity(a: string, b: string): number {
        const maxLen = Math.max(a.length, b.length);
        if (maxLen === 0) return 1;
        return 1 - levenshteinDistance(a, b) / maxLen;
    }

    // Compute intra-line diff parts
    function computeIntraLineParts(
        oldLine: string,
        newLine: string,
    ): { oldParts: IntraLinePart[]; newParts: IntraLinePart[] } {
        const wordDiff = Diff.diffWordsWithSpace(oldLine, newLine);
        const oldParts: IntraLinePart[] = [];
        const newParts: IntraLinePart[] = [];

        for (const part of wordDiff) {
            if (part.added) {
                newParts.push({ text: part.value, type: "added" });
            } else if (part.removed) {
                oldParts.push({ text: part.value, type: "removed" });
            } else {
                oldParts.push({ text: part.value, type: "common" });
                newParts.push({ text: part.value, type: "common" });
            }
        }

        return { oldParts, newParts };
    }

    // Check if intra-line highlighting is worth showing
    function shouldShowIntraLine(
        oldLine: string,
        newLine: string,
        parts: { oldParts: IntraLinePart[]; newParts: IntraLinePart[] },
    ): boolean {
        const maxLen = Math.max(oldLine.length, newLine.length);

        // Skip if line is too long
        if (maxLen > MAX_LENGTH_THRESHOLD) return false;

        // Calculate change ratio
        let changedChars = 0;
        for (const part of parts.oldParts) {
            if (part.type === "removed") changedChars += part.text.length;
        }
        for (const part of parts.newParts) {
            if (part.type === "added") changedChars += part.text.length;
        }

        const changeRatio = changedChars / (2 * maxLen); // Normalize by both lines
        return changeRatio <= CHANGE_RATIO_THRESHOLD;
    }

    function calculateDiff() {
        if (!originalContent && !modifiedContent) return;

        const oldText = originalContent || "";
        const newText = modifiedContent || "";

        const changes = Diff.diffLines(oldText, newText, {
            newlineIsToken: false,
        });

        // Step A: Collect raw line changes
        type RawLine = {
            content: string;
            type: "common" | "added" | "removed";
        };
        const rawLines: RawLine[] = [];

        changes.forEach((part) => {
            const partLines = part.value.split("\n");
            if (
                partLines.length > 0 &&
                partLines[partLines.length - 1] === ""
            ) {
                partLines.pop();
            }

            const type: RawLine["type"] = part.added
                ? "added"
                : part.removed
                  ? "removed"
                  : "common";
            partLines.forEach((line) => {
                rawLines.push({ content: line, type });
            });
        });

        // Step B: Detect replacement blocks and pair lines
        let lines: DiffLine[] = [];
        let oldCounter = 1;
        let newCounter = 1;
        let i = 0;

        while (i < rawLines.length) {
            const current = rawLines[i];

            if (current.type === "common") {
                lines.push({
                    content: current.content,
                    type: "common",
                    originalLineNumber: oldCounter++,
                    newLineNumber: newCounter++,
                });
                i++;
            } else if (current.type === "removed") {
                // Collect consecutive removed lines
                const removedLines: string[] = [];
                let j = i;
                while (j < rawLines.length && rawLines[j].type === "removed") {
                    removedLines.push(rawLines[j].content);
                    j++;
                }

                // Collect consecutive added lines that follow
                const addedLines: string[] = [];
                while (j < rawLines.length && rawLines[j].type === "added") {
                    addedLines.push(rawLines[j].content);
                    j++;
                }

                // If we have both removed and added, it's a replacement block
                if (removedLines.length > 0 && addedLines.length > 0) {
                    // Pair lines by index and similarity
                    const maxPairs = Math.min(
                        removedLines.length,
                        addedLines.length,
                    );

                    for (let k = 0; k < maxPairs; k++) {
                        const oldLine = removedLines[k];
                        const newLine = addedLines[k];
                        const sim = similarity(oldLine, newLine);

                        if (sim >= SIMILARITY_THRESHOLD) {
                            // Treat as modified - compute intra-line diff
                            const parts = computeIntraLineParts(
                                oldLine,
                                newLine,
                            );
                            const showIntraLine = shouldShowIntraLine(
                                oldLine,
                                newLine,
                                parts,
                            );

                            if (showIntraLine) {
                                // Show as modified lines with intra-line highlighting
                                lines.push({
                                    content: oldLine,
                                    type: "modified-old",
                                    originalLineNumber: oldCounter++,
                                    intraLineParts: parts.oldParts,
                                });
                                lines.push({
                                    content: newLine,
                                    type: "modified-new",
                                    newLineNumber: newCounter++,
                                    intraLineParts: parts.newParts,
                                });
                            } else {
                                // Change too significant - show as separate removed/added
                                lines.push({
                                    content: oldLine,
                                    type: "removed",
                                    originalLineNumber: oldCounter++,
                                });
                                lines.push({
                                    content: newLine,
                                    type: "added",
                                    newLineNumber: newCounter++,
                                });
                            }
                        } else {
                            // Low similarity - show as separate removed/added
                            lines.push({
                                content: oldLine,
                                type: "removed",
                                originalLineNumber: oldCounter++,
                            });
                            lines.push({
                                content: newLine,
                                type: "added",
                                newLineNumber: newCounter++,
                            });
                        }
                    }

                    // Handle remaining unpaired removed lines
                    for (let k = maxPairs; k < removedLines.length; k++) {
                        lines.push({
                            content: removedLines[k],
                            type: "removed",
                            originalLineNumber: oldCounter++,
                        });
                    }

                    // Handle remaining unpaired added lines
                    for (let k = maxPairs; k < addedLines.length; k++) {
                        lines.push({
                            content: addedLines[k],
                            type: "added",
                            newLineNumber: newCounter++,
                        });
                    }
                } else {
                    // Pure removed lines (no following added)
                    for (const line of removedLines) {
                        lines.push({
                            content: line,
                            type: "removed",
                            originalLineNumber: oldCounter++,
                        });
                    }
                    // Pure added lines (no preceding removed)
                    for (const line of addedLines) {
                        lines.push({
                            content: line,
                            type: "added",
                            newLineNumber: newCounter++,
                        });
                    }
                }

                i = j;
            } else if (current.type === "added") {
                // Pure added line (not part of a replacement block)
                lines.push({
                    content: current.content,
                    type: "added",
                    newLineNumber: newCounter++,
                });
                i++;
            }
        }

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

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    class="diff-viewer"
    draggable="false"
    ondragstart={(e) => e.preventDefault()}
>
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
                        {line.type === "added" || line.type === "modified-new"
                            ? "+"
                            : line.type === "removed" ||
                                line.type === "modified-old"
                              ? "-"
                              : "\u00A0"}
                    </span>
                    <span class="text">
                        {#if line.intraLineParts && line.intraLineParts.length > 0}
                            {#each line.intraLineParts as part}
                                <span class="intra-{part.type}"
                                    >{part.text}</span
                                >
                            {/each}
                        {:else}
                            {line.content}
                        {/if}
                    </span>
                    {#if line.type !== "common"}
                        <button
                            class="line-btn"
                            title={line.type === "added" ||
                            line.type === "modified-new"
                                ? "Add Line"
                                : "Restore Line"}
                            use:lineActionClick={() => {
                                console.log(
                                    "[InlineDiff] Click caught via action",
                                );
                                const mergeType =
                                    line.type === "added" ||
                                    line.type === "modified-new"
                                        ? "added"
                                        : "removed";
                                onLineMerge?.(line.content, mergeType);
                            }}
                        >
                            {line.type === "added" ||
                            line.type === "modified-new"
                                ? "+"
                                : "\u21A9"}
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
        cursor: text; /* Show text selection cursor */
        align-items: center; /* Align button/marker/text */
    }

    .text {
        flex: 1;
        margin-right: 8px;
        cursor: text; /* Show text selection cursor */
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

    /* Modified lines (with intra-line highlighting) */
    .type-modified-old {
        background-color: rgba(255, 200, 200, 0.2);
    }
    .type-modified-old .marker {
        color: #c00;
    }

    .type-modified-new {
        background-color: rgba(200, 255, 200, 0.2);
    }
    .type-modified-new .marker {
        color: #080;
    }

    /* Intra-line highlighting spans */
    .intra-removed {
        background-color: rgba(255, 100, 100, 0.35);
        border-radius: 2px;
        text-decoration: line-through;
        text-decoration-color: rgba(200, 0, 0, 0.5);
    }

    .intra-added {
        background-color: rgba(100, 255, 100, 0.35);
        border-radius: 2px;
    }

    /* Text selection styles - override parent styles that make selection invisible */
    .diff-viewer ::selection {
        background-color: rgba(0, 120, 215, 0.3);
        color: inherit;
    }
    .diff-viewer ::-moz-selection {
        background-color: rgba(0, 120, 215, 0.3);
        color: inherit;
    }
</style>
