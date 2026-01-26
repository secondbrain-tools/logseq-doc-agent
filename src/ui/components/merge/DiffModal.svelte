<script lang="ts">
    import Modal from "../common/Modal.svelte";
    import { createEventDispatcher } from "svelte";
    import type { MergeEntity } from "../../../domain/merge/entity";
    import SideBySideDiff from "./SideBySideDiff.svelte";
    import InlineDiff from "./InlineDiff.svelte";
    import ThreeWayDiff from "./ThreeWayDiff.svelte";

    let { isOpen, mergeData }: { isOpen: boolean; mergeData: MergeEntity } =
        $props();

    const dispatch = createEventDispatcher();

    // View Mode State
    let viewMode: "split" | "inline" | "edit" = $state("split");

    // Content state for the Edit mode
    let editContent = $state("");

    // Initialize content when data arrives (effect)
    $effect(() => {
        if (isOpen && mergeData) {
            // Default to current live content if available (preserves user manual edits),
            // otherwise AI proposal.
            editContent =
                mergeData.currentContent || mergeData.newContent || "";
        }
    });

    function handleAccept() {
        dispatch("accept", { content: editContent });
    }

    function handleRevert() {
        dispatch("revert");
    }

    function handleClose() {
        dispatch("close");
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
            </div>
        </div>

        <!-- Diff Viewer -->
        <div class="lda-diff-editor-wrapper">
            {#if isOpen && mergeData}
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
                type="button">Accept Merge</button
            >
        </div>
    </div>
</Modal>
