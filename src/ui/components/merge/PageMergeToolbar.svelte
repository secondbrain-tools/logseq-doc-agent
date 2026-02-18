<script lang="ts">
    import { MergeActionService } from "../../../application/services/merge-action.service";
    import { Services } from "../../../services";
    import { ICONS } from "../../icons";
    import { fly } from "svelte/transition";
    import type { MergeState } from "../../../application/usecases/merge-state.svelte";
    import { onMount } from "svelte";

    let {
        mergeState,
    }: {
        mergeState: MergeState;
    } = $props();

    // Default isOpen to true on mount. Since we unmount when count is 0,
    // this effectively means "open by default when first appearing".
    let isOpen = $state(true);
    let popupStyle = $state("");
    let buttonRef: HTMLElement | undefined = $state();

    const mergeActionService = new MergeActionService();

    onMount(() => {
        // Add small delay to ensure layout is settled
        setTimeout(() => {
            if (isOpen && buttonRef) {
                updatePosition(buttonRef);
            }
        }, 50);
    });

    // ...

    // Responsive positioning logic
    function updatePosition(button: HTMLElement) {
        const rect = button.getBoundingClientRect();
        const doc = button.ownerDocument || document;
        const mainContainer = doc.getElementById("main-content-container");
        const rightSidebar = doc.getElementById("right-sidebar");

        let referenceRightEnd = 0;

        if (mainContainer) {
            const containerRect = mainContainer.getBoundingClientRect();
            referenceRightEnd = containerRect.right;
        } else {
            referenceRightEnd = rect.right;
        }

        if (rightSidebar) {
            const rsRect = rightSidebar.getBoundingClientRect();
            if (rsRect.width > 0 && rsRect.left < referenceRightEnd) {
                referenceRightEnd = rsRect.left;
            }
        }

        const win = doc.defaultView || window;
        const winWidth = win.innerWidth;
        let rightPos = winWidth - referenceRightEnd + 10;
        if (rightPos < 10) rightPos = 10;

        popupStyle = `top: ${rect.bottom + 6}px; right: ${rightPos}px; left: auto;`;
    }

    function toggleMenu(event: MouseEvent) {
        if (!isOpen) {
            updatePosition(event.currentTarget as HTMLElement);
        }
        isOpen = !isOpen;
    }

    async function refreshInjection() {
        await new Promise((resolve) => setTimeout(resolve, 100));
        Services.instance.injectMergesUseCase.execute();
    }

    // ... handleAcceptAll / handleRevertAll unchanged ...

    async function handleAcceptAll() {
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
                `[PageMergeToolbar] Accepting all ${mergeUuids.length} merge blocks`,
            );

            for (const uuid of mergeUuids) {
                await mergeActionService.quickAccept(uuid);
            }

            await logseq.UI.showMsg(
                `Accepted ${mergeUuids.length} merge blocks`,
                "success",
            );
            // Don't close immediately, let the refresh handle state (count -> 0 -> unmount)
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
</script>

<div class="lda-merge-wrapper">
    <!-- Anchor Token in Pagebar -->
    <button
        class="lda-merge-badge"
        onclick={toggleMenu}
        bind:this={buttonRef}
        title="{mergeState.count} pending changes. Click to manage."
    >
        <span class="badg-icon">
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
        </span>
        {#if mergeState.count > 0}
            <span class="badge-count">{mergeState.count}</span>
        {/if}
    </button>

    <!-- Dropdown / Horizontal Popover -->
    <!-- Dropdown / Horizontal Popover -->
    {#if popupStyle}
        <div
            class="lda-page-merge-toolbar-popover horizontal-layout"
            class:visible={isOpen}
            style={popupStyle}
        >
            <span class="merge-count-label"
                ><b>{mergeState.count}</b> changes</span
            >
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
