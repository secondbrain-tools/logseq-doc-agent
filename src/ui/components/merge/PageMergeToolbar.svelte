<script lang="ts">
    import { MergeActionService } from "../../../application/services/merge-action.service";
    import { Services } from "../../../services";

    let { mergeCount }: { mergeCount: number } = $props();

    const mergeActionService = new MergeActionService();

    async function handleAcceptAll() {
        try {
            // Get all blocks with merge property on current page
            const currentPage = await logseq.Editor.getCurrentPage();
            if (!currentPage) return;

            const blocks = await logseq.Editor.getPageBlocksTree(
                currentPage.uuid,
            );
            const collectMergeBlocks = (blocks: any[]): string[] => {
                const uuids: string[] = [];
                for (const block of blocks) {
                    if (
                        block.properties?.["logseqDocAgent.merge"] ||
                        block.content?.includes("logseq-doc-agent.merge::")
                    ) {
                        uuids.push(block.uuid);
                    }
                    if (block.children) {
                        uuids.push(...collectMergeBlocks(block.children));
                    }
                }
                return uuids;
            };

            const mergeUuids = collectMergeBlocks(blocks);
            console.log(
                `[PageMergeToolbar] Accepting all ${mergeUuids.length} merge blocks`,
            );

            for (const uuid of mergeUuids) {
                await mergeActionService.quickAccept(uuid);
            }

            await logseq.UI.showMsg(
                `Accepted ${mergeUuids.length} merge blocks`,
                "success",
            );
            await refreshInjection();
        } catch (e) {
            console.error("[PageMergeToolbar] Failed to accept all:", e);
            await logseq.UI.showMsg("Failed to accept all merges", "error");
        }
    }

    async function handleRevertAll() {
        try {
            const currentPage = await logseq.Editor.getCurrentPage();
            if (!currentPage) return;

            const blocks = await logseq.Editor.getPageBlocksTree(
                currentPage.uuid,
            );
            const collectMergeBlocks = (blocks: any[]): string[] => {
                const uuids: string[] = [];
                for (const block of blocks) {
                    if (
                        block.properties?.["logseqDocAgent.merge"] ||
                        block.content?.includes("logseq-doc-agent.merge::")
                    ) {
                        uuids.push(block.uuid);
                    }
                    if (block.children) {
                        uuids.push(...collectMergeBlocks(block.children));
                    }
                }
                return uuids;
            };

            const mergeUuids = collectMergeBlocks(blocks);
            console.log(
                `[PageMergeToolbar] Reverting all ${mergeUuids.length} merge blocks`,
            );

            await mergeActionService.revertMerge(mergeUuids);

            await logseq.UI.showMsg(
                `Reverted ${mergeUuids.length} merge blocks`,
                "success",
            );
            await refreshInjection();
        } catch (e) {
            console.error("[PageMergeToolbar] Failed to revert all:", e);
            await logseq.UI.showMsg("Failed to revert all merges", "error");
        }
    }

    async function refreshInjection() {
        await new Promise((resolve) => setTimeout(resolve, 100));
        Services.instance.injectMergesUseCase.execute();
    }
</script>

<div class="lda-page-merge-toolbar">
    <span class="merge-count">{mergeCount} pending</span>
    <button
        class="lda-toolbar-btn accept-all"
        onclick={handleAcceptAll}
        title="Accept all merge changes on this page"
    >
        ✓ All
    </button>
    <button
        class="lda-toolbar-btn revert-all"
        onclick={handleRevertAll}
        title="Revert all merge changes on this page"
    >
        ✗ All
    </button>
</div>

<style>
    .lda-page-merge-toolbar {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 12px;
        background: var(--ls-tertiary-background-color, #f0f0f0);
        border: 1px solid var(--ls-border-color, #ddd);
        border-radius: 6px;
        font-size: 0.85em;
    }

    .merge-count {
        color: var(--ls-secondary-text-color, #666);
        font-weight: 500;
    }

    .lda-toolbar-btn {
        padding: 4px 10px;
        border: none;
        border-radius: 4px;
        font-size: 0.85em;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s ease;
    }

    .accept-all {
        background: #22c55e;
        color: white;
    }

    .accept-all:hover {
        background: #16a34a;
    }

    .revert-all {
        background: #ef4444;
        color: white;
    }

    .revert-all:hover {
        background: #dc2626;
    }
</style>
