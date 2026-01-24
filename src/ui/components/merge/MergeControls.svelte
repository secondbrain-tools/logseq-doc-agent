<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import type { MergeEntity } from "../../../domain/merge/entity";

    let {
        blockUuid,
        mergeData,
    }: { blockUuid: string; mergeData: MergeEntity } = $props();

    const dispatch = createEventDispatcher();

    async function handleAccept() {
        try {
            console.log(
                "[MergeControls] Accepting merge for block:",
                blockUuid,
            );
            // Replace the block content with the proposed content
            // This implicitly removes the property because the new content is just the text (presumably)
            // or we should double check if the agent sent properties in the content.
            // Usually the agent sends the full block content in 'content'.

            await logseq.Editor.updateBlock(blockUuid, mergeData.newContent);
            console.log("[MergeControls] Block updated.");
        } catch (e) {
            console.error("[MergeControls] Failed to accept merge:", e);
            await logseq.UI.showMsg("Failed to accept merge", "error");
        }
    }

    async function handleRevert() {
        try {
            console.log(
                "[MergeControls] Reverting (discarding) merge for block:",
                blockUuid,
            );
            // Just remove the merge property
            await logseq.Editor.removeBlockProperty(
                blockUuid,
                "logseq_doc_agent.merge",
            );
            console.log("[MergeControls] Merge property removed.");
        } catch (e) {
            console.error("[MergeControls] Failed to revert merge:", e);
            await logseq.UI.showMsg("Failed to revert merge", "error");
        }
    }

    function handleDiff() {
        console.log("[MergeControls] Diff clicked. Not implemented yet.");
        // Just show the proposed content in an alert for now
        logseq.UI.showMsg(
            `Proposed Content:\n\n${mergeData.newContent}`,
            "info",
        );
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
