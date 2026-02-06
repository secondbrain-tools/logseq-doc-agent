<script lang="ts">
    import { MergeActionService } from "../../../application/services/merge-action.service";
    import { Services } from "../../../services";

    let { mergeCount }: { mergeCount: number } = $props();
    let isOpen = $state(false);
    let popupStyle = $state("");

    const mergeActionService = new MergeActionService();

    function toggleMenu(event: MouseEvent) {
        console.log(
            "[PageMergeToolbar] Toggle menu clicked. Current state:",
            isOpen,
        );
        if (!isOpen) {
            // Calculate position for fixed popover to avoid overflow clipping
            const button = event.currentTarget as HTMLElement;
            const rect = button.getBoundingClientRect();
            console.log("[PageMergeToolbar] Button rect:", rect);

            // Perform calculation in Parent Window context
            const win = button.ownerDocument?.defaultView || window;
            const winWidth = win.innerWidth;
            const clientWidth = win.document.documentElement.clientWidth;

            console.log(
                `[PageMergeToolbar] Debug: WinWidth=${winWidth} ClientWidth=${clientWidth} Rect: L=${rect.left} R=${rect.right}`,
            );

            // Strategy: Align Right Edge of Menu with Right Edge of Button
            // (Standard for right-aligned toolbar)
            const menuWidth = 200;
            let leftPos = rect.right - menuWidth;

            // Check if this puts it off-screen to the left or right?
            // "Too wide on left" -> maybe it was sticking out too much?

            // Safety Clamp using clientWidth (viewport without scrollbar)
            const edge = clientWidth || winWidth;

            // If rect.right is larger than edge (e.g. button is under scrollbar?), clamp it
            if (leftPos + menuWidth > edge) {
                leftPos = edge - menuWidth - 5;
            }
            if (leftPos < 5) leftPos = 5;

            // Use fixed positioning with explicit left/top
            popupStyle = `top: ${rect.bottom + 6}px; left: ${leftPos}px; width: ${menuWidth}px;`;

            console.log(
                "[PageMergeToolbar] Calculated popup style (Adaptive):",
                popupStyle,
            );
        }
        isOpen = !isOpen;
        console.log("[PageMergeToolbar] New state:", isOpen);
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

    <!-- Dropdown / Second Row -->
    {#if isOpen}
        <div class="lda-page-merge-toolbar-popover" style={popupStyle}>
            <div class="toolbar-header">
                <span class="merge-count-label">{mergeCount} changes</span>
                <button
                    class="close-btn"
                    onclick={() => (isOpen = false)}
                    title="Close">×</button
                >
            </div>
            <div class="toolbar-actions">
                <button
                    class="lda-toolbar-btn accept-all"
                    onclick={handleAcceptAll}
                    title="Accept all merge changes on this page"
                >
                    ✓ Accept All
                </button>
                <button
                    class="lda-toolbar-btn revert-all"
                    onclick={handleRevertAll}
                    title="Revert all merge changes on this page"
                >
                    ✗ Revert All
                </button>
            </div>
        </div>
    {/if}
</div>

<style>
    .lda-merge-wrapper {
        display: inline-flex;
        align-items: center;
        align-self: center;
        /* Aggressive vertical alignment fix */
        margin-top: -5px;
        height: 24px;
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

    /* Fixed Popover to escape toolbar overflow:hidden */
    .lda-page-merge-toolbar-popover {
        position: fixed;
        width: 200px;
        background: var(--ls-primary-background-color, #fff);
        border: 1px solid var(--ls-border-color, #ddd);
        border-radius: 6px;
        box-shadow:
            0 10px 15px -3px rgba(0, 0, 0, 0.1),
            0 4px 6px -2px rgba(0, 0, 0, 0.05);
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        cursor: default;
        z-index: 99999; /* Ensure on top of everything */
        /* Font scaling reset */
        font-size: 0.9rem;
        line-height: 1.4;
    }

    .toolbar-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid var(--ls-border-color, #eee);
        padding-bottom: 6px;
    }

    .close-btn {
        background: none;
        border: none;
        cursor: pointer;
        font-size: 1.4em;
        line-height: 1;
        color: var(--ls-secondary-text-color, #888);
        padding: 0 4px;
        margin-right: -4px;
    }

    .close-btn:hover {
        color: var(--ls-primary-text-color, #333);
    }

    .toolbar-actions {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .merge-count-label {
        color: var(--ls-secondary-text-color, #666);
        font-weight: 500;
        font-size: 0.9em;
    }

    .lda-toolbar-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 6px 12px;
        border: none;
        border-radius: 4px;
        font-size: 0.9em;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s ease;
        width: 100%;
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
</style>
