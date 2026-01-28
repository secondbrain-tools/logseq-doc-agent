<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import { onMount, onDestroy } from "svelte";
    import {
        MergeTreeService,
        type MergeTreeItem,
    } from "../../../application/services/merge-tree.service";
    import { MergeActionService } from "../../../application/services/merge-action.service";
    import { filterProperties } from "../../../domain/logseq/properties";
    import type { MergeEntity } from "../../../domain/merge/entity";
    import DiffModal from "./DiffModal.svelte";

    let {
        blockUuid,
        mergeData,
    }: { blockUuid: string; mergeData: MergeEntity } = $props();

    const dispatch = createEventDispatcher();
    const mergeTreeService = new MergeTreeService();
    const mergeActionService = new MergeActionService();

    let targetElement: HTMLElement | null = null;
    let showDiffModal = $state(false);

    // Tree state
    let mergeTree: MergeTreeItem[] = $state([]);

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

    async function handleAccept(
        event?: CustomEvent<{
            content?: string;
            treeEdits?: Record<string, string>;
        }>,
    ) {
        if (targetElement) {
            targetElement.classList.remove("lda-merge-highlight");
        }
        showDiffModal = false;
        try {
            console.log(
                "[MergeControls] Accepting merge for block:",
                blockUuid,
            );

            // Fetch settings for patterns - need them for save as well
            const settings = (logseq.settings as any) || {};
            const patternsRaw =
                (settings["mergeFilterPatterns"] as string) ||
                "logseq-doc-agent.*";
            const patterns = patternsRaw
                .split("\n")
                .filter((s) => s.trim().length > 0);

            // Check for Tree Edits first (Batch Mode)
            if (event && event.detail && event.detail.treeEdits) {
                const edits = event.detail.treeEdits;
                await mergeActionService.acceptBatchMerge(edits, patterns);
            } else if (
                event &&
                event.detail &&
                typeof event.detail.content === "string"
            ) {
                // Legacy / Single Block mode fallback
                let finalContent = event.detail.content;
                await mergeActionService.acceptMerge(
                    blockUuid,
                    finalContent,
                    patterns,
                );
            }

            console.log("[MergeControls] Merge acceptance complete.");
        } catch (e) {
            console.error("[MergeControls] Failed to accept merge:", e);
            await logseq.UI.showMsg("Failed to accept merge", "error");
        }
    }

    async function handleRevert() {
        if (targetElement) {
            targetElement.classList.remove("lda-merge-highlight");
        }
        showDiffModal = false;
        try {
            console.log(
                "[MergeControls] Reverting (Optimistic keep original).",
            );

            const uuids =
                mergeTree.length > 0
                    ? mergeTree.map((i) => i.uuid)
                    : [blockUuid];

            await mergeActionService.revertMerge(uuids);
        } catch (e) {
            console.error("[MergeControls] Failed to revert merge:", e);
            await logseq.UI.showMsg("Failed to revert merge", "error");
        }
    }

    async function handleDiff(e?: MouseEvent) {
        if (e) {
            e.stopPropagation();
            e.preventDefault();
        }

        console.log("[MergeControls] Diff clicked. Fetching tree...");

        try {
            // Fetch settings for patterns
            const settings = (logseq.settings as any) || {};
            const patternsRaw =
                (settings["mergeFilterPatterns"] as string) ||
                "logseq-doc-agent.*";
            const patterns = patternsRaw
                .split("\n")
                .filter((s) => s.trim().length > 0);

            // 1. Fetch Tree
            const tree = await mergeTreeService.getMergeTree(blockUuid);

            // 2. Process Tree for Display (Filtering)
            const processedTree: MergeTreeItem[] = [];
            const headers: Record<string, string> = {};

            for (const item of tree) {
                // Filter current content
                const [cleanContent, header] = filterProperties(
                    item.content,
                    patterns,
                );

                // Clone mergeData to avoid mutating the original tree
                const mergeData = item.mergeData
                    ? { ...item.mergeData }
                    : undefined;

                if (mergeData) {
                    // Update currentContent reference for UI
                    mergeData.currentContent = cleanContent;

                    if (mergeData.newContent) {
                        const [cleanNew, _] = filterProperties(
                            mergeData.newContent,
                            patterns,
                        );
                        mergeData.newContent = cleanNew;
                    }
                    if (mergeData.originalContent) {
                        const [cleanOrg, _] = filterProperties(
                            mergeData.originalContent,
                            patterns,
                        );
                        mergeData.originalContent = cleanOrg;
                    }
                }

                processedTree.push({
                    ...item,
                    content: cleanContent,
                    mergeData,
                });
            }

            mergeTree = processedTree;
        } catch (err) {
            console.error("[MergeControls] Failed to fetch tree:", err);
            // Fallback?
            mergeTree = [];
        }

        console.log(
            `[MergeControls] Tree fetched with ${mergeTree.length} items. Opening modal.`,
        );
        showDiffModal = true;
    }
</script>

<div class="lda-merge-controls">
    <button
        class="lda-merge-btn lda-merge-accept"
        onclick={() => handleAccept()}
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
    {mergeTree}
    on:close={() => (showDiffModal = false)}
    on:accept={handleAccept}
    on:revert={handleRevert}
/>
