<script lang="ts">
    import Modal from "../common/Modal.svelte";
    import { createEventDispatcher } from "svelte";
    import type { MergeEntity } from "../../../domain/merge/entity";
    import SideBySideDiff from "./SideBySideDiff.svelte";
    import InlineDiff from "./InlineDiff.svelte";

    let { isOpen, mergeData }: { isOpen: boolean; mergeData: MergeEntity } =
        $props();

    const dispatch = createEventDispatcher();

    // View Mode State
    let viewMode: "split" | "inline" = $state("split");

    function handleAccept() {
        dispatch("accept");
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
        // Also prevent pointer events just in case
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
                {:else}
                    <InlineDiff
                        originalContent={mergeData.originalContent || ""}
                        modifiedContent={mergeData.newContent || ""}
                    />
                {/if}
            {/if}
        </div>

        <div class="lda-diff-actions">
            <button class="lda-btn lda-btn-secondary" onclick={handleClose}
                >Cancel</button
            >
            <button class="lda-btn lda-btn-danger" onclick={handleRevert}
                >Revert (Keep Original)</button
            >
            <button class="lda-btn lda-btn-primary" onclick={handleAccept}
                >Accept Merge</button
            >
        </div>
    </div>
</Modal>
