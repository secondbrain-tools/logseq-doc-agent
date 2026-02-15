<script lang="ts">
    import type { MergeTreeItem } from "../../../application/services/merge-tree.service";
    import SideBySideDiff from "./SideBySideDiff.svelte";
    import InlineDiff from "./InlineDiff.svelte";
    import PreviewPane from "./PreviewPane.svelte";

    let {
        item,
        viewMode = "edit",
        isExpanded = true,
        onContentChange,
        onToggle,
        onFocus,
        onReplaceRequest,
        currentContent,
    }: {
        item: MergeTreeItem;
        currentContent?: string;
        viewMode: "split" | "inline" | "edit" | "output" | "tree" | "unified";
        isExpanded?: boolean;
        onContentChange: (uuid: string, newContent: string) => void;
        onToggle: (uuid: string, recursive: boolean) => void;
        onFocus?: (uuid: string) => void;
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

    // Stable content for Unified Diff view to prevent cycles.
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
    <!-- Unified rendering for both Merge and Context blocks -->
    <div class="diff-block">
        <!-- No Header - Toggle is now inside the Diff Component -->

        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
            class="diff-content {viewMode}"
            bind:this={headerRef}
            onclick={(e) => {
                // Don't interfere with textarea/input interactions
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
            {#if viewMode === "edit"}
                <!-- Smart Edit Layout: Unified Diff (left) + Preview (right) -->
                <div class="smart-row">
                    <div class="smart-col smart-input input-with-tools">
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
                    </div>
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
                </div>
            {:else if viewMode === "output"}
                <!-- Output Only Mode -->
                <div class="smart-col smart-output">
                    {#if isExpanded}
                        <textarea
                            class="result-editor"
                            bind:value={editContent}
                            placeholder="Final content..."
                            onfocus={() => onFocus?.(item.uuid)}
                            oninput={handleEditorInput}
                        ></textarea>
                    {:else}
                        <div
                            class="collapsed-placeholder"
                            onclick={() => handleInteraction()}
                            title="Click to edit"
                        >
                            {editContent.split("\n")[0] || "..."}
                        </div>
                    {/if}
                </div>
            {:else if viewMode === "split"}
                <!-- Side by Side -->
                <SideBySideDiff
                    originalContent={item.mergeData
                        ? item.mergeData.base
                        : item.content}
                    modifiedContent={item.content}
                    showHeaders={false}
                    canToggle={true}
                    {isExpanded}
                    onToggle={() => handleInteraction()}
                />
            {:else if viewMode === "unified"}
                <!-- Unified Word Diff -->
                {console.log("[TreeDiffItem] Rendering Unified Mode", {
                    base: item.mergeData?.base,
                    current: item.content,
                    stable: stableUnifiedContent,
                }) || ""}
                <InlineDiff
                    originalContent={item.mergeData
                        ? item.mergeData.base
                        : item.content}
                    modifiedContent={stableUnifiedContent}
                    canToggle={true}
                    {isExpanded}
                    onToggle={() => handleInteraction()}
                    mode="words"
                    onContentChange={(newContent) => {
                        console.log(
                            "[TreeDiffItem] Unified content change",
                            newContent.length,
                            newContent === item.content
                                ? "(unchanged)"
                                : "(changed)",
                        );
                        editContent = newContent;
                        onContentChange(item.uuid, newContent);
                    }}
                />
            {:else}
                <!-- Inline (Default for others) -->
                <InlineDiff
                    originalContent={item.mergeData
                        ? item.mergeData.base
                        : item.content}
                    modifiedContent={item.content}
                    canToggle={true}
                    {isExpanded}
                    onToggle={() => handleInteraction()}
                />
            {/if}
        </div>
    </div>
</div>

<style>
    .tree-diff-item {
        margin-bottom: 0; /* Remove bottom margin to tightly pack rows */
        border-left: 2px solid var(--ls-guideline-color);
        border-bottom: 1px solid var(--ls-border-color); /* Row separator */
        padding-left: 0; /* Indentation handled by margin-left */
    }

    .diff-block {
        background: var(--ls-primary-background-color);
        /* Remove borders as we use row separator */
    }

    .diff-content {
        padding: 0; /* No padding around diffs for seamless look */
    }

    /* Smart Edit Layout */
    .smart-row {
        display: flex;
        width: 100%;
        min-height: 100px; /* Min height */
    }

    .smart-col {
        flex: 1;
        border-right: 1px solid var(--ls-border-color);
        overflow: hidden;
        display: flex;
        flex-direction: column;
    }

    .smart-col:last-child {
        border-right: none;
    }

    .diff-wrapper {
        padding: 8px;
        flex: 1;
        overflow-x: auto;
    }

    textarea.result-editor {
        /* width: 100%; removed to allow flex sibling */
        height: 100%;
        flex: 1;
        border: none;
        resize: vertical;
        padding: 8px;
        background: var(--ls-primary-background-color);
        color: var(--ls-primary-text-color);
        font-family: monospace;
        min-height: 100px;
        min-width: 0; /* Important for flex */
    }

    .collapsed-placeholder {
        padding: 8px;
        color: var(--ls-tertiary-text-color);
        font-size: 0.9em;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--ls-secondary-background-color);
        height: 100%;
        min-height: 30px;
    }
    .collapsed-placeholder:hover {
        background: var(--ls-tertiary-background-color);
    }

    .collapsed-placeholder:hover {
        background: var(--ls-tertiary-background-color);
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
        z-index: 2; /* Ensure on top of scrollbars if any */
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

    /* Text selection styles for visible highlight in textareas */
    textarea.result-editor::selection {
        background-color: rgba(0, 120, 215, 0.3);
        color: inherit;
    }
    textarea.result-editor::-moz-selection {
        background-color: rgba(0, 120, 215, 0.3);
        color: inherit;
    }
</style>
