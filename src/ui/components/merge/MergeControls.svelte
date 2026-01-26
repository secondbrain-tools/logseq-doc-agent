<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import { onMount, onDestroy } from "svelte";
    import type { MergeEntity } from "../../../domain/merge/entity";
    import DiffModal from "./DiffModal.svelte";

    let {
        blockUuid,
        mergeData,
    }: { blockUuid: string; mergeData: MergeEntity } = $props();

    const dispatch = createEventDispatcher();
    let targetElement: HTMLElement | null = null;
    let showDiffModal = $state(false);

    onMount(() => {
        const blockDiv = parent.document.querySelector(
            `div[blockid="${blockUuid}"]`,
        );
        if (blockDiv) {
            targetElement = blockDiv.querySelector(".block-main-container");
            if (targetElement) {
                targetElement.classList.add("lda-merge-highlight");
            }
        }
    });

    onDestroy(() => {
        if (targetElement) {
            targetElement.classList.remove("lda-merge-highlight");
        }
    });

    async function handleAccept() {
        if (targetElement) {
            targetElement.classList.remove("lda-merge-highlight");
        }
        showDiffModal = false; // Ensure modal is closed
        try {
            console.log(
                "[MergeControls] Accepting merge (optimistic) for block:",
                blockUuid,
            );
            // Optimistic merge: Content is already in the block.
            // Action: Just remove the backup property.
            await logseq.Editor.removeBlockProperty(
                blockUuid,
                "logseq-doc-agent.merge",
            );
            console.log(
                "[MergeControls] Merge property removed (merge accepted).",
            );
        } catch (e) {
            console.error("[MergeControls] Failed to accept merge:", e);
            await logseq.UI.showMsg("Failed to accept merge", "error");
        }
    }

    async function handleRevert() {
        if (targetElement) {
            targetElement.classList.remove("lda-merge-highlight");
        }
        showDiffModal = false; // Ensure modal is closed
        try {
            console.log(
                "[MergeControls] Reverting merge for block:",
                blockUuid,
            );
            // Optimistic merge: We need to RESTORE the original content.
            if (mergeData.originalContent) {
                await logseq.Editor.updateBlock(
                    blockUuid,
                    mergeData.originalContent,
                );
                console.log(
                    "[MergeControls] Block reverted to original content.",
                );
            } else {
                console.warn(
                    "[MergeControls] No original content to revert to.",
                );
                await logseq.UI.showMsg(
                    "Cannot revert: No original content saved.",
                    "warning",
                );
                // Still remove the property? Maybe safer to keep it so user can manually fix.
            }
        } catch (e) {
            console.error("[MergeControls] Failed to revert merge:", e);
            await logseq.UI.showMsg("Failed to revert merge", "error");
        }
    }

    function handleDiff(e?: MouseEvent) {
        if (e) {
            e.stopPropagation();
            e.preventDefault();
        }
        console.log("[MergeControls] Diff clicked. Opening modal.");
        showDiffModal = true;
    }
</script>

<div class="lda-merge-controls">
    <button
        class="lda-merge-btn lda-merge-accept"
        onclick={handleAccept}
        title="Accept Merge"
    >
        ✓
    </button>
    <button
        class="lda-merge-btn lda-merge-diff"
        onclick={handleDiff}
        title="Show Diff / Content"
    >
        ↔
    </button>
    <button
        class="lda-merge-btn lda-merge-revert"
        onclick={handleRevert}
        title="Discard Merge"
    >
        ✗
    </button>
</div>

<DiffModal
    isOpen={showDiffModal}
    {mergeData}
    on:close={() => (showDiffModal = false)}
    on:accept={handleAccept}
    on:revert={handleRevert}
/>
