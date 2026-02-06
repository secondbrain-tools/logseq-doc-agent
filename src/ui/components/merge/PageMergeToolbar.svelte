<script lang="ts">
    import { MergeActionService } from "../../../application/services/merge-action.service";
    import { Services } from "../../../services";

    let { mergeCount }: { mergeCount: number } = $props();
    let isOpen = $state(false);
    let popupStyle = $state("");

    const mergeActionService = new MergeActionService();

    function toggleMenu(event: MouseEvent) {
        if (!isOpen) {
            const button = event.currentTarget as HTMLElement;
            const rect = button.getBoundingClientRect();
            const doc = button.ownerDocument || document;

            // Find #main-content-container to anchor the menu relative to its right edge
            const mainContainer = doc.getElementById("main-content-container");
            const rightSidebar = doc.getElementById("right-sidebar"); // Check for right sidebar

            let referenceRightEnd = 0;

            if (mainContainer) {
                const containerRect = mainContainer.getBoundingClientRect();
                console.log(
                    "[PageMergeToolbar] MainContainer Rect:",
                    containerRect,
                );
                referenceRightEnd = containerRect.right;
            } else {
                referenceRightEnd = rect.right; // Fallback to button
            }

            // If right sidebar is open and overlaps/bounds the content?
            if (rightSidebar) {
                const rsRect = rightSidebar.getBoundingClientRect();
                if (rsRect.width > 0 && rsRect.left < referenceRightEnd) {
                    console.log(
                        "[PageMergeToolbar] Right Sidebar detected at:",
                        rsRect.left,
                    );
                    // If sidebar interacts with main container space, use its left edge as limit
                    referenceRightEnd = rsRect.left;
                }
            }

            // Switch to RIGHT positioning to support flexible menu width
            // Right Gap = Window Width - Reference Right End + Padding
            const win = doc.defaultView || window;
            const winWidth = win.innerWidth;

            // Gap from window right edge to our anchor point
            // We want the menu's right edge to be at `referenceRightEnd - 10px`
            // So `right` style value = winWidth - (referenceRightEnd - 10)
            // = winWidth - referenceRightEnd + 10

            let rightPos = winWidth - referenceRightEnd + 10;
            if (rightPos < 10) rightPos = 10; // Safety clamp (don't stick off right screen)

            console.log(
                `[PageMergeToolbar] Calculated Right: ${rightPos} (RefRight: ${referenceRightEnd})`,
            );

            popupStyle = `top: ${rect.bottom + 6}px; right: ${rightPos}px; left: auto;`;
            console.log("[PageMergeToolbar] Final Style:", popupStyle);
        }
        isOpen = !isOpen;
    }

    async function refreshInjection() {
        await new Promise((resolve) => setTimeout(resolve, 100));
        Services.instance.injectMergesUseCase.execute();
    }

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
            isOpen = false;
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
            isOpen = false;
            await refreshInjection();
        } catch (e) {
            console.error("[PageMergeToolbar] Failed to revert all:", e);
            await logseq.UI.showMsg("Failed to revert all merges", "error");
        }
    }
</script>

<div class="lda-merge-wrapper">
    <!-- Anchor Token in Pagebar -->
    <button
        class="lda-merge-badge"
        onclick={toggleMenu}
        title="{mergeCount} pending changes. Click to manage."
    >
        <span class="badg-icon">🔀</span>
        {#if mergeCount > 0}
            <span class="badge-count">{mergeCount}</span>
        {/if}
    </button>

    <!-- Dropdown / Horizontal Popover -->
    {#if isOpen}
        <div
            class="lda-page-merge-toolbar-popover horizontal-layout"
            style={popupStyle}
        >
            <span class="merge-count-label"><b>{mergeCount}</b> changes</span>
            <div class="sep"></div>
            <button
                class="lda-toolbar-btn accept-all compact"
                onclick={handleAcceptAll}
                title="Accept All"
            >
                ✓ Accept
            </button>
            <button
                class="lda-toolbar-btn revert-all compact"
                onclick={handleRevertAll}
                title="Revert All"
            >
                ✗ Revert
            </button>
            <button
                class="close-btn-compact"
                onclick={() => (isOpen = false)}
                title="Close">×</button
            >
        </div>
    {/if}
</div>

<style>
    .lda-merge-wrapper {
        display: inline-flex;
        align-items: center;
        align-self: center;
        vertical-align: middle;
    }

    .lda-merge-badge {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 2px 6px; /* Reduced vertical padding */
        background: transparent;
        border: 1px solid transparent;
        border-radius: 4px;
        cursor: pointer;
        color: var(--ls-icon-color, #777);
        font-weight: 600;
        font-size: 0.85rem; /* Fix scaling with rem */
        line-height: 1;
        transition: all 0.2s;
        height: 100%; /* Fill wrapper height */
        margin: 0;
    }

    .lda-merge-badge:hover,
    .lda-merge-badge:active {
        background: var(--ls-tertiary-background-color, #f5f5f5);
        color: var(--ls-primary-text-color);
    }

    /* Make icon size consistent */
    .badg-icon {
        font-size: 1.1em;
    }

    .badge-count {
        background: var(--ls-link-text-color, #106ba3);
        color: white;
        padding: 1px 5px;
        border-radius: 10px;
        font-size: 0.75em;
        font-weight: 700;
        min-width: 14px;
        text-align: center;
    }

    /* Horizontal Popover Style */
    .lda-page-merge-toolbar-popover {
        position: fixed;
        /* Width is auto now, governed by content but approx matched by JS */
        min-width: 250px;
        background: var(--ls-primary-background-color, #fff);
        border: 1px solid var(--ls-border-color, #ddd);
        border-radius: 6px;
        box-shadow:
            0 10px 15px -3px rgba(0, 0, 0, 0.1),
            0 4px 6px -2px rgba(0, 0, 0, 0.05);
        padding: 6px 10px;
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 8px;
        cursor: default;
        z-index: 99999;
        font-size: 0.85rem;
        white-space: nowrap;
    }

    .merge-count-label {
        color: var(--ls-secondary-text-color, #666);
        font-weight: 500;
    }

    .sep {
        width: 1px;
        height: 16px;
        background: var(--ls-border-color, #eee);
        margin: 0 2px;
    }

    .lda-toolbar-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        padding: 4px 8px;
        border: none;
        border-radius: 4px;
        font-size: 0.9em;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease;
        color: white;
    }

    .accept-all {
        background: #22c55e;
    }

    .accept-all:hover {
        background: #16a34a;
    }

    .revert-all {
        background: #ef4444;
    }

    .revert-all:hover {
        background: #dc2626;
    }

    .close-btn-compact {
        background: none;
        border: none;
        color: var(--ls-secondary-text-color, #999);
        font-size: 1.2em;
        cursor: pointer;
        margin-left: auto; /* Push to right? Or just end */
        padding: 0 4px;
        line-height: 1;
    }
    .close-btn-compact:hover {
        color: var(--ls-primary-text-color);
    }
</style>
