<script lang="ts">
    import Modal from "../common/Modal.svelte";
    import { createEventDispatcher } from "svelte";
    import type { MergeEntity } from "../../../domain/merge/entity";
    import type { MergeTreeItem } from "../../../application/services/merge-tree.service";
    import SideBySideDiff from "./SideBySideDiff.svelte";
    import InlineDiff from "./InlineDiff.svelte";
    import ThreeWayDiff from "./ThreeWayDiff.svelte";
    import TreeDiffItem from "./TreeDiffItem.svelte";

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

    // Sync References
    let topPane: HTMLElement;
    let bottomPane: HTMLElement;
    let isSyncing = false;

    // Sync Logic: Align by Block Index
    function handleScrollSync(source: HTMLElement, target: HTMLElement) {
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
                // If top of item is typically visible (e.g., bottom > top edge)
                // We want the item that is currently "at the top" of the view
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

    // Initialize content when data arrives (effect)
    $effect(() => {
        if (isOpen) {
            if (mergeTree && mergeTree.length > 0) {
                activeTree = mergeTree;
                // Default view mode. Stick to Smart for now unless persisted?
                // Let's keep it 'edit' (Smart) as default.
                viewMode = "edit";

                // Initialize edits map
                const edits: Record<string, string> = {};
                for (const item of activeTree) {
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
    });

    function handleAccept() {
        if (activeTree.length > 0) {
            // Dispatch map of all changes
            dispatch("accept", { treeEdits });
        } else {
            // Single block
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

    // Robust click handler to prevent event swallowing
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
</script>

<Modal {isOpen} title="Merge Diff" width="90vw" on:close={handleClose}>
    <div class="lda-diff-container">
        <!-- View Toggle -->
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

        <!-- Diff Viewer -->
        <div class="lda-diff-editor-wrapper">
            {#if isOpen}
                {#if activeTree.length > 0}
                    {#if viewMode === "split_edit"}
                        <!-- Vertical Split Layout -->
                        <div class="split-edit-container">
                            <div
                                class="pane-top"
                                bind:this={topPane}
                                onscroll={() =>
                                    handleScrollSync(topPane, bottomPane)}
                            >
                                <div class="pane-header">Diff View</div>
                                {#each activeTree as item}
                                    <TreeDiffItem
                                        {item}
                                        viewMode="split"
                                        onContentChange={handleTreeChange}
                                    />
                                {/each}
                            </div>
                            <!-- Separator visualization -->
                            <div class="split-separator"></div>
                            <div
                                class="pane-bottom"
                                bind:this={bottomPane}
                                onscroll={() =>
                                    handleScrollSync(bottomPane, topPane)}
                            >
                                <div class="pane-header">Result Editor</div>
                                {#each activeTree as item}
                                    <TreeDiffItem
                                        {item}
                                        viewMode="output"
                                        onContentChange={handleTreeChange}
                                    />
                                {/each}
                            </div>
                        </div>
                    {:else}
                        <!-- Standard Layouts -->
                        <div class="tree-diff-container">
                            <!-- Header Row for Edit Mode -->
                            {#if viewMode === "edit"}
                                <div class="tree-header-row">
                                    <div class="col-input">
                                        Proposed Changes
                                    </div>
                                    <div class="col-output">Final Result</div>
                                </div>
                            {/if}

                            {#each activeTree as item}
                                <TreeDiffItem
                                    {item}
                                    {viewMode}
                                    onContentChange={handleTreeChange}
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
    .lda-toggle-label {
        font-size: 0.9em;
        font-weight: 500;
        color: var(--ls-secondary-text-color);
        padding: 4px 8px;
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
    }

    .col-input,
    .col-output {
        flex: 1;
    }

    /* Split Edit Layout */
    .split-edit-container {
        display: flex;
        flex-direction: column;
        height: 100%;
    }

    .pane-top,
    .pane-bottom {
        flex: 1;
        overflow-y: auto;
        padding-right: 8px;
        border: 1px solid var(--ls-border-color); /* Add border to define panes */
    }

    .split-separator {
        height: 8px;
        background: var(--ls-tertiary-background-color);
        border-top: 1px solid var(--ls-border-color);
        border-bottom: 1px solid var(--ls-border-color);
        cursor: row-resize; /* In future could be resizable */
    }

    .pane-header {
        position: sticky;
        top: 0;
        background: var(--ls-tertiary-background-color);
        padding: 4px 8px;
        font-weight: 600;
        font-size: 0.8em;
        text-transform: uppercase;
        color: var(--ls-secondary-text-color);
        border-bottom: 1px solid var(--ls-border-color);
        z-index: 5;
    }
</style>
