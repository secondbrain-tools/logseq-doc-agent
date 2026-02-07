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
    import { Services } from "../../../services";
    import DiffModal from "./DiffModal.svelte";

    let {
        blockUuid,
        mergeData,
    }: { blockUuid: string; mergeData: MergeEntity } = $props();

    const dispatch = createEventDispatcher();
    const mergeTreeService = new MergeTreeService();
    const mergeActionService = new MergeActionService();

    let targetElement: HTMLElement | null = null;
    let controlsDiv: HTMLElement;
    let showDiffModal = $state(false);

    // Tree state
    let mergeTree: MergeTreeItem[] = $state([]);

    /**
     * Refresh merge controls injection after any merge action
     */
    async function refreshInjection() {
        // Small delay to let Logseq update the DOM
        await new Promise((resolve) => setTimeout(resolve, 100));
        Services.instance.injectMergesUseCase.execute();
    }

    let isHovering = false;

    function toggleReveal(shouldReveal: boolean) {
        if (!targetElement) return;
        const blockContainer = targetElement.closest(".ls-block");

        if (blockContainer) {
            if (shouldReveal) {
                // Only log if not already there to avoid spam
                if (!blockContainer.classList.contains("lda-reveal-children")) {
                    console.log(`[MergeControls] Reveal ON for ${blockUuid}`);
                }
                blockContainer.classList.add("lda-reveal-children");
            } else {
                if (blockContainer.classList.contains("lda-reveal-children")) {
                    console.log(`[MergeControls] Reveal OFF for ${blockUuid}`);
                }
                blockContainer.classList.remove("lda-reveal-children");
            }
        }
    }

    let hoveredAction: "accept" | "revert" | "diff" | null = null;

    function updateActionPreview(shiftPressed: boolean) {
        if (!targetElement || !hoveredAction) return;

        const blockContainer = targetElement.closest(".ls-block");
        if (!blockContainer) return;

        const className = `lda-action-${hoveredAction}`;

        // Accept always shows children (as requested: "always respects the childs")
        // Others only show if Shift is pressed
        const shouldShow = hoveredAction === "accept" || shiftPressed;

        if (shouldShow) {
            blockContainer.classList.add(className);
            if (persistTimeout) clearTimeout(persistTimeout);
        } else {
            blockContainer.classList.remove(className);
        }
    }

    function handleKeyChange(e: KeyboardEvent) {
        if (!isHovering) return;
        const shouldReveal = e.shiftKey || e.ctrlKey || e.metaKey;
        // console.log(`[MergeControls] Key: ${e.key}, Reveal: ${shouldReveal}`);
        toggleReveal(shouldReveal);

        // Update action preview based on shift state
        updateActionPreview(shouldReveal);
    }

    let persistTimeout: any;

    function handleMouseEnter(e: MouseEvent) {
        // console.log(`[MergeControls] Mouse Enter ${blockUuid}`);
        isHovering = true;

        if (persistTimeout) {
            clearTimeout(persistTimeout);
            persistTimeout = null;
        }

        // Add sticky class immediately
        if (controlsDiv) {
            controlsDiv.classList.add("lda-hover-persist");
        }

        // Check modifiers
        const shouldReveal = e.shiftKey || e.ctrlKey || e.metaKey;
        if (shouldReveal) {
            console.log(`[MergeControls] Immediate reveal (keys held)`);
        }
        toggleReveal(shouldReveal);

        const targetDoc = parent?.document || document;
        targetDoc.addEventListener("keydown", handleKeyChange);
        targetDoc.addEventListener("keyup", handleKeyChange);
    }

    function handleMouseLeave() {
        // console.log(`[MergeControls] Mouse Leave ${blockUuid}`);
        isHovering = false;

        // 5s timeout before hiding
        if (persistTimeout) clearTimeout(persistTimeout);
        persistTimeout = setTimeout(() => {
            if (controlsDiv) {
                controlsDiv.classList.remove("lda-hover-persist");
            }
        }, 5000);

        const targetDoc = parent?.document || document;
        targetDoc.removeEventListener("keydown", handleKeyChange);
        targetDoc.removeEventListener("keyup", handleKeyChange);

        // Ensure general reveal class is removed immediately?
        // Maybe we want to keep it if we are persisting?
        // For now, let's remove reveal immediately to avoid confusion,
        // as the user asked for the *controls* to stay open.
        if (targetElement) {
            const blockContainer = targetElement.closest(".ls-block");
            blockContainer?.classList.remove("lda-reveal-children");
        }
    }

    function handleActionHover(
        action: "accept" | "revert" | "diff",
        isEnter: boolean,
        e?: MouseEvent,
    ) {
        if (!targetElement) return;
        const blockContainer = targetElement.closest(".ls-block");
        if (!blockContainer) return;

        const className = `lda-action-${action}`;

        if (isEnter) {
            hoveredAction = action;
            const isShift = e ? e.shiftKey || e.ctrlKey || e.metaKey : false;
            updateActionPreview(isShift);
        } else {
            // Leave
            blockContainer.classList.remove(className);
            hoveredAction = null;
        }
    }

    onMount(() => {
        const blockDiv = parent.document.querySelector(
            `div[blockid="${blockUuid}"]`,
        );
        if (blockDiv) {
            targetElement = blockDiv.querySelector(".block-main-container");
            if (targetElement) {
                targetElement.classList.add("lda-merge-highlight");

                // Attach listeners to the BLOCK CONTENT so hovering it triggers persistence
                targetElement.addEventListener("mouseenter", handleMouseEnter);
                targetElement.addEventListener("mouseleave", handleMouseLeave);

                // Add type-specific classes
                if (mergeData.type === "add") {
                    targetElement.classList.add("lda-merge-type-add");
                } else if (mergeData.type === "delete") {
                    targetElement.classList.add("lda-merge-type-delete");
                }
            }
        }
    });

    onDestroy(() => {
        window.removeEventListener("keydown", handleKeyChange);
        window.removeEventListener("keyup", handleKeyChange);
        if (parent && parent !== window) {
            try {
                parent.document.removeEventListener("keydown", handleKeyChange);
                parent.document.removeEventListener("keyup", handleKeyChange);
            } catch (e) {
                // Ignore
            }
        }

        if (targetElement) {
            // Remove listeners
            targetElement.removeEventListener("mouseenter", handleMouseEnter);
            targetElement.removeEventListener("mouseleave", handleMouseLeave);

            targetElement.classList.remove(
                "lda-merge-highlight",
                "lda-merge-type-add",
                "lda-merge-type-delete",
            );
            const blockContainer = targetElement.closest(".ls-block");
            blockContainer?.classList.remove("lda-reveal-children");
        }
    });

    async function handleAccept(
        event?: CustomEvent<{
            content?: string;
            treeEdits?: Record<string, string>;
        }>,
    ) {
        if (targetElement) {
            targetElement.classList.remove(
                "lda-merge-highlight",
                "lda-merge-type-add",
                "lda-merge-type-delete",
            );
        }
        showDiffModal = false;
        try {
            console.log(
                "[MergeControls] Accepting merge for block:",
                blockUuid,
            );

            // Handle DELETE type specially for Modal Accept as well
            if (mergeData.type === "delete") {
                console.log(
                    "[MergeControls] Handling DELETE acceptance (via Modal)",
                );
                await mergeActionService.acceptDelete(blockUuid);
                await refreshInjection();
                return;
            }

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
            await refreshInjection();
        } catch (e) {
            console.error("[MergeControls] Failed to accept merge:", e);
            await logseq.UI.showMsg("Failed to accept merge", "error");
        }
    }

    /**
     * Quick accept: removes merge property from current block (or subtree with Shift/Ctrl).
     */
    async function handleQuickAccept(e: MouseEvent) {
        e.stopPropagation();
        e.preventDefault();

        if (targetElement) {
            targetElement.classList.remove(
                "lda-merge-highlight",
                "lda-merge-type-add",
                "lda-merge-type-delete",
            );
        }

        try {
            // Handle DELETE type specially
            if (mergeData.type === "delete") {
                console.log("[MergeControls] Handling DELETE acceptance");
                await mergeActionService.acceptDelete(blockUuid);
                await refreshInjection();
                return;
            }

            const withChildren = e.shiftKey || e.ctrlKey || e.metaKey;

            console.log(
                `[MergeControls] Quick Accept Click. Modifiers: Shift=${e.shiftKey}, Ctrl=${e.ctrlKey}, Meta=${e.metaKey}. WithChildren=${withChildren}`,
            );

            if (withChildren) {
                console.log("[MergeControls] Quick accept WITH children");
                await mergeActionService.quickAcceptWithChildren(blockUuid);
                await logseq.UI.showMsg(
                    "Accepted block and children",
                    "success",
                );
            } else {
                console.log("[MergeControls] Quick accept (single block)");
                await mergeActionService.quickAccept(blockUuid);
            }
            await refreshInjection();
        } catch (e) {
            console.error("[MergeControls] Failed to quick accept:", e);
            await logseq.UI.showMsg("Failed to accept merge", "error");
        }
    }

    async function handleRevert() {
        if (targetElement) {
            targetElement.classList.remove(
                "lda-merge-highlight",
                "lda-merge-type-add",
                "lda-merge-type-delete",
            );
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
            await refreshInjection();
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
                    // For DELETE, the proposed content is empty (removal), regardless of what's currently in the block
                    if (mergeData.type === "delete") {
                        mergeData.currentContent = "";
                    } else {
                        mergeData.currentContent = cleanContent;
                    }

                    // Filter base content (original content before LLM changes)
                    if (mergeData.base) {
                        const [cleanBase, _] = filterProperties(
                            mergeData.base,
                            patterns,
                        );
                        mergeData.base = cleanBase;
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

<div
    class="lda-merge-controls"
    role="group"
    bind:this={controlsDiv}
    onmouseenter={(e) => handleMouseEnter(e)}
    onmouseleave={handleMouseLeave}
>
    <!-- Normal Interactive Controls -->
    <button
        class="lda-merge-btn lda-merge-accept"
        onclick={handleQuickAccept}
        onmouseenter={(e) => handleActionHover("accept", true, e)}
        onmouseleave={() => handleActionHover("accept", false)}
        title="Accept Merge"
    >
        ✓
    </button>
    <button
        class="lda-merge-btn lda-merge-diff"
        onclick={handleDiff}
        onmouseenter={(e) => handleActionHover("diff", true, e)}
        onmouseleave={() => handleActionHover("diff", false)}
        title="Show Diff"
    >
        ↔
    </button>
    <button
        class="lda-merge-btn lda-merge-revert"
        onclick={handleRevert}
        onmouseenter={(e) => handleActionHover("revert", true, e)}
        onmouseleave={() => handleActionHover("revert", false)}
        title="Discard Merge"
    >
        ✗
    </button>
</div>

<!-- Passive Indicator (Single Icon) - Shown during preview/reveal of children -->
<!-- We use the same classes for styling colors, but it's a non-interactive indicator (mostly) -->
<!-- Actually, allowing click on the indicator to trigger the action is good UX! -->
<div class="lda-merge-indicator">
    <button
        class="lda-merge-btn lda-merge-accept"
        onclick={handleQuickAccept}
        title="Accept (Preview)">✓</button
    >
    <button
        class="lda-merge-btn lda-merge-diff"
        onclick={handleDiff}
        title="Diff (Preview)">↔</button
    >
    <button
        class="lda-merge-btn lda-merge-revert"
        onclick={handleRevert}
        title="Revert (Preview)">✗</button
    >
</div>

<DiffModal
    isOpen={showDiffModal}
    {mergeData}
    {mergeTree}
    on:close={() => (showDiffModal = false)}
    on:accept={handleAccept}
    on:revert={handleRevert}
/>
