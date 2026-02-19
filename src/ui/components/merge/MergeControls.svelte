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
    import { ICONS } from "../../icons";
    import DiffModal from "./DiffModal.svelte";

    let {
        blockUuid,
        mergeData,
        mode = "block", // 'block' | 'selection'
    }: {
        blockUuid?: string; // Optional in selection mode
        mergeData?: MergeEntity; // Optional in selection mode
        mode?: "block" | "selection";
    } = $props();

    const dispatch = createEventDispatcher();
    // Services only needed for block mode
    const mergeTreeService =
        mode === "block" ? new MergeTreeService() : (null as any);
    const mergeActionService =
        mode === "block" ? new MergeActionService() : (null as any);

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

        // Diff always shows children (for preview/comparison)
        // Accept and Revert only show if Shift is pressed (destructive batch actions)
        const shouldShow = hoveredAction === "diff" || shiftPressed;

        if (shouldShow) {
            blockContainer.classList.add(className);
            if (persistTimeout) clearTimeout(persistTimeout);
        } else {
            blockContainer.classList.remove(className);
        }
    }

    function handleKeyChange(e: KeyboardEvent) {
        // Only handle if hovering OR if we have focus within the controls
        const doc = controlsDiv?.ownerDocument || document;
        const hasFocus = controlsDiv && controlsDiv.contains(doc.activeElement);
        if (!isHovering && !hasFocus) return;

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
        if (targetElement) {
            // Re-apply highlight just in case (e.g. lost due to re-render)
            // Although BlockDiffMarker cleanup logic should be robust
        }

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
        targetDoc.addEventListener("keydown", handleGlobalKeydown);
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
        }, 500);

        const targetDoc = parent?.document || document;
        targetDoc.removeEventListener("keydown", handleGlobalKeydown);
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
        if (mode === "selection") return;

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
                if (mergeData && mergeData.type === "add") {
                    targetElement.classList.add("lda-merge-type-add");
                } else if (mergeData && mergeData.type === "delete") {
                    targetElement.classList.add("lda-merge-type-delete");
                } else if (mergeData && mergeData.type === "update") {
                }
            }
        }

        // Register custom event listener for Logseq command
        // The command dispatches 'lda-focus-merge-controls' on the block element (div[blockid="..."])
        const blockDivForFocus = targetElement?.closest("div[blockid]");
        if (blockDivForFocus) {
            blockDivForFocus.addEventListener(
                "lda-focus-merge-controls",
                handleFocusCommand,
            );
        }

        // Modifiers: Listen globally to show recursive feedback
        // We can keep these, but maybe scope them?
        // Let's stick to the previous logic of attaching when needed, OR just keep global for simplicity of feedback
        window.addEventListener("keydown", handleGlobalKeydown, true);
        window.addEventListener("keyup", handleKeyChange, true);

        if (parent && parent !== window) {
            try {
                parent.document.addEventListener(
                    "keyup",
                    handleKeyChange,
                    true,
                );
                parent.document.addEventListener(
                    "keydown",
                    handleGlobalKeydown,
                    true,
                );
            } catch (e) {}
        }
    });

    onDestroy(() => {
        const blockDivForFocus = targetElement?.closest("div[blockid]");
        if (blockDivForFocus) {
            blockDivForFocus.removeEventListener(
                "lda-focus-merge-controls",
                handleFocusCommand,
            );
        }

        window.removeEventListener("keydown", handleGlobalKeydown, true);
        window.removeEventListener("keyup", handleKeyChange, true);

        if (parent && parent !== window) {
            try {
                parent.document.removeEventListener(
                    "keyup",
                    handleKeyChange,
                    true,
                );
                parent.document.removeEventListener(
                    "keydown",
                    handleGlobalKeydown,
                    true,
                );
            } catch (e) {}
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

    function handleFocusCommand(e: Event) {
        // e is CustomEvent
        console.log(`[MergeControls] Focus command received for ${blockUuid}`);
        e.stopPropagation();
        focusControls();
    }

    function handleGlobalKeydown(e: KeyboardEvent) {
        // 1. Safety check: Don't intercept 'm' if typing - actually not needed for navigation but good practice
        // 'm' command is now handled by Logseq via custom event

        // 2. Handle Navigation when focused inside controls
        // Use ownerDocument to get the correct context (parent vs iframe)
        const doc = controlsDiv?.ownerDocument || document;
        const activeEl = doc.activeElement as HTMLElement;

        if (controlsDiv && controlsDiv.contains(activeEl)) {
            if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                e.preventDefault();
                e.stopPropagation();
                // prevent Logseq defaults (e.g. edit)
                e.stopImmediatePropagation();

                const buttons = Array.from(
                    controlsDiv.querySelectorAll("button:not([disabled])"),
                ) as HTMLButtonElement[];
                // Handle nested focus by finding closest button
                const activeBtn = activeEl.closest("button");
                const currentIndex = buttons.indexOf(
                    activeBtn as HTMLButtonElement,
                );

                console.log(
                    `[MergeControls] Nav Key: ${e.key}, Current Index: ${currentIndex}, Total Buttons: ${buttons.length}`,
                );

                let nextIndex;
                if (currentIndex === -1) {
                    // Reset to first button if focus is lost/unknown
                    nextIndex = 0;
                } else if (e.key === "ArrowRight") {
                    nextIndex = (currentIndex + 1) % buttons.length;
                } else {
                    nextIndex =
                        (currentIndex - 1 + buttons.length) % buttons.length;
                }

                console.log(`[MergeControls] Focusing Index: ${nextIndex}`);
                buttons[nextIndex]?.focus();
                return;
            } else if (e.key === "Enter") {
                // Trigger click on focused button
                if (activeEl instanceof HTMLButtonElement) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    console.log(
                        `[MergeControls] Enter pressed on ${activeEl.className}`,
                    );

                    // specific construction to pass modifiers
                    const mouseEvent = new MouseEvent("click", {
                        bubbles: true,
                        cancelable: true,
                        view: window,
                        shiftKey: e.shiftKey,
                        ctrlKey: e.ctrlKey,
                        metaKey: e.metaKey,
                        altKey: e.altKey,
                    });
                    activeEl.dispatchEvent(mouseEvent);
                }
                return;
            } else if (e.key === "Escape") {
                if (activeEl) {
                    activeEl.blur();
                    // Optional: Try to focus the block content back?
                    // const blockContent = targetElement?.closest('.ls-block')?.querySelector('.block-content');
                    // if (blockContent instanceof HTMLElement) blockContent.focus();
                }
                return;
            }
        }

        // Also forward to handleKeyChange for modifiers
        handleKeyChange(e);
    }

    function focusControls() {
        if (controlsDiv) {
            // Focus the first button (Accept)
            const firstBtn = controlsDiv.querySelector(
                ".lda-merge-accept",
            ) as HTMLElement;
            if (firstBtn) firstBtn.focus();
        }
    }

    // handleNavKeydown removed in favor of handleGlobalKeydown (capture phase)

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
            if (mergeData && mergeData.type === "delete") {
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

        if (mode === "selection") {
            dispatch("accept");
            return;
        }

        if (targetElement) {
            targetElement.classList.remove(
                "lda-merge-highlight",
                "lda-merge-type-add",
                "lda-merge-type-delete",
            );
        }

        try {
            // Handle DELETE type specially
            if (mergeData && mergeData.type === "delete") {
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

    async function handleRevert(e?: MouseEvent) {
        if (e && mode === "selection") {
            e.stopPropagation();
            e.preventDefault();
            dispatch("revert");
            return;
        }
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

            // Check modifiers for recursion
            const withChildren = e
                ? e.shiftKey || e.ctrlKey || e.metaKey
                : false;

            if (withChildren) {
                console.log("[MergeControls] Revert WITH children");
                await mergeActionService.revertMergeWithChildren(blockUuid);
                await logseq.UI.showMsg(
                    "Reverted block and children",
                    "success",
                );
            } else {
                const uuids =
                    mergeTree.length > 0
                        ? mergeTree.map((i) => i.uuid)
                        : [blockUuid];

                await mergeActionService.revertMerge(uuids);
            }
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

    /**
     * Manual click action to ensure events are caught even when portaled to
     * a different document (e.g. Logseq Main Window vs Plugin Iframe).
     * Svelte's delegated events often fail in these cross-context scenarios.
     */
    function clickAction(node: HTMLElement, fn: (e: MouseEvent) => void) {
        const handler = (e: MouseEvent) => {
            // e.preventDefault(); // Optional, depending on button type
            // e.stopPropagation(); // Let caller handle prop check if needed, or do it here?
            // Usually we want to stop propagation for tools.
            fn(e);
        };
        node.addEventListener("click", handler);
        return {
            destroy() {
                node.removeEventListener("click", handler);
            },
        };
    }
</script>

<div
    class="lda-merge-controls"
    style={mode === "selection"
        ? "display: inline-flex; opacity: 1; transform: none;"
        : ""}
    role="group"
    bind:this={controlsDiv}
    onmouseenter={(e) => handleMouseEnter(e)}
    onmouseleave={handleMouseLeave}
>
    <!-- Normal Interactive Controls -->
    <button
        class="lda-merge-btn lda-merge-accept"
        use:clickAction={handleQuickAccept}
        onmouseenter={(e) => handleActionHover("accept", true, e)}
        onmouseleave={() => handleActionHover("accept", false)}
        onfocus={(e) => handleActionHover("accept", true, e as any)}
        onblur={() => handleActionHover("accept", false)}
        title="Accept Merge - Press Shift to also accept all child blocks."
    >
        ✓
    </button>
    {#if mode === "block"}
        <button
            class="lda-merge-btn lda-merge-diff"
            use:clickAction={handleDiff}
            onmouseenter={(e) => handleActionHover("diff", true, e)}
            onmouseleave={() => handleActionHover("diff", false)}
            onfocus={(e) => handleActionHover("diff", true, e as any)}
            onblur={() => handleActionHover("diff", false)}
            title="Show Diff for this block and its children."
        >
            <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
            >
                {@html ICONS.merge}
            </svg>
        </button>
    {/if}
    <button
        class="lda-merge-btn lda-merge-revert"
        use:clickAction={handleRevert}
        onmouseenter={(e) => handleActionHover("revert", true, e)}
        onmouseleave={() => handleActionHover("revert", false)}
        onfocus={(e) => handleActionHover("revert", true, e as any)}
        onblur={() => handleActionHover("revert", false)}
        title="Discard Merge - Press Shift to also revert all child blocks."
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
        use:clickAction={handleQuickAccept}
        title="Accept (Preview)">✓</button
    >
    <button
        class="lda-merge-btn lda-merge-diff"
        use:clickAction={handleDiff}
        title="Diff (Preview)"
    >
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
        >
            {@html ICONS.merge}
        </svg>
    </button>
    <button
        class="lda-merge-btn lda-merge-revert"
        use:clickAction={(e) => handleRevert(e)}
        title="Revert (Preview)">✗</button
    >
</div>

<DiffModal
    isOpen={showDiffModal}
    {mergeData}
    {mergeTree}
    on:close={() => (showDiffModal = false)}
    on:accept={handleAccept}
    on:revert={() => handleRevert()}
/>
