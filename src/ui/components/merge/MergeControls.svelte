<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import { onMount, onDestroy } from "svelte";
    import {
        MergeTreeService,
        type MergeTreeItem,
    } from "../../../application/services/merge-tree.service";
    import type { MergeEntity } from "../../../domain/merge/entity";
    import DiffModal from "./DiffModal.svelte";

    let {
        blockUuid,
        mergeData,
    }: { blockUuid: string; mergeData: MergeEntity } = $props();

    const dispatch = createEventDispatcher();
    const mergeTreeService = new MergeTreeService();

    let targetElement: HTMLElement | null = null;
    let showDiffModal = $state(false);

    // Tree state
    let mergeTree: MergeTreeItem[] = $state([]);

    // State for restoring hidden properties (UUID -> Header)
    let hiddenHeadersMap = $state<Record<string, string>>({});

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

    // Helper to filter properties based on glob patterns
    // Returns [cleanContent, headerString]
    function filterProperties(
        content: string,
        patterns: string[],
    ): [string, string] {
        if (!content || patterns.length === 0) return [content, ""];

        const lines = content.split("\n");
        const headerLines: string[] = [];
        const bodyLines: string[] = [];

        // Simple regex for property check: many-keys:: value
        const propRegex = /^([^:]+)::\s*(.*)$/;

        // Helper for glob matching
        const matchPattern = (key: string, pattern: string) => {
            const regexString = pattern
                .replace(/[.+^${}()|[\]\\]/g, "\\$&")
                .replace(/\*/g, ".*");
            return new RegExp(`^${regexString}$`).test(key);
        };

        for (const line of lines) {
            const trimmed = line.trim();
            const match = trimmed.match(propRegex);

            if (match) {
                const key = match[1];
                const isMatch = patterns.some((p) =>
                    matchPattern(key, p.trim()),
                );
                if (isMatch) {
                    headerLines.push(line);
                    continue;
                }
            }
            bodyLines.push(line);
        }

        return [bodyLines.join("\n"), headerLines.join("\n")];
    }

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

            // Check for Tree Edits first (Batch Mode)
            if (event && event.detail && event.detail.treeEdits) {
                const edits = event.detail.treeEdits;
                const uuids = Object.keys(edits);
                console.log(
                    `[MergeControls] Processing batch update for ${uuids.length} blocks.`,
                );

                for (const uuid of uuids) {
                    let finalContent = edits[uuid];

                    // Restore header if exists
                    const header = hiddenHeadersMap[uuid] || "";
                    if (header) {
                        if (finalContent.startsWith("\n")) {
                            finalContent = header + finalContent;
                        } else {
                            finalContent = header + "\n" + finalContent;
                        }
                    }

                    await logseq.Editor.updateBlock(uuid, finalContent);
                    // Also remove merge property
                    await logseq.Editor.removeBlockProperty(
                        uuid,
                        "logseq-doc-agent.merge",
                    );
                }
            } else if (
                event &&
                event.detail &&
                typeof event.detail.content === "string"
            ) {
                // Legacy / Single Block mode fallback
                let finalContent = event.detail.content;
                const header = hiddenHeadersMap[blockUuid] || ""; // Fallback to current block

                if (header) {
                    if (finalContent.startsWith("\n")) {
                        finalContent = header + finalContent;
                    } else {
                        finalContent = header + "\n" + finalContent;
                    }
                }

                await logseq.Editor.updateBlock(blockUuid, finalContent);
                await logseq.Editor.removeBlockProperty(
                    blockUuid,
                    "logseq-doc-agent.merge",
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
            // If tree mode, should we revert all?
            // Revert usually means: don't applying changes.
            // But validation logic might require restoring original property-free state?
            // Actually, if we just close the modal, we keep the state "pending".
            // If user wants to "Reject" merge, they usually want to remove the merge property.

            // For now, let's keep simple: Revert = "Do nothing / Keep original content".
            // But we should remove the merge property so it stops showing the diff UI?
            // Or maybe Revert just closes?
            // "Revert (Keep Original)" implies we accept the ORIGINAL content and discard the new proposal.
            // So we should remove `logseq-doc-agent.merge` property.

            // Since we might have a tree, do we revert ONLY the root? Or all?
            // If the user clicked Revert on the root block control, they probably mean the root.
            // But if they saw the tree, maybe they mean all?
            // Let's assume root only for safety, or iterate tree if we loaded it?

            // Safest: Iterate if tree loaded, else root.
            const uuids =
                mergeTree.length > 0
                    ? mergeTree.map((i) => i.uuid)
                    : [blockUuid];
            for (const uuid of uuids) {
                // We don't restore text (original text is already there), just remove property.
                await logseq.Editor.removeBlockProperty(
                    uuid,
                    "logseq-doc-agent.merge",
                );
            }
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
                headers[item.uuid] = header;

                // Filter merge new content
                if (item.mergeData) {
                    // Update currentContent reference for UI
                    item.mergeData.currentContent = cleanContent;

                    if (item.mergeData.newContent) {
                        const [cleanNew, _] = filterProperties(
                            item.mergeData.newContent,
                            patterns,
                        );
                        item.mergeData.newContent = cleanNew;
                    }
                    if (item.mergeData.originalContent) {
                        const [cleanOrg, _] = filterProperties(
                            item.mergeData.originalContent,
                            patterns,
                        );
                        item.mergeData.originalContent = cleanOrg;
                    }
                }

                processedTree.push({
                    ...item,
                    content: cleanContent,
                });
            }

            mergeTree = processedTree;
            hiddenHeadersMap = headers;
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
