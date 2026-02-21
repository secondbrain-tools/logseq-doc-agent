<script lang="ts">
    import type { MergeTreeItem } from "../../../application/services/merge-tree.service";
    import InlineDiff from "./InlineDiff.svelte";
    import PreviewPane from "./PreviewPane.svelte";

    let {
        item,
        showPreview = true,
        isExpanded = true,
        onContentChange,
        onToggle,
        onReplaceRequest,
        currentContent,
    }: {
        item: MergeTreeItem;
        currentContent?: string;
        showPreview?: boolean;
        isExpanded?: boolean;
        onContentChange: (uuid: string, newContent: string) => void;
        onToggle: (uuid: string, recursive: boolean) => void;
        onReplaceRequest?: (
            uuid: string,
            source: "original" | "new",
            subtree: boolean,
        ) => void;
    } = $props();

    let editContent = $state(
        currentContent ?? item.mergeData?.currentContent ?? item.content,
    );
    let headerRef: HTMLElement | undefined = $state();

    // Track the last known external prop value to detect EXTERNAL changes only
    let lastKnownCurrentContent = $state(currentContent);

    // Stable content for diff view to prevent cycles.
    // We want the Diff to be static (Base vs Incoming) while we toggle parts to generate Output.
    let stableUnifiedContent = $state(item.content);

    $effect(() => {
        // Only sync when currentContent changes from OUTSIDE (parent update)
        // NOT when it matches what we just sent via onContentChange
        if (
            currentContent !== undefined &&
            currentContent !== lastKnownCurrentContent
        ) {
            lastKnownCurrentContent = currentContent;
            editContent = currentContent;
            // NOTE: We do NOT update stableUnifiedContent here to preserve the "Original Proposal" view
            // unless the Item ID changes, which tears down component.
        }
    });

    function handleEditorInput() {
        onContentChange(item.uuid, editContent);
    }

    function scrollToView() {
        if (headerRef) {
            // Use a small timeout to let any expansion animation/render start if needed.
            setTimeout(() => {
                headerRef?.scrollIntoView({
                    behavior: "smooth",
                    block: "nearest",
                    inline: "nearest",
                });
            }, 50);
        }
    }
    function handleInteraction(recursive: boolean = false) {
        onToggle(item.uuid, recursive);
        scrollToView();
    }

    function handleLineMerge(content: string) {
        console.log("[TreeDiffItem] handleLineMerge called", content);
        if (editContent && !editContent.endsWith("\n")) {
            editContent += "\n";
        }
        editContent += content;
        onContentChange(item.uuid, editContent);
    }

    function originalClickAction(node: HTMLButtonElement) {
        const handler = (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            onReplaceRequest?.(item.uuid, "original", e.shiftKey);
        };
        node.addEventListener("click", handler);
        return {
            destroy() {
                node.removeEventListener("click", handler);
            },
        };
    }

    function incomingClickAction(node: HTMLButtonElement) {
        const handler = (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            onReplaceRequest?.(item.uuid, "new", e.shiftKey);
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
    class="tree-diff-item"
    style="margin-left: {item.level * 20}px"
    data-block-uuid={item.uuid}
>
    <div class="diff-block">
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
            class="diff-content edit"
            bind:this={headerRef}
            onclick={(e) => {
                const target = e.target as HTMLElement;
                if (
                    target.tagName === "TEXTAREA" ||
                    target.tagName === "INPUT" ||
                    target.isContentEditable
                ) {
                    return;
                }
                if (!window.getSelection()?.toString()) {
                    scrollToView();
                }
            }}
        >
            <!-- Smart Edit Layout: Unified Diff (left) + optional Preview (right) -->
            <div class="smart-row">
                <div
                    class="smart-col smart-input {showPreview
                        ? 'input-with-tools'
                        : ''}"
                >
                    <!-- Word-level Unified Diff (interactive accept/revert) -->
                    <div class="diff-wrapper">
                        <InlineDiff
                            originalContent={item.mergeData?.base ??
                                item.content}
                            modifiedContent={stableUnifiedContent}
                            canToggle={true}
                            {isExpanded}
                            onToggle={(recursive) =>
                                handleInteraction(recursive)}
                            mode="words"
                            onContentChange={(newContent) => {
                                editContent = newContent;
                                onContentChange(item.uuid, newContent);
                            }}
                        />
                    </div>

                    {#if showPreview}
                        <div class="mini-tools">
                            <button
                                class="tool-btn"
                                use:originalClickAction
                                title="Use Original (Shift+Click for subtree)"
                            >
                                ↺
                            </button>
                            <button
                                class="tool-btn"
                                use:incomingClickAction
                                title="Use Incoming (Shift+Click for subtree)"
                            >
                                ⇨
                            </button>
                        </div>
                    {/if}
                </div>
                {#if showPreview}
                    <div class="smart-col smart-output">
                        <PreviewPane
                            content={editContent}
                            originalContent={item.mergeData?.base ??
                                item.content}
                            {isExpanded}
                            canToggle={true}
                            onToggle={(recursive) =>
                                handleInteraction(recursive)}
                        />
                    </div>
                {/if}
            </div>
        </div>
    </div>
</div>

<style>
    .tree-diff-item {
        margin-bottom: 0;
        border-bottom: 1px solid var(--ls-border-color);
        padding-left: 0;
    }

    .diff-block {
        background: var(--ls-primary-background-color);
    }

    .diff-content {
        padding: 0;
    }

    /* Smart Edit Layout */
    .smart-row {
        display: flex;
        width: 100%;
        min-height: 28px;
    }

    .smart-col {
        flex: 1;
        border-right: 1px solid var(--ls-border-color);
        overflow: hidden;
        display: flex;
        flex-direction: column;
    }

    .smart-col:first-child {
        border-left: 1px solid var(--ls-border-color);
    }

    .smart-col:last-child {
        border-right: none;
    }

    .smart-col.smart-output {
        border-right: 1px solid var(--ls-border-color);
    }

    .diff-wrapper {
        padding: 0;
        flex: 1;
        overflow-x: auto;
    }

    .input-with-tools {
        flex-direction: row !important;
    }

    .mini-tools {
        display: flex;
        flex-direction: column;
        width: 28px;
        flex-shrink: 0;
        background: var(--ls-secondary-background-color);
        border-left: 1px solid var(--ls-border-color);
        z-index: 2;
    }

    .tool-btn {
        width: 100%;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: none;
        border-bottom: 1px solid var(--ls-border-color);
        cursor: pointer;
        color: var(--ls-tertiary-text-color);
        transition: all 0.2s;
        font-size: 14px;
        padding: 0;
    }

    .tool-btn:last-child {
        border-bottom: none;
    }

    .tool-btn:hover {
        background: var(--ls-quaternary-background-color);
        color: var(--ls-primary-text-color);
    }

    .tool-btn:active {
        background: var(--ls-link-text-color);
        color: white;
    }
</style>
