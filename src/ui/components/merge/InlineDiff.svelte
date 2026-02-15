<script lang="ts">
    import { onMount, tick, untrack } from "svelte";
    import * as Diff from "diff";
    import MergeControls from "./MergeControls.svelte";
    import {
        calculateDiffLines,
        generateContentFromDiff,
        getPartId,
        type DiffLine,
        type UnifiedPart,
        type IntraLinePart,
        type PartDecisions,
    } from "./diff-utils";

    let {
        originalContent = "",
        modifiedContent = "",
        canToggle = false,
        isExpanded = true,
        onToggle = (recursive: boolean) => {},
        onLineMerge = (content: string, type: "added" | "removed") => {},
        mode = "lines",
        onContentChange,
    }: {
        originalContent?: string;
        modifiedContent?: string;
        canToggle?: boolean;
        isExpanded?: boolean;
        onToggle?: (recursive: boolean) => void;
        onLineMerge?: (content: string, type: "added" | "removed") => void;
        mode?: "lines" | "words";
        onContentChange?: (newContent: string) => void;
    } = $props();

    let diffLines: DiffLine[] = $state([]);

    // State for Unified Mode Decisions
    // Key: part.id ("lineIndex-partIndex")
    // Value: "accept" (keep new/add) | "revert" (keep old/remove)
    let partDecisions = $state<PartDecisions>({});

    // Selection State
    let selectionToolbar = $state<{
        visible: boolean;
        x: number;
        y: number;
        selectedIds: string[]; // List of part IDs in the selection
    }>({
        visible: false,
        x: 0,
        y: 0,
        selectedIds: [],
    });

    let viewerRef: HTMLElement;

    function calculateDiff() {
        console.log("[InlineDiff] calculateDiff running", {
            originalLen: originalContent.length,
            modifiedLen: modifiedContent.length,
            mode,
        });
        const currentDecisions = untrack(() => partDecisions);
        const result = calculateDiffLines(
            originalContent,
            modifiedContent,
            mode,
            currentDecisions,
        );
        diffLines = result.diffLines;

        // Only update if decisions changed (deep check might be needed if loop persists)
        // For now logging result
        partDecisions = result.newDecisions;
    }

    // Effect to regenerate content when decisions change
    $effect(() => {
        // Trigger on partDecisions change
        if (onContentChange && mode === "words") {
            generateFinalContent();
        }
    });

    let lastEmittedContent = $state("");

    function generateFinalContent() {
        console.log("[InlineDiff] generateFinalContent running");
        const content = generateContentFromDiff(diffLines, partDecisions);

        // Prevent infinite loops/redundant updates
        // We track what we last emitted to avoid re-emitting the same string.
        // We DO NOT compare against modifiedContent in Unified mode because modifiedContent
        // might be the "Base/Proposal" which is static, while 'content' includes reverts.

        // Normalize for safety against newline issues
        const normalizedContent = content.replace(/\n$/, "");
        const normalizedLast = lastEmittedContent.replace(/\n$/, "");

        if (onContentChange && normalizedContent !== normalizedLast) {
            console.log(
                "[InlineDiff] Content changed from last emit, updating:",
                {
                    generated: content,
                    last: lastEmittedContent,
                    diffLines: diffLines.length,
                },
            );
            lastEmittedContent = content;
            onContentChange(content);
        } else {
            console.log(
                "[InlineDiff] Content matches last emit, skipping update",
            );
        }
    }

    function handleSelectionAction(action: "accept" | "revert") {
        const { selectedIds } = selectionToolbar;
        console.log("[InlineDiff] handleSelectionAction called", {
            action,
            selectedIds,
        });

        if (selectedIds.length === 0) {
            console.warn("[InlineDiff] No selected IDs to act on");
            return;
        }

        // Helper to find part type by ID
        const findPartType = (
            id: string,
        ): "added" | "removed" | "replacement" | "common" | null => {
            for (const line of diffLines) {
                if (line.id === id) return line.type as any; // Pure line
                if (line.unifiedParts) {
                    const part = line.unifiedParts.find((p) => p.id === id);
                    if (part) return part.type;
                }
            }
            return null;
        };

        // Apply decision to all selected parts
        const newDecisions = { ...partDecisions };
        for (const id of selectedIds) {
            const type = findPartType(id);
            if (!type) continue;

            if (action === "accept") {
                // "Check" button -> Keep Text
                if (type === "added" || type === "replacement") {
                    newDecisions[id] = "accept"; // Keep added text
                } else if (type === "removed") {
                    newDecisions[id] = "revert"; // Keep original text (reject removal)
                }
            } else {
                // "Cross" button -> Discard Text
                if (type === "added" || type === "replacement") {
                    newDecisions[id] = "revert"; // Discard added text
                } else if (type === "removed") {
                    newDecisions[id] = "accept"; // Discard original text (confirm removal)
                }
            }
        }
        partDecisions = newDecisions;

        console.log(
            "[InlineDiff] Updated decisions:",
            JSON.stringify(partDecisions),
        );

        // Hide toolbar
        selectionToolbar.visible = false;
        selectionToolbar.selectedIds = [];

        // Clear browser selection to give visual feedback that action is done
        const sel = window.getSelection();
        if (sel) sel.removeAllRanges();
    }

    function handlePartClick(e: MouseEvent, partId: string) {
        // If the user is selecting text (range not collapsed), ignore click (it's a selection end)
        // But the click event happens after mouseup.
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed) {
            return;
        }

        e.stopPropagation();

        console.log("[InlineDiff] Click part:", partId);

        const currentDecision = partDecisions[partId];
        // Toggle logic:
        // If current is 'accept' (default for added/replacement) -> 'revert'
        // If current is 'revert' -> 'accept'
        // Missing decision implies 'accept' for added/replacement, 'revert' for removed?
        // Actually for Added, default is Accepted. For Removed, default is Accepted (meaning removal accepted -> text gone).
        // Wait, if Removed part is "Accepted", it means we ACCEPT the REMOVAL -> Text is gone.
        // If Removed part is "Reverted", it means we REVERT the REMOVAL -> Text is restored.

        // Let's rely on current state map. If undefined, it acts as "accept" (change applied).

        const nextDecision = currentDecision === "revert" ? "accept" : "revert";

        console.log(
            "[InlineDiff] Toggling",
            partId,
            "from",
            currentDecision,
            "to",
            nextDecision,
        );
        console.log(
            "[InlineDiff] Current decisions before update:",
            JSON.stringify(partDecisions),
        );

        // Update
        const newDecisions = { ...partDecisions };
        newDecisions[partId] = nextDecision;
        partDecisions = newDecisions;
        console.log(
            "[InlineDiff] Decisions after update:",
            JSON.stringify(partDecisions),
        );
    }

    function handleBlockLineClick(
        e: MouseEvent,
        lineId: string,
        blockId: string,
        role: "new" | "old",
    ) {
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed) return;
        e.stopPropagation();

        const newDecisions = { ...partDecisions };

        if (e.ctrlKey || e.metaKey) {
            // Ctrl+click: toggle individual line only
            const current = newDecisions[lineId] || "accept";
            newDecisions[lineId] = current === "accept" ? "revert" : "accept";
            console.log(
                "[InlineDiff] Ctrl+click line:",
                lineId,
                "→",
                newDecisions[lineId],
            );
        } else {
            // Default click: toggle entire block
            // Determine target state from clicked role:
            // Click "new" line → accept all (keep new, drop old)
            // Click "old" line → revert all (keep old, drop new)
            const targetDecision = role === "new" ? "accept" : "revert";
            // Find all lines sharing this blockId and set them
            for (const line of diffLines) {
                if (line.blockId === blockId && line.id) {
                    newDecisions[line.id] = targetDecision;
                }
            }
            console.log(
                "[InlineDiff] Block click:",
                blockId,
                "→",
                targetDecision,
            );
        }

        partDecisions = newDecisions;
    }

    function updateSelectionToolbar(providedRanges?: Range[]) {
        // console.log("[InlineDiff] updateSelectionToolbar check. Mode:", mode);
        if (mode !== "words") return;

        let ranges: Range[] = providedRanges || [];

        if (!providedRanges) {
            const selection = window.getSelection();
            if (
                selection &&
                !selection.isCollapsed &&
                selection.rangeCount > 0
            ) {
                for (let i = 0; i < selection.rangeCount; i++) {
                    ranges.push(selection.getRangeAt(i));
                }
            }
        }

        if (ranges.length === 0) {
            console.log(
                "[InlineDiff] Selection invalid or collapsed (and no provided ranges), bailing.",
            );
            selectionToolbar.visible = false;
            return;
        }

        const range = ranges[0];
        let container: Node | null = range.commonAncestorContainer;
        if (container.nodeType === 3) container = container.parentElement;

        const element = container as HTMLElement;
        const closestViewer = element.closest(".diff-viewer");

        console.log("[InlineDiff] Selection scope check:", {
            element,
            closestViewer,
            viewerRef,
            match: closestViewer === viewerRef,
        });

        // Ensure the selection is inside THIS viewer instance
        if (!closestViewer || closestViewer !== viewerRef) {
            // console.log("[InlineDiff] Selection outside this viewer instance");
            selectionToolbar.visible = false;
            return;
        }

        // ... rest of logic

        // Gather part IDs
        const partIds = new Set<string>();

        // Helper to get part ID from a node or its parents
        const getPartIdFromNode = (node: Node | null): string | null => {
            let curr = node;
            while (curr && curr !== element && curr.nodeType === 1) {
                const pid = (curr as HTMLElement).dataset?.partId;
                if (pid) return pid;
                curr = curr.parentElement;
            }
            // Also check if node itself is text, check parent
            if (node && node.nodeType === 3 && node.parentElement) {
                return node.parentElement.dataset?.partId || null;
            }
            return null;
        };

        // Use the document of the range's container to create the TreeWalker
        // This handles cases where nodes are in parent document (iframe scenario)
        const doc = range.commonAncestorContainer.ownerDocument || document;

        const walker = doc.createTreeWalker(
            range.commonAncestorContainer,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: (node) => {
                    // If we have a valid selection object, use containsNode (more precise for partial nodes)
                    // If not (passed ranges manually), use intersectsNode
                    if (range.intersectsNode(node)) {
                        return NodeFilter.FILTER_ACCEPT;
                    }
                    return NodeFilter.FILTER_SKIP;
                },
            },
        );

        // Check common ancestor first if it's a text node in a part
        if (range.commonAncestorContainer.nodeType === 3) {
            const pId = getPartIdFromNode(range.commonAncestorContainer);
            if (pId) partIds.add(pId);
        }

        while (walker.nextNode()) {
            const pId = getPartIdFromNode(walker.currentNode);
            if (pId) partIds.add(pId);
        }

        // Fallbacks
        const startId = getPartIdFromNode(range.startContainer);
        if (startId) partIds.add(startId);
        const endId = getPartIdFromNode(range.endContainer);
        if (endId) partIds.add(endId);

        console.log("[InlineDiff] updateSelectionToolbar flow", {
            foundPartIds: Array.from(partIds),
            rangeContainer: range.commonAncestorContainer,
            rangeText: range.toString(),
        });

        if (partIds.size > 0) {
            const rect = range.getBoundingClientRect();
            // Ensure toolbar doesn't go off-screen
            const toolbarX = Math.max(10, rect.left + rect.width / 2);
            const toolbarY = Math.max(10, rect.top - 8);

            console.log("[InlineDiff] Showing toolbar at", {
                x: toolbarX,
                y: toolbarY,
                rect,
            });

            selectionToolbar = {
                visible: true,
                x: toolbarX,
                y: toolbarY,
                selectedIds: Array.from(partIds),
            };
        } else {
            console.log("[InlineDiff] No part IDs found in selection, hiding.");
            selectionToolbar.visible = false;
        }
    }

    function handleSelectionChange() {
        // console.log("[InlineDiff] selectionchange event");
        // Debounce slightly
        setTimeout(() => updateSelectionToolbar(), 10);
    }

    // Helper to get selection even if we are in an iframe (Logseq plugin)
    function getSafeSelection(): Selection | null {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) return sel;

        // Try parent if we are in an iframe
        if (window.parent && window.parent !== window) {
            try {
                const parentSel = window.parent.getSelection();
                if (parentSel && parentSel.rangeCount > 0) return parentSel;
            } catch (e) {
                // Ignore cross-origin errors
            }
        }
        return sel;
    }

    function getDecisionClass(
        partId: string | undefined,
        type: string,
    ): string {
        if (!partId) return "";
        const decision = partDecisions[partId];
        if (!decision) return "";

        if (decision === "revert") {
            return "reverted";
        }
        return "accepted";
    }

    /**
     * For block lines: determine if this line is "active" (chosen) or "inactive" (not chosen).
     */
    function getBlockLineClass(lineId: string, role: "new" | "old"): string {
        const decision = partDecisions[lineId] || "accept";
        if (role === "new") {
            return decision === "accept" ? "pair-active" : "pair-inactive";
        } else {
            return decision === "revert" ? "pair-active" : "pair-inactive";
        }
    }

    $effect(() => {
        const _ = originalContent + modifiedContent;
        calculateDiff();
    });

    onMount(() => {
        console.log("[InlineDiff] onMount, viewerRef:", viewerRef);
        calculateDiff();
        document.addEventListener("selectionchange", handleSelectionChange);

        return () => {
            document.removeEventListener(
                "selectionchange",
                handleSelectionChange,
            );
        };
    });

    function manualClick(node: HTMLElement, fn: (recursive: boolean) => void) {
        const handler = (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
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
        const handler = (e: MouseEvent) => {
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

    // Action to handle clicks on unified parts in Logseq environment
    // where Svelte's onclick might fail in nested loops.
    function unifiedPartClickAction(
        node: HTMLElement,
        fn: (e: MouseEvent) => void,
    ) {
        const handler = (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            fn(e);
        };
        node.addEventListener("click", handler);
        return {
            update(newFn: (e: MouseEvent) => void) {
                fn = newFn;
            },
            destroy() {
                node.removeEventListener("click", handler);
            },
        };
    }

    function selectionTriggerAction(node: HTMLElement) {
        const handleMouse = (e: MouseEvent) => {
            // Use the window context of the event, which is where the DOM/Selection lives!
            // This is critical for Logseq plugins where JS runs in iframe but DOM might be in main window.
            const targetWindow = e.view || window;
            const sel = targetWindow.getSelection();

            const ranges: Range[] = [];
            if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
                for (let i = 0; i < sel.rangeCount; i++) {
                    try {
                        ranges.push(sel.getRangeAt(i).cloneRange());
                    } catch (e) {
                        /* ignore */
                    }
                }
            }

            console.log("[InlineDiff] Action MouseUp (Sync)", {
                node,
                rangesFound: ranges.length,
                selType: sel?.type,
                targetWindowSame: targetWindow === window,
                targetWindowParent: targetWindow === window.parent,
            });

            // Pass ranges directly to avoid race condition where selection is cleared
            updateSelectionToolbar(ranges);
        };
        const handleKey = (e: KeyboardEvent) => {
            // For keyboard events, e.view is also valid
            const targetWindow = e.view || window;
            const sel = targetWindow.getSelection();
            const ranges: Range[] = [];
            if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
                for (let i = 0; i < sel.rangeCount; i++) {
                    try {
                        ranges.push(sel.getRangeAt(i).cloneRange());
                    } catch (e) {
                        /* ignore */
                    }
                }
            }
            console.log("[InlineDiff] Action KeyUp (Sync)", {
                key: e.key,
                rangesFound: ranges.length,
            });
            updateSelectionToolbar(ranges);
        };

        // Use capture=true to catch event before bubbling handlers might clear selection
        node.addEventListener("mouseup", handleMouse, true);
        node.addEventListener("keyup", handleKey, true);

        return {
            destroy() {
                node.removeEventListener("mouseup", handleMouse, true);
                node.removeEventListener("keyup", handleKey, true);
            },
        };
    }

    function portal(node: HTMLElement) {
        // Logseq context: Mount to the document where the viewer lives (Main Window),
        // not the plugin iframe document.
        const targetBody = viewerRef?.ownerDocument?.body || document.body;

        console.log("[InlineDiff] Portal mounting to:", {
            targetBody,
            isIframeBody: targetBody === document.body,
            viewerRefExists: !!viewerRef,
        });

        targetBody.appendChild(node);
        return {
            destroy() {
                if (node.parentElement === targetBody) {
                    targetBody.removeChild(node);
                }
            },
        };
    }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    bind:this={viewerRef}
    class="diff-viewer {mode}"
    draggable="false"
    ondragstart={(e) => e.preventDefault()}
    use:selectionTriggerAction
>
    {#if selectionToolbar.visible}
        <div
            use:portal
            class="selection-toolbar"
            style="top: {selectionToolbar.y}px; left: {selectionToolbar.x}px; position: fixed; z-index: 2147483647;"
            role="toolbar"
            tabindex="-1"
            use:manualClick={(recursive) => {
                /* no-op, just for stop prop handled in action */
            }}
        >
            <MergeControls
                mode="selection"
                on:accept={() => handleSelectionAction("accept")}
                on:revert={() => handleSelectionAction("revert")}
            />
        </div>
    {/if}
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
                    <span class="line-num">{line.originalLineNumber || ""}</span
                    >
                </div>
                <div class="line-content">
                    <span class="marker">
                        {line.type === "added" || line.type === "modified-new"
                            ? "+"
                            : line.type === "removed" ||
                                line.type === "modified-old"
                              ? "-"
                              : line.type === "modified-unified"
                                ? "~"
                                : "\u00A0"}
                    </span>
                    <span class="text">
                        {#if line.type === "modified-unified" && line.unifiedParts}
                            {#each line.unifiedParts as part}
                                {#if part.type === "replacement"}
                                    <span
                                        role="button"
                                        tabindex="0"
                                        class="unified-diff-btn unified-replacement {getDecisionClass(
                                            part.id,
                                            part.type,
                                        )}"
                                        data-part-id={part.id}
                                        title={getDecisionClass(
                                            part.id,
                                            part.type,
                                        ) === "reverted"
                                            ? "Reverted (Click to Accept)"
                                            : "Accepted (Click to Revert)"}
                                        use:unifiedPartClickAction={(e) =>
                                            handlePartClick(e, part.id!)}
                                    >
                                        <span class="unified-added"
                                            >{part.addedText}</span
                                        >
                                        <span class="unified-removed"
                                            >{part.removedText}</span
                                        >
                                    </span>
                                {:else if part.type === "added"}
                                    <span
                                        role="button"
                                        tabindex="0"
                                        class="unified-diff-btn unified-added {getDecisionClass(
                                            part.id,
                                            part.type,
                                        )}"
                                        data-part-id={part.id}
                                        title={getDecisionClass(
                                            part.id,
                                            part.type,
                                        ) === "reverted"
                                            ? "Reverted (Click to Accept)"
                                            : "Accepted (Click to Revert)"}
                                        use:unifiedPartClickAction={(e) =>
                                            handlePartClick(e, part.id!)}
                                        >{part.text}</span
                                    >
                                {:else if part.type === "removed"}
                                    <span
                                        role="button"
                                        tabindex="0"
                                        class="unified-diff-btn unified-removed {getDecisionClass(
                                            part.id,
                                            part.type,
                                        )}"
                                        data-part-id={part.id}
                                        title={getDecisionClass(
                                            part.id,
                                            part.type,
                                        ) === "reverted"
                                            ? "Reverted (Click to Accept)"
                                            : "Accepted (Click to Revert)"}
                                        use:unifiedPartClickAction={(e) =>
                                            handlePartClick(e, part.id!)}
                                        >{part.text}</span
                                    >
                                {:else}
                                    <span>{part.text}</span>
                                {/if}
                            {/each}
                        {:else if line.intraLineParts && line.intraLineParts.length > 0}
                            {#each line.intraLineParts as part}
                                <span class="intra-{part.type}"
                                    >{part.text}</span
                                >
                            {/each}
                        {:else if line.blockRole && line.id && line.blockId}
                            <span
                                role="button"
                                tabindex="0"
                                class="unified-diff-btn unified-{line.type} {getBlockLineClass(
                                    line.id,
                                    line.blockRole,
                                )}"
                                data-part-id={line.id}
                                title={line.blockRole === "new"
                                    ? "Click to keep this (new) line. Ctrl+click for single line."
                                    : "Click to keep this (old) line. Ctrl+click for single line."}
                                use:unifiedPartClickAction={(e) =>
                                    handleBlockLineClick(
                                        e,
                                        line.id!,
                                        line.blockId!,
                                        line.blockRole!,
                                    )}
                            >
                                {line.content}
                            </span>
                        {:else if line.id}
                            <span
                                role="button"
                                tabindex="0"
                                class="unified-diff-btn unified-{line.type} {getDecisionClass(
                                    line.id,
                                    line.type,
                                )}"
                                data-part-id={line.id}
                                title={getDecisionClass(line.id, line.type) ===
                                "reverted"
                                    ? "Reverted (Click to Accept)"
                                    : "Accepted (Click to Revert)"}
                                use:unifiedPartClickAction={(e) =>
                                    handlePartClick(e, line.id!)}
                            >
                                {line.content}
                            </span>
                        {:else}
                            {line.content}
                        {/if}
                    </span>
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
        width: fit-content;
        min-width: 60%;
        max-width: 100%;
        margin: 0 auto;
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
        width: 40px;
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

    /* Unified / Stacked Styles */
    .type-modified-unified {
        background-color: rgba(255, 255, 200, 0.15); /* Slight yellow tint */
    }
    .type-modified-unified .marker {
        color: #b80;
    }

    .unified-replacement {
        display: inline-flex;
        flex-direction: column;
        vertical-align: middle;
        margin: 0 2px;
        line-height: 1.1;
        background: rgba(0, 0, 0, 0.05); /* Slight box BG */
        border-radius: 3px;
        padding: 0 2px;
        cursor: pointer; /* Clickable */
    }

    /* Decision Styles */
    /* Reverted Replacement: Swap focus. */
    .unified-replacement.reverted .unified-added {
        opacity: 0.3;
        text-decoration: line-through;
        order: 2; /* Move to bottom visual? Or just style? */
    }
    .unified-replacement.reverted .unified-removed {
        opacity: 1;
        text-decoration: none;
        color: inherit;
        order: 1;
        background-color: transparent;
    }

    /* Reverted Added: Hide or Strikethrough */
    .unified-added.reverted {
        text-decoration: line-through;
        color: var(--ls-tertiary-text-color);
        background-color: transparent;
        opacity: 0.6;
    }

    /* Reverted Removed (Restored): Normal Text */
    .unified-removed.reverted {
        text-decoration: none;
        color: inherit;
        background-color: transparent;
        opacity: 1;
    }

    .selection-toolbar {
        position: fixed; /* Fixed to viewport usually better for floating toolbars on top */
        z-index: 1000; /* Max Z-Index to ensure it floats above everything (modals, etc.) */
        /*display: flex;*/
        transform: translate(-50%, -100%); /* Center and move above */
        background: var(--ls-secondary-background-color, #fff);

        border-radius: 4px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        /* padding: 4px;^
        /* visibility: visible;*/
    }

    .selection-toolbar > :global(.lda-merge-controls) {
        margin-left: 0px;
    }

    .unified-added {
        color: #080;
        background-color: rgba(100, 255, 100, 0.25);
        border-radius: 2px;
        font-size: 0.9em;
    }

    .unified-removed {
        color: #c00;
        background-color: rgba(255, 100, 100, 0.25);
        border-radius: 2px;
        text-decoration: line-through;
        font-size: 0.8em;
        opacity: 0.8;
    }

    /* Ensure non-replaced added/removed also look correct inline */
    span > .unified-added {
        background-color: rgba(100, 255, 100, 0.25);
    }

    span > .unified-removed {
        background-color: rgba(255, 100, 100, 0.25);
        text-decoration: line-through;
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
    /* Interactive Feedback */
    .unified-replacement:hover,
    .unified-added:hover,
    .unified-removed:hover {
        filter: brightness(0.9);
        outline: 1px dashed rgba(0, 0, 0, 0.3);
    }

    /* Linked pair states */
    .pair-active {
        opacity: 1;
        text-decoration: none;
        cursor: pointer;
    }

    .pair-inactive {
        /* Increase from 0.4 for better readability */
        opacity: 0.7;
        text-decoration: line-through;
        cursor: pointer;
    }

    /* Override pair-inactive backgrounds to be more subtle */
    /* Remove color overrides to use base semantic colors */
    .unified-added.pair-inactive {
        background-color: transparent;
    }

    .unified-removed.pair-inactive {
        background-color: transparent;
    }

    /* Make pair-active removed line look "restored" (no strikethrough, normal color) */
    .unified-removed.pair-active {
        text-decoration: none;
        color: inherit;
        opacity: 1;
        background-color: rgba(100, 200, 255, 0.15);
    }
</style>
