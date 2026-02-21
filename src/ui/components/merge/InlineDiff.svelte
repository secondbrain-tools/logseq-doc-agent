<script lang="ts">
    import { onMount, tick, untrack } from "svelte";
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
        mode = "lines",
        onContentChange,
        standalone = false,
    }: {
        originalContent?: string;
        modifiedContent?: string;
        canToggle?: boolean;
        isExpanded?: boolean;
        onToggle?: (recursive: boolean) => void;
        mode?: "lines" | "words";
        onContentChange?: (newContent: string) => void;
        standalone?: boolean;
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
        const currentDecisions = untrack(() => partDecisions);
        const result = calculateDiffLines(
            originalContent,
            modifiedContent,
            mode,
            currentDecisions,
        );
        diffLines = result.diffLines;

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
        const content = generateContentFromDiff(diffLines, partDecisions);

        const normalizedContent = content.replace(/\n$/, "");
        const normalizedLast = lastEmittedContent.replace(/\n$/, "");

        if (onContentChange && normalizedContent !== normalizedLast) {
            lastEmittedContent = content;
            onContentChange(content);
        }
    }

    function handleSelectionAction(action: "accept" | "revert") {
        const { selectedIds } = selectionToolbar;
        if (selectedIds.length === 0) {
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

        // Hide toolbar
        selectionToolbar.visible = false;
        selectionToolbar.selectedIds = [];

        // Clear browser selection to give visual feedback that action is done
        const sel = window.getSelection();
        if (sel) sel.removeAllRanges();
    }

    function handlePartClick(e: MouseEvent, partId: string) {
        // If the user is selecting text (range not collapsed), ignore click (it's a selection end)
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed) {
            return;
        }

        e.stopPropagation();

        const currentDecision = partDecisions[partId];
        const nextDecision = currentDecision === "revert" ? "accept" : "revert";

        // Update
        const newDecisions = { ...partDecisions };
        newDecisions[partId] = nextDecision;
        partDecisions = newDecisions;
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
        }

        partDecisions = newDecisions;
    }

    function updateSelectionToolbar(providedRanges?: Range[]) {
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
            selectionToolbar.visible = false;
            return;
        }

        const range = ranges[0];
        let container: Node | null = range.commonAncestorContainer;
        if (container.nodeType === 3) container = container.parentElement;

        const element = container as HTMLElement;
        const closestViewer = element.closest(".diff-viewer");

        // Ensure the selection is inside THIS viewer instance
        if (!closestViewer || closestViewer !== viewerRef) {
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

        if (partIds.size > 0) {
            const rect = range.getBoundingClientRect();
            // Ensure toolbar doesn't go off-screen
            const toolbarX = Math.max(10, rect.left + rect.width / 2);
            const toolbarY = Math.max(10, rect.top - 8);

            selectionToolbar = {
                visible: true,
                x: toolbarX,
                y: toolbarY,
                selectedIds: Array.from(partIds),
            };
        } else {
            selectionToolbar.visible = false;
        }
    }

    function handleSelectionChange() {
        // Debounce slightly
        setTimeout(() => updateSelectionToolbar(), 10);
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
    class="diff-viewer {mode} {standalone ? 'standalone' : ''}"
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
                onAccept={() => handleSelectionAction("accept")}
                onRevert={() => handleSelectionAction("revert")}
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
                                {#if part.type === "replacement" || part.type === "added" || part.type === "removed"}
                                    {@const isReverted =
                                        getDecisionClass(part.id, part.type) ===
                                        "reverted"}
                                    <span
                                        role="button"
                                        tabindex="0"
                                        class="unified-diff-btn unified-{part.type} {getDecisionClass(
                                            part.id,
                                            part.type,
                                        )}"
                                        data-part-id={part.id}
                                        title={isReverted
                                            ? "Reverted (Click to Accept)"
                                            : "Accepted (Click to Revert)"}
                                        use:unifiedPartClickAction={(e) =>
                                            handlePartClick(e, part.id!)}
                                    >
                                        {#if part.type === "replacement"}
                                            <span class="unified-added"
                                                >{part.addedText}</span
                                            >
                                            <span class="unified-removed"
                                                >{part.removedText}</span
                                            >
                                        {:else}
                                            {part.text}
                                        {/if}
                                    </span>
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
                            {@const titleMsg =
                                line.blockRole === "new"
                                    ? "Click to keep this (new) line. Ctrl+click for single line."
                                    : "Click to keep this (old) line. Ctrl+click for single line."}
                            <span
                                role="button"
                                tabindex="0"
                                class="unified-diff-btn unified-{line.type} {getBlockLineClass(
                                    line.id,
                                    line.blockRole,
                                )}"
                                data-part-id={line.id}
                                title={titleMsg}
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
                            {@const isReverted =
                                getDecisionClass(line.id, line.type) ===
                                "reverted"}
                            <span
                                role="button"
                                tabindex="0"
                                class="unified-diff-btn unified-{line.type} {getDecisionClass(
                                    line.id,
                                    line.type,
                                )}"
                                data-part-id={line.id}
                                title={isReverted
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
