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
    // 'split' | 'inline' | 'edit' | 'tree'
    let viewMode: "split" | "inline" | "edit" | "tree" = $state("split");

    // Content state for single-block edit
    let editContent = $state("");

    // Content state for tree edit (UUID -> Content)
    let treeEdits = $state<Record<string, string>>({});

    // Normalized tree for rendering
    let activeTree: MergeTreeItem[] = $state([]);

    // Initialize content when data arrives (effect)
    $effect(() => {
        if (isOpen) {
            if (mergeTree && mergeTree.length > 0) {
                activeTree = mergeTree;
                viewMode = "tree";

                // Initialize edits map
                const edits: Record<string, string> = {};
                for (const item of activeTree) {
                    if (item.mergeData) {
                        // Use confirmed edit content if previously set? No, reset on open.
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
                // Default to edit (smart) view as requested/refined previously?
                // Or keep split default. Let's stick to Edit Smart as it's the newest feature.
                // Actually, keep 'split' default to match previous behavior unless changed.
                // User liked the "Edit Smart", so maybe make it default?
                // Let's stick to "edit" (Smart) as default for consistency with "advanced" usage.
                // Or maybe check if `mergeData` implies conflict?
                viewMode = "edit";
                editContent =
                    mergeData.currentContent || mergeData.newContent || "";
            }
        }
    });

    function handleAccept() {
        if (viewMode === "tree") {
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
                {#if activeTree.length === 0}
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
                        class="lda-toggle-btn {viewMode === 'edit'
                            ? 'active'
                            : ''}"
                        use:genericClick={() => (viewMode = "edit")}
                        type="button">Edit (Smart)</button
                    >
                {:else}
                    <!-- In Tree Mode, we mainly show Tree, but maybe allow switching view per block? -->
                    <!-- For now, just a label -->
                    <span class="lda-toggle-label"
                        >Reviewing {activeTree.length} blocks</span
                    >
                {/if}
            </div>
        </div>

        <!-- Diff Viewer -->
        <div class="lda-diff-editor-wrapper">
            {#if isOpen}
                {#if viewMode === "tree" && activeTree.length > 0}
                    <div class="tree-diff-container">
                        {#each activeTree as item}
                            <TreeDiffItem
                                {item}
                                onContentChange={handleTreeChange}
                            />
                        {/each}
                    </div>
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
</style>
