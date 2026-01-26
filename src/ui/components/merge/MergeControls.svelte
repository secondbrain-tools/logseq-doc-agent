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

    // State for restoring hidden properties
    let hiddenHeader: string = "";

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

        let insideProperties = true; // Properties are usually at the top of the block

        // Logseq properties are key:: value at the start.
        // Once we hit non-property line, usually properties are done?
        // Actually, users can put text anywhere. But Logseq properties block is at top.
        // Let's iterate. If a line looks like a property AND matches pattern, hide it.
        // If it looks like a property but doesn't match, keep it?
        // Or if we strictly want to hide specific system properties.

        // Regex for simple property check:  some-key:: some value
        const propRegex = /^([^:]+)::\s*(.*)$/;

        // Helper for glob matching (very simple version: * support)
        const matchPattern = (key: string, pattern: string) => {
            // Escape special chars except *
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
                // Check if matches any pattern
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

    async function handleAccept(event?: CustomEvent<{ content: string }>) {
        if (targetElement) {
            targetElement.classList.remove("lda-merge-highlight");
        }
        showDiffModal = false; // Ensure modal is closed
        try {
            console.log(
                "[MergeControls] Accepting merge for block:",
                blockUuid,
            );

            // If we have specific content from the modal (3-way merge edit), use it.
            // Otherwise fall back to optimistic (current block content).
            if (
                event &&
                event.detail &&
                typeof event.detail.content === "string"
            ) {
                console.log(
                    "[MergeControls] Updating block with edited content.",
                );

                let finalContent = event.detail.content;

                // Restore hidden header if exists
                if (hiddenHeader) {
                    // Check if there is already a property block start?
                    // Usually just prepend.
                    if (finalContent.startsWith("\n")) {
                        finalContent = hiddenHeader + finalContent;
                    } else {
                        finalContent = hiddenHeader + "\n" + finalContent;
                    }
                }

                await logseq.Editor.updateBlock(blockUuid, finalContent);
            } else {
                // If optimistic? We should also probably respect hidden header?
                // But optimistic means "keep what is in block". The block already has the properties?
                // No, "Optimistic" meant "Remove property only".
                // But in this logic, we fetched content, striped it, showed it in editor.
                // If user accepts "current", they are accepting the STRIPPED content if they didn't edit?
                // Wait. `handleAccept` without event means "Keep what is currently in the block" (Optimistic).
                // In that case, we change nothing in the block, so properties remain.
            }

            // Remove the backup/merge property
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

    async function handleDiff(e?: MouseEvent) {
        if (e) {
            e.stopPropagation();
            e.preventDefault();
        }

        // Fetch live content before opening
        try {
            // We need to get the whole block, content is property of block
            const block = await logseq.Editor.getBlock(blockUuid);
            if (block && block.content) {
                const fullContent = block.content;

                // Get settings
                const settings = (logseq.settings as any) || {};
                const patternsRaw =
                    (settings["mergeFilterPatterns"] as string) ||
                    "logseq-doc-agent.*";
                const patterns = patternsRaw
                    .split("\n")
                    .filter((s) => s.trim().length > 0);

                const [cleanContent, header] = filterProperties(
                    fullContent,
                    patterns,
                );

                mergeData.currentContent = cleanContent;
                hiddenHeader = header;

                // Also filter newContent? AI proposal might INCLUDE properties if it was trained to?
                // Usually AI only returns content. But if it did, we might want to strip there too?
                // Let's strip newContent too just in case it duplicates system properties.
                const [cleanNew, _] = filterProperties(
                    mergeData.newContent,
                    patterns,
                );
                mergeData.newContent = cleanNew;

                // Filter original?
                if (mergeData.originalContent) {
                    const [cleanOriginal, _] = filterProperties(
                        mergeData.originalContent,
                        patterns,
                    );
                    mergeData.originalContent = cleanOriginal;
                }
            }
        } catch (err) {
            console.error("[MergeControls] Failed to fetch live content:", err);
            // Fallback to newContent if fetch fails? Or just empty?
            if (!mergeData.currentContent) {
                mergeData.currentContent = mergeData.newContent || "";
            }
        }

        console.log("[MergeControls] Diff clicked. Opening modal.");
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
    on:close={() => (showDiffModal = false)}
    on:accept={handleAccept}
    on:revert={handleRevert}
/>
