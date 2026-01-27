<script lang="ts">
    import Modal from "../common/Modal.svelte";
    import { createEventDispatcher, untrack } from "svelte";
    import type { MergeEntity } from "../../../domain/merge/entity";
    import type { MergeTreeItem } from "../../../application/services/merge-tree.service";
    import SideBySideDiff from "./SideBySideDiff.svelte";
    import InlineDiff from "./InlineDiff.svelte";
    import ThreeWayDiff from "./ThreeWayDiff.svelte";
    import TreeDiffItem from "./TreeDiffItem.svelte";
    import { SvelteSet } from "svelte/reactivity";

    let {
        isOpen,
        mergeData,
        mergeTree,
    }: {
        isOpen: boolean;
        mergeData?: MergeEntity;
        mergeTree?: MergeTreeItem[];
    } = $props();

    const dispatch = createEventDispatcher();

    // View Mode State
    // 'split' | 'inline' | 'edit' | 'tree' (legacy) | 'split_edit'
    let viewMode: "split" | "inline" | "edit" | "tree" | "split_edit" =
        $state("split");

    // Content state for single-block edit
    let editContent = $state("");

    // Content state for tree edit (UUID -> Content)
    let treeEdits = $state<Record<string, string>>({});

    // Normalized tree for rendering
    let activeTree: MergeTreeItem[] = $state([]);

    // Expanded Blocks State (Sync across panes)
    let expandedIds = $state(new SvelteSet<string>());

    // Track initialization to prevent reset on re-renders
    let initializedTree: MergeTreeItem[] | undefined = $state();

    // Sync References
    let topPane: HTMLElement | undefined = $state();
    let bottomPane: HTMLElement | undefined = $state();
    let isSyncing = false;

    // Resizing State
    let topPaneHeightPercent = $state(50);
    let isResizing = $state(false);
    let modalBodyRef: HTMLElement | undefined = $state();

    // Sync Logic: Align by Block Index
    function handleScrollSync(
        source: HTMLElement | undefined,
        target: HTMLElement | undefined,
    ) {
        if (isSyncing || !source || !target) return;
        isSyncing = true;

        requestAnimationFrame(() => {
            // Find first visible element in source
            const items = source.querySelectorAll(".tree-diff-item");
            if (items.length === 0) {
                isSyncing = false;
                return;
            }

            const containerRect = source.getBoundingClientRect();
            let topIndex = 0;

            for (let i = 0; i < items.length; i++) {
                const rect = items[i].getBoundingClientRect();
                if (rect.bottom > containerRect.top) {
                    topIndex = i;
                    break;
                }
            }

            // Scroll target to same index
            const targetItems = target.querySelectorAll(".tree-diff-item");
            if (targetItems[topIndex]) {
                targetItems[topIndex].scrollIntoView({
                    behavior: "auto",
                    block: "start",
                });
            }

            // Debounce simple flag
            setTimeout(() => (isSyncing = false), 50);
        });
    }

    // Track if modal was previously open to trigger init only on open
    let wasOpen = false;

    // Initialize content when data arrives (effect)
    $effect(() => {
        if (isOpen) {
            const isFreshOpen = !wasOpen;
            wasOpen = true;

            // Initialize on rising edge OR if we have data now but didn't before
            // (Just in case data comes late, though MergeControls awaits it)
            if (
                isFreshOpen ||
                (activeTree.length === 0 && mergeTree && mergeTree.length > 0)
            ) {
                if (mergeTree && mergeTree.length > 0) {
                    activeTree = mergeTree;
                    // Default to edit only on fresh load/data arrival
                    viewMode = "edit";

                    // Initialize edits map & toggle state
                    const edits: Record<string, string> = {};
                    for (const item of activeTree) {
                        // Expand only blocks with conflicts by default
                        if (item.mergeData) {
                            expandedIds.add(item.uuid);
                        }

                        if (item.mergeData) {
                            edits[item.uuid] =
                                item.mergeData.currentContent ||
                                item.mergeData.newContent ||
                                "";
                        } else {
                            edits[item.uuid] = item.content;
                        }
                    }
                    treeEdits = edits;
                } else if (mergeData) {
                    // Single block fallback
                    activeTree = [];
                    viewMode = "edit";
                    editContent =
                        mergeData.currentContent || mergeData.newContent || "";
                }
            }
        } else {
            wasOpen = false;
        }
    });

    function handleAccept() {
        if (activeTree.length > 0) {
            dispatch("accept", { treeEdits });
        } else {
            dispatch("accept", { content: editContent });
        }
    }

    function handleRevert() {
        dispatch("revert");
    }

    function handleClose() {
        dispatch("close");
    }

    function handleTreeChange(uuid: string, newContent: string) {
        treeEdits[uuid] = newContent;
    }

    function handleToggle(uuid: string) {
        console.log("[DiffModal] handleToggle called for:", uuid);
        // Create new set to trigger reactivity if needed, though Svelte 5 Set should be fine.
        // But re-assigning is safer for deep reactivity in some cases.
        if (expandedIds.has(uuid)) {
            expandedIds.delete(uuid);
        } else {
            expandedIds.add(uuid);
        }
        // Force update just in case
        expandedIds = new SvelteSet(expandedIds);

        // Sync scroll to the toggled block in both panes
        syncScrollToBlock(uuid);
    }

    function syncScrollToBlock(uuid: string) {
        requestAnimationFrame(() => {
            const scrollToInPane = (pane: HTMLElement | undefined) => {
                if (!pane) return;
                const item = pane.querySelector(`[data-block-uuid="${uuid}"]`);
                if (item) {
                    item.scrollIntoView({
                        behavior: "smooth",
                        block: "nearest",
                    });
                }
            };

            scrollToInPane(topPane);
            scrollToInPane(bottomPane);
        });
    }

    function handleFocus(uuid: string) {
        // Scroll top pane to show corresponding block
        if (topPane) {
            const item = topPane.querySelector(`[data-block-uuid="${uuid}"]`);
            if (item) {
                item.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }
        }
    }

    function genericClick(node: HTMLElement, fn: () => void) {
        const handler = (e: MouseEvent) => {
            e.stopPropagation();
            fn();
        };
        const stop = (e: MouseEvent) => e.stopPropagation();

        node.addEventListener("click", handler);
        node.addEventListener("mousedown", stop);
        node.addEventListener("pointerdown", stop);

        return {
            destroy() {
                node.removeEventListener("click", handler);
                node.removeEventListener("mousedown", stop);
                node.removeEventListener("pointerdown", stop);
            },
        };
    }

    function handleReplaceRequest(
        uuid: string,
        source: "original" | "new",
        subtree: boolean,
    ) {
        console.log(
            `[DiffModal] Replace Request: uuid=${uuid}, source=${source}, subtree=${subtree}`,
        );

        const startIndex = activeTree.findIndex((i) => i.uuid === uuid);
        if (startIndex === -1) return;

        const startItem = activeTree[startIndex];

        const getContent = (item: MergeTreeItem) => {
            if (source === "original") {
                return item.mergeData?.originalContent || item.content || "";
            } else {
                return item.mergeData?.newContent || item.content || "";
            }
        };

        // 1. Update the clicked item
        treeEdits[uuid] = getContent(startItem);

        // 2. If subtree, continue
        if (subtree) {
            for (let i = startIndex + 1; i < activeTree.length; i++) {
                const current = activeTree[i];
                // If level is greater than start level, it is a descendant
                if (current.level > startItem.level) {
                    treeEdits[current.uuid] = getContent(current);
                } else {
                    // Not a descendant anymore
                    break;
                }
            }
        }
    }

    // Resizing Logic - Draggable action for the separator
    // Note: Modal is portaled to window.parent.document.body, so events must be attached there
    function getTargetDocument(): Document {
        return window.parent?.document || document;
    }

    function makeDraggable(node: HTMLElement) {
        const handleMouseDown = (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            isResizing = true;
            const targetDoc = getTargetDocument();
            targetDoc.addEventListener("mousemove", handleWindowMouseMove);
            targetDoc.addEventListener("mouseup", handleWindowMouseUp);
            targetDoc.body.style.cursor = "row-resize";
        };

        node.addEventListener("mousedown", handleMouseDown);

        return {
            destroy() {
                node.removeEventListener("mousedown", handleMouseDown);
            },
        };
    }

    function handleWindowMouseMove(e: MouseEvent) {
        if (!isResizing || !modalBodyRef) return;

        const rect = modalBodyRef.getBoundingClientRect();
        const offsetY = e.clientY - rect.top;
        const totalHeight = rect.height;

        // Calculate percentage
        let percent = (offsetY / totalHeight) * 100;

        // Clamp
        if (percent < 10) percent = 10;
        if (percent > 90) percent = 90;

        topPaneHeightPercent = percent;
    }

    function handleWindowMouseUp() {
        isResizing = false;
        const targetDoc = getTargetDocument();
        targetDoc.removeEventListener("mousemove", handleWindowMouseMove);
        targetDoc.removeEventListener("mouseup", handleWindowMouseUp);
        targetDoc.body.style.cursor = "";
    }

    function handleSeparatorKeyDown(e: KeyboardEvent) {
        if (e.key === "ArrowUp") {
            e.preventDefault();
            topPaneHeightPercent = Math.max(10, topPaneHeightPercent - 5);
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            topPaneHeightPercent = Math.min(90, topPaneHeightPercent + 5);
        }
    }
</script>

<Modal
    {isOpen}
    title="Merge Diff"
    width="90vw"
    initialMaximized={true}
    on:close={handleClose}
>
    {#snippet toolbar()}
        <div class="lda-view-toggle">
            <div class="lda-toggle-group">
                <button
                    class="lda-toggle-btn {viewMode === 'split'
                        ? 'active'
                        : ''}"
                    use:genericClick={() => (viewMode = "split")}
                    type="button">Split</button
                >
                <button
                    class="lda-toggle-btn {viewMode === 'inline'
                        ? 'active'
                        : ''}"
                    use:genericClick={() => (viewMode = "inline")}
                    type="button">Inline</button
                >
                <button
                    class="lda-toggle-btn {viewMode === 'edit' ? 'active' : ''}"
                    use:genericClick={() => (viewMode = "edit")}
                    type="button">Edit (Smart)</button
                >
                {#if activeTree.length > 0}
                    <button
                        class="lda-toggle-btn {viewMode === 'split_edit'
                            ? 'active'
                            : ''}"
                        use:genericClick={() => (viewMode = "split_edit")}
                        type="button">Edit (Split)</button
                    >
                    <span class="lda-toggle-label"
                        >({activeTree.length} blocks)</span
                    >
                {/if}
            </div>
        </div>
    {/snippet}

    <div class="lda-diff-container">
        <!-- Diff Viewer -->
        <div class="lda-diff-editor-wrapper">
            {#if isOpen}
                {#if activeTree.length > 0}
                    {#if viewMode === "split_edit"}
                        <!-- Vertical Split Layout -->
                        <div
                            class="split-edit-container"
                            bind:this={modalBodyRef}
                        >
                            <div
                                class="pane-top"
                                bind:this={topPane}
                                style="height: {topPaneHeightPercent}%; flex-shrink: 0;"
                                onscroll={() =>
                                    handleScrollSync(topPane, bottomPane)}
                            >
                                <!-- Global Header for Diff View -->
                                <div class="tree-header-row">
                                    <div class="col-input">Original Text</div>
                                    <div class="col-output">New Text</div>
                                </div>

                                {#each activeTree as item (item.uuid)}
                                    <TreeDiffItem
                                        {item}
                                        viewMode="split"
                                        isExpanded={expandedIds.has(item.uuid)}
                                        onToggle={handleToggle}
                                        onContentChange={handleTreeChange}
                                    />
                                {/each}
                            </div>
                            <!-- Separator visualization -->
                            <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
                            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                            <div
                                class="split-separator"
                                role="separator"
                                aria-valuenow={topPaneHeightPercent}
                                tabindex="0"
                                use:makeDraggable
                                onkeydown={handleSeparatorKeyDown}
                            >
                                <div class="handle-bar"></div>
                            </div>
                            <div
                                class="pane-bottom"
                                bind:this={bottomPane}
                                style="flex: 1 1 0%; min-height: 0;"
                                onscroll={() =>
                                    handleScrollSync(bottomPane, topPane)}
                            >
                                <div class="pane-header">Result Editor</div>
                                {#each activeTree as item (item.uuid)}
                                    <TreeDiffItem
                                        {item}
                                        currentContent={treeEdits[item.uuid]}
                                        viewMode="output"
                                        isExpanded={expandedIds.has(item.uuid)}
                                        onToggle={handleToggle}
                                        onContentChange={handleTreeChange}
                                        onFocus={handleFocus}
                                        onReplaceRequest={handleReplaceRequest}
                                    />
                                {/each}
                            </div>
                        </div>
                    {:else}
                        <!-- Standard Layouts -->
                        <div class="tree-diff-container">
                            <!-- Global Headers -->
                            {#if viewMode === "edit"}
                                <div class="tree-header-row">
                                    <div class="col-input">
                                        Proposed Changes
                                    </div>
                                    <div class="col-output">Final Result</div>
                                </div>
                            {:else if viewMode === "split"}
                                <div class="tree-header-row">
                                    <div class="col-input">Original Text</div>
                                    <div class="col-output">New Text</div>
                                </div>
                            {/if}

                            {#each activeTree as item (item.uuid)}
                                <TreeDiffItem
                                    {item}
                                    {viewMode}
                                    currentContent={treeEdits[item.uuid]}
                                    isExpanded={expandedIds.has(item.uuid)}
                                    onToggle={handleToggle}
                                    onContentChange={handleTreeChange}
                                    onReplaceRequest={handleReplaceRequest}
                                />
                            {/each}
                        </div>
                    {/if}
                {:else if mergeData}
                    <!-- Single Block Modes -->
                    {#if viewMode === "split"}
                        <SideBySideDiff
                            originalContent={mergeData.originalContent || ""}
                            modifiedContent={mergeData.newContent || ""}
                        />
                    {:else if viewMode === "inline"}
                        <InlineDiff
                            originalContent={mergeData.originalContent || ""}
                            modifiedContent={mergeData.newContent || ""}
                        />
                    {:else if viewMode === "edit"}
                        <ThreeWayDiff
                            originalContent={mergeData.originalContent || ""}
                            newContent={mergeData.newContent || ""}
                            bind:currentContent={editContent}
                        />
                    {/if}
                {/if}
            {/if}
        </div>

        <div class="lda-diff-actions">
            <button
                class="lda-btn lda-btn-secondary"
                use:genericClick={handleClose}
                type="button">Cancel</button
            >
            <button
                class="lda-btn lda-btn-danger"
                use:genericClick={handleRevert}
                type="button">Revert (Keep Original)</button
            >
            <button
                class="lda-btn lda-btn-primary"
                use:genericClick={handleAccept}
                type="button"
                >Accept {activeTree.length > 0 ? "All" : "Merge"}</button
            >
        </div>
    </div>
</Modal>

<style>
    .lda-view-toggle {
        display: flex;
        justify-content: center;
    }

    .lda-toggle-group {
        display: flex;
        align-items: center;
        background: var(--ls-tertiary-background-color);
        border-radius: 4px;
        padding: 2px;
        border: 1px solid var(--ls-border-color);
    }

    .lda-toggle-btn {
        background: transparent;
        border: none;
        padding: 4px 12px;
        font-size: 0.85em;
        cursor: pointer;
        border-radius: 3px;
        color: var(--ls-secondary-text-color);
        font-weight: 500;
        transition: all 0.2s;
    }

    .lda-toggle-btn:hover {
        background: var(--ls-quaternary-background-color);
        color: var(--ls-primary-text-color);
    }

    .lda-toggle-btn.active {
        background: var(--ls-primary-background-color);
        color: var(--ls-link-text-color);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
        font-weight: 600;
    }

    .lda-toggle-label {
        font-size: 0.85em;
        font-weight: 500;
        color: var(--ls-tertiary-text-color);
        padding: 0 8px;
        border-left: 1px solid var(--ls-border-color);
        margin-left: 4px;
    }

    .lda-diff-container {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 60vh; /* Ensure visibility when absolute positioned children are used */
        overflow: hidden;
    }

    .lda-diff-editor-wrapper {
        flex: 1;
        overflow: hidden; /* Important for inner scroll */
        position: relative;
        min-height: 0; /* Critical: Allow flex item to shrink below content size */
        height: 100%; /* Give children a reference for percentage heights */
    }

    .tree-diff-container {
        display: flex;
        flex-direction: column;
        gap: 0;
        height: 100%;
        overflow-y: auto;
        padding-right: 8px; /* For scrollbar */
    }

    .tree-header-row {
        display: flex;
        gap: 1rem;
        padding: 8px 16px;
        background: var(--ls-tertiary-background-color);
        border-bottom: 1px solid var(--ls-border-color);
        font-weight: 600;
        font-size: 0.9em;
        color: var(--ls-secondary-text-color);
        position: sticky;
        top: 0;
        z-index: 10;
        min-height: 36px;
    }

    .col-input,
    .col-output {
        flex: 1;
        text-align: center;
        text-transform: uppercase;
        font-size: 0.85em;
        letter-spacing: 0.5px;
    }

    /* Split Edit Layout */
    .split-edit-container {
        display: flex;
        flex-direction: column;
        /* Use absolute positioning to fill the parent wrapper exactly */
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        overflow: hidden; /* Fix global scroll */
    }

    .pane-top,
    .pane-bottom {
        overflow: auto; /* Enable both scrollbars */
        padding-right: 8px;
        border: 1px solid var(--ls-border-color);
        display: flex;
        flex-direction: column;
        min-height: 0; /* Critical: Allow flex item to shrink */
        min-width: 0; /* Allow flex shrink/horizontal scroll */
    }

    .pane-top {
        /* Height is set inline via style binding */
        flex-shrink: 0;
    }

    .pane-bottom {
        flex: 1 1 0%; /* Grow to fill remaining space */
    }

    .split-separator {
        height: 8px;
        background: var(--ls-tertiary-background-color);
        border-top: 1px solid var(--ls-border-color);
        border-bottom: 1px solid var(--ls-border-color);
        cursor: row-resize;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s;
    }

    .split-separator:hover {
        background: var(--ls-quaternary-background-color);
    }

    .handle-bar {
        width: 30px;
        height: 2px;
        background: var(--ls-tertiary-text-color);
        border-radius: 1px;
    }

    .pane-header {
        position: sticky;
        top: 0;
        background: var(--ls-tertiary-background-color);
        padding: 8px 16px;
        font-weight: 600;
        font-size: 0.85em;
        text-transform: uppercase;
        color: var(--ls-secondary-text-color);
        border-bottom: 1px solid var(--ls-border-color);
        z-index: 5;
        text-align: center;
        flex-shrink: 0;
    }
</style>
