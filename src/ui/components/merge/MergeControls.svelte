<script lang="ts">
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
        onAccept,
        onRevert,
    }: {
        blockUuid?: string;
        mergeData?: MergeEntity;
        mode?: "block" | "selection";
        onAccept?: () => void;
        onRevert?: () => void;
    } = $props();

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
    let isHovering = false;
    let hoveredAction: "accept" | "revert" | "diff" | null = null;
    let persistTimeout: ReturnType<typeof setTimeout> | null = null;

    function hasModifier(e: MouseEvent | KeyboardEvent): boolean {
        return e.shiftKey || e.ctrlKey || e.metaKey;
    }

    function removeHighlightClasses() {
        if (!targetElement) return;
        targetElement.classList.remove(
            "lda-merge-highlight",
            "lda-merge-type-add",
            "lda-merge-type-delete",
        );
    }

    function getMergeFilterPatterns(): string[] {
        const settings = (logseq.settings as any) || {};
        const patternsRaw =
            (settings["mergeFilterPatterns"] as string) || "logseq-doc-agent.*";
        return patternsRaw.split("\n").filter((s) => s.trim().length > 0);
    }

    async function refreshInjection() {
        // Small delay to let Logseq update the DOM
        await new Promise((resolve) => setTimeout(resolve, 100));
        Services.instance.injectMergesUseCase.execute();
    }

    function toggleReveal(shouldReveal: boolean) {
        if (!targetElement) return;
        const blockContainer = targetElement.closest(".ls-block");
        if (blockContainer) {
            blockContainer.classList.toggle(
                "lda-reveal-children",
                shouldReveal,
            );
        }
    }

    function updateActionPreview(shiftPressed: boolean) {
        if (!targetElement || !hoveredAction) return;

        const blockContainer = targetElement.closest(".ls-block");
        if (!blockContainer) return;

        const className = `lda-action-${hoveredAction}`;

        // Diff always shows children (for preview/comparison)
        // Accept and Revert only show if Shift is pressed (destructive batch actions)
        const shouldShow = hoveredAction === "diff" || shiftPressed;

        blockContainer.classList.toggle(className, shouldShow);
        if (shouldShow && persistTimeout) {
            clearTimeout(persistTimeout);
        }
    }

    function handleKeyChange(e: KeyboardEvent) {
        const doc = controlsDiv?.ownerDocument || document;
        const hasFocus = controlsDiv && controlsDiv.contains(doc.activeElement);
        if (!isHovering && !hasFocus) return;

        const shouldReveal = hasModifier(e);
        toggleReveal(shouldReveal);
        updateActionPreview(shouldReveal);
    }

    function handleMouseEnter(e: MouseEvent) {
        isHovering = true;

        if (persistTimeout) {
            clearTimeout(persistTimeout);
            persistTimeout = null;
        }

        if (controlsDiv) {
            controlsDiv.classList.add("lda-hover-persist");
        }

        const shouldReveal = hasModifier(e);
        toggleReveal(shouldReveal);

        const targetDoc = parent?.document || document;
        targetDoc.addEventListener("keydown", handleGlobalKeydown);
        targetDoc.addEventListener("keyup", handleKeyChange);
    }

    function handleMouseLeave() {
        isHovering = false;

        if (persistTimeout) clearTimeout(persistTimeout);
        persistTimeout = setTimeout(() => {
            if (controlsDiv) {
                controlsDiv.classList.remove("lda-hover-persist");
            }
        }, 500);

        const targetDoc = parent?.document || document;
        targetDoc.removeEventListener("keydown", handleGlobalKeydown);
        targetDoc.removeEventListener("keyup", handleKeyChange);

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
            updateActionPreview(e ? hasModifier(e) : false);
        } else {
            blockContainer.classList.remove(className);
            hoveredAction = null;
        }
    }

    function setupGlobalListeners() {
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
    }

    function removeGlobalListeners() {
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
                targetElement.addEventListener("mouseenter", handleMouseEnter);
                targetElement.addEventListener("mouseleave", handleMouseLeave);

                if (
                    mergeData &&
                    (mergeData.type === "add" || mergeData.type === "delete")
                ) {
                    targetElement.classList.add(
                        `lda-merge-type-${mergeData.type}`,
                    );
                }
            }
        }

        const blockDivForFocus = targetElement?.closest("div[blockid]");
        if (blockDivForFocus) {
            blockDivForFocus.addEventListener(
                "lda-focus-merge-controls",
                handleFocusCommand,
            );
        }

        setupGlobalListeners();
    });

    onDestroy(() => {
        const blockDivForFocus = targetElement?.closest("div[blockid]");
        if (blockDivForFocus) {
            blockDivForFocus.removeEventListener(
                "lda-focus-merge-controls",
                handleFocusCommand,
            );
        }

        removeGlobalListeners();

        if (targetElement) {
            targetElement.removeEventListener("mouseenter", handleMouseEnter);
            targetElement.removeEventListener("mouseleave", handleMouseLeave);

            removeHighlightClasses();
            const blockContainer = targetElement.closest(".ls-block");
            blockContainer?.classList.remove("lda-reveal-children");
        }
    });

    function handleFocusCommand(e: Event) {
        e.stopPropagation();
        focusControls();
    }

    function handleGlobalKeydown(e: KeyboardEvent) {
        const doc = controlsDiv?.ownerDocument || document;
        const activeEl = doc.activeElement as HTMLElement;

        if (controlsDiv && controlsDiv.contains(activeEl)) {
            if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();

                const buttons = Array.from(
                    controlsDiv.querySelectorAll("button:not([disabled])"),
                ) as HTMLButtonElement[];
                const activeBtn = activeEl.closest("button");
                const currentIndex = buttons.indexOf(
                    activeBtn as HTMLButtonElement,
                );

                let nextIndex = 0;
                if (currentIndex !== -1) {
                    if (e.key === "ArrowRight") {
                        nextIndex = (currentIndex + 1) % buttons.length;
                    } else {
                        nextIndex =
                            (currentIndex - 1 + buttons.length) %
                            buttons.length;
                    }
                }

                buttons[nextIndex]?.focus();
                return;
            } else if (e.key === "Enter") {
                if (activeEl instanceof HTMLButtonElement) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();

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
                }
                return;
            }
        }

        handleKeyChange(e);
    }

    function focusControls() {
        if (controlsDiv) {
            const firstBtn = controlsDiv.querySelector(
                ".lda-merge-accept",
            ) as HTMLElement;
            if (firstBtn) firstBtn.focus();
        }
    }

    async function handleAccept(
        event?: CustomEvent<{
            content?: string;
            treeEdits?: Record<string, string>;
        }>,
    ) {
        removeHighlightClasses();
        showDiffModal = false;

        try {
            if (mergeData && mergeData.type === "delete") {
                await mergeActionService.acceptDelete(blockUuid as string);
                await refreshInjection();
                return;
            }

            const patterns = getMergeFilterPatterns();

            if (event && event.detail && event.detail.treeEdits) {
                await mergeActionService.acceptBatchMerge(
                    event.detail.treeEdits,
                    patterns,
                );
            } else if (
                event &&
                event.detail &&
                typeof event.detail.content === "string"
            ) {
                await mergeActionService.acceptMerge(
                    blockUuid as string,
                    event.detail.content,
                    patterns,
                );
            }

            await refreshInjection();
        } catch (e) {
            console.error("[MergeControls] Failed to accept merge:", e);
            await logseq.UI.showMsg("Failed to accept merge", "error");
        }
    }

    async function handleQuickAccept(e: MouseEvent) {
        e.stopPropagation();
        e.preventDefault();

        if (mode === "selection") {
            if (onAccept) onAccept();
            return;
        }

        removeHighlightClasses();

        try {
            if (mergeData && mergeData.type === "delete") {
                await mergeActionService.acceptDelete(blockUuid as string);
                await refreshInjection();
                return;
            }

            const withChildren = hasModifier(e);

            if (withChildren) {
                await mergeActionService.quickAcceptWithChildren(
                    blockUuid as string,
                );
                await logseq.UI.showMsg(
                    "Accepted block and children",
                    "success",
                );
            } else {
                await mergeActionService.quickAccept(blockUuid as string);
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
            if (onRevert) onRevert();
            return;
        }

        removeHighlightClasses();
        showDiffModal = false;

        try {
            const withChildren = e ? hasModifier(e) : false;

            if (withChildren) {
                await mergeActionService.revertMergeWithChildren(
                    blockUuid as string,
                );
                await logseq.UI.showMsg(
                    "Reverted block and children",
                    "success",
                );
            } else {
                const uuids =
                    mergeTree.length > 0
                        ? mergeTree.map((i) => i.uuid)
                        : [blockUuid as string];

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

        try {
            const patterns = getMergeFilterPatterns();
            const tree = await mergeTreeService.getMergeTree(
                blockUuid as string,
            );

            const processedTree: MergeTreeItem[] = [];

            for (const item of tree) {
                const [cleanContent] = filterProperties(item.content, patterns);
                const mergeDataClone = item.mergeData
                    ? { ...item.mergeData }
                    : undefined;

                if (mergeDataClone) {
                    if (mergeDataClone.type === "delete") {
                        mergeDataClone.currentContent = "";
                    } else {
                        mergeDataClone.currentContent = cleanContent;
                    }

                    if (mergeDataClone.base) {
                        const [cleanBase] = filterProperties(
                            mergeDataClone.base,
                            patterns,
                        );
                        mergeDataClone.base = cleanBase;
                    }
                }

                processedTree.push({
                    ...item,
                    content: cleanContent,
                    mergeData: mergeDataClone,
                });
            }

            mergeTree = processedTree;
        } catch (err) {
            console.error("[MergeControls] Failed to fetch tree:", err);
            mergeTree = [];
        }

        showDiffModal = true;
    }

    function clickAction(node: HTMLElement, fn: (e: MouseEvent) => void) {
        const handler = (e: MouseEvent) => fn(e);
        node.addEventListener("click", handler);
        return {
            destroy() {
                node.removeEventListener("click", handler);
            },
        };
    }
</script>

{#snippet ActionButtons(isIndicator: boolean)}
    <button
        class="lda-merge-btn lda-merge-accept"
        use:clickAction={handleQuickAccept}
        onmouseenter={isIndicator
            ? null
            : (e) => handleActionHover("accept", true, e)}
        onmouseleave={isIndicator
            ? null
            : () => handleActionHover("accept", false)}
        onfocus={isIndicator
            ? null
            : (e) => handleActionHover("accept", true, e as any)}
        onblur={isIndicator ? null : () => handleActionHover("accept", false)}
        title={isIndicator
            ? "Accept (Preview)"
            : "Accept Merge - Press Shift to also accept all child blocks."}
    >
        ✓
    </button>
    {#if mode === "block" || isIndicator}
        <button
            class="lda-merge-btn lda-merge-diff"
            use:clickAction={handleDiff}
            onmouseenter={isIndicator
                ? null
                : (e) => handleActionHover("diff", true, e)}
            onmouseleave={isIndicator
                ? null
                : () => handleActionHover("diff", false)}
            onfocus={isIndicator
                ? null
                : (e) => handleActionHover("diff", true, e as any)}
            onblur={isIndicator ? null : () => handleActionHover("diff", false)}
            title={isIndicator
                ? "Diff (Preview)"
                : "Show Diff for this block and its children."}
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
        use:clickAction={(e) => handleRevert(e)}
        onmouseenter={isIndicator
            ? null
            : (e) => handleActionHover("revert", true, e)}
        onmouseleave={isIndicator
            ? null
            : () => handleActionHover("revert", false)}
        onfocus={isIndicator
            ? null
            : (e) => handleActionHover("revert", true, e as any)}
        onblur={isIndicator ? null : () => handleActionHover("revert", false)}
        title={isIndicator
            ? "Revert (Preview)"
            : "Discard Merge - Press Shift to also revert all child blocks."}
    >
        ✗
    </button>
{/snippet}

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
    {@render ActionButtons(false)}
</div>

<!-- Passive Indicator (Single Icon) - Shown during preview/reveal of children -->
<div class="lda-merge-indicator">
    {@render ActionButtons(true)}
</div>

<DiffModal
    isOpen={showDiffModal}
    {mergeData}
    {mergeTree}
    on:close={() => (showDiffModal = false)}
    on:accept={handleAccept}
    on:revert={() => handleRevert()}
/>
